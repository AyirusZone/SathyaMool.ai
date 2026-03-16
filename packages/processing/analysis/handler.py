"""
Analysis Lambda Function for SatyaMool

This Lambda function is triggered by DynamoDB Streams when documents reach
"translation_complete" status. It uses Amazon Bedrock with Claude 3.5 Sonnet
to extract structured data from documents based on document type.

Supported Document Types:
- Sale Deed: Extracts buyer, seller, date, consideration, Survey_Number, property schedule
- Mother Deed: Extracts original owner, grant date, Survey_Number
- Encumbrance Certificate: Extracts transaction history

Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 18.1, 18.2, 18.3, 18.5, 18.6, 18.7, 18.8
"""

import json
import os
import boto3
import logging
import time
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from datetime import datetime
from decimal import Decimal
from botocore.exceptions import ClientError

# Import Indian legal context support
from indian_legal_context import enhance_extraction_with_indian_context

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')

# Gemini configuration
GEMINI_MODEL = 'gemini-2.0-flash'
GEMINI_API_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent'

# AWS clients (lazy initialization)
_dynamodb = None
_documents_table = None


def get_dynamodb_resource():
    """Get or create DynamoDB resource"""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb')
    return _dynamodb


def get_documents_table():
    """Get or create Documents table"""
    global _documents_table
    if _documents_table is None:
        dynamodb = get_dynamodb_resource()
        _documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)
    return _documents_table


def get_dynamodb_resource():
    """Get or create DynamoDB resource"""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb')
    return _dynamodb


def get_documents_table():
    """Get or create Documents table"""
    global _documents_table
    if _documents_table is None:
        dynamodb = get_dynamodb_resource()
        _documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)
    return _documents_table


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for document analysis.
    
    Triggered by DynamoDB Streams when documents reach "translation_complete" status.
    Filters for documents that need analysis and processes them.
    
    Requirements: 6.1
    
    Args:
        event: DynamoDB Stream event
        context: Lambda context
        
    Returns:
        Response with processing statistics
    """
    logger.info(f"Received DynamoDB Stream event with {len(event.get('Records', []))} records")
    
    processed_count = 0
    skipped_count = 0
    failed_count = 0
    
    for record in event.get('Records', []):
        try:
            # Only process INSERT and MODIFY events
            event_name = record.get('eventName')
            if event_name not in ['INSERT', 'MODIFY']:
                logger.debug(f"Skipping event type: {event_name}")
                skipped_count += 1
                continue
            
            # Get the new image (current state of the item)
            new_image = record.get('dynamodb', {}).get('NewImage', {})
            
            if not new_image:
                logger.warning("No NewImage in DynamoDB Stream record")
                skipped_count += 1
                continue
            
            # Extract document data
            document_data = deserialize_dynamodb_item(new_image)
            
            # Filter for documents with "translation_complete" status
            processing_status = document_data.get('processingStatus')
            if processing_status != 'translation_complete':
                logger.debug(f"Skipping document with status: {processing_status}")
                skipped_count += 1
                continue
            
            # Process the document
            process_analysis(document_data)
            processed_count += 1
            
        except Exception as e:
            logger.error(f"Error processing record: {str(e)}", exc_info=True)
            failed_count += 1
            # Continue processing other records
    
    logger.info(
        f"Analysis processing complete. "
        f"Processed: {processed_count}, Skipped: {skipped_count}, Failed: {failed_count}"
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed_count,
            'skipped': skipped_count,
            'failed': failed_count
        })
    }


def deserialize_dynamodb_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """
    Deserialize DynamoDB Stream item format to regular Python dict.
    
    Args:
        item: DynamoDB Stream item in wire format
        
    Returns:
        Deserialized Python dictionary
    """
    result = {}
    
    for key, value in item.items():
        if 'S' in value:
            result[key] = value['S']
        elif 'N' in value:
            result[key] = float(value['N'])
        elif 'BOOL' in value:
            result[key] = value['BOOL']
        elif 'M' in value:
            result[key] = deserialize_dynamodb_item(value['M'])
        elif 'L' in value:
            result[key] = [deserialize_dynamodb_item({'item': v})['item'] for v in value['L']]
        elif 'NULL' in value:
            result[key] = None
    
    return result


def process_analysis(document_data: Dict[str, Any]) -> None:
    """
    Process AI analysis for a single document.
    
    Detects document type, constructs appropriate prompt, invokes Bedrock,
    and stores extracted structured data.
    
    Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9
    
    Args:
        document_data: Document data from DynamoDB
    """
    document_id = document_data.get('documentId')
    property_id = document_data.get('propertyId')
    
    logger.info(f"Processing analysis for document {document_id}")
    
    # Update status to analysis_processing
    update_document_status(document_id, property_id, 'analysis_processing')
    
    try:
        # Get translated text — prefer stream payload, fall back to DynamoDB fetch
        translated_text = document_data.get('translatedText', '')
        
        if not translated_text:
            # Stream events don't carry large text fields — fetch from DynamoDB
            try:
                documents_table = get_documents_table()
                db_item = documents_table.get_item(
                    Key={'documentId': document_id, 'propertyId': property_id}
                ).get('Item', {})
                translated_text = db_item.get('translatedText', '') or db_item.get('ocrText', '')
            except Exception as fetch_err:
                logger.warning(f"Could not fetch translatedText from DynamoDB: {fetch_err}")
        
        if not translated_text:
            logger.warning(f"No translated text found for document {document_id}")
            update_document_status(document_id, property_id, 'analysis_complete')
            return
        
        # Detect document type
        document_type = detect_document_type(translated_text, document_data)
        logger.info(f"Detected document type: {document_type}")
        
        # Extract structured data based on document type
        try:
            if document_type == 'sale_deed':
                extracted_data = extract_sale_deed_data(translated_text, document_id)
            elif document_type == 'mother_deed':
                extracted_data = extract_mother_deed_data(translated_text, document_id)
            elif document_type == 'encumbrance_certificate':
                extracted_data = extract_encumbrance_certificate_data(translated_text, document_id)
            else:
                logger.warning(f"Unknown document type: {document_type}")
                extracted_data = extract_generic_document_data(translated_text, document_id)
        except Exception as bedrock_err:
            if 'Operation not allowed' in str(bedrock_err):
                logger.warning(f"AI model access not enabled for document {document_id}. Proceeding without AI extraction.")
                extracted_data = {'document_type': document_type, 'bedrock_skipped': True}
            else:
                raise
        
        # Add document type to extracted data
        extracted_data['document_type'] = document_type
        
        # Enhance with Indian legal context (Requirements 18.1-18.8)
        extracted_data = enhance_extraction_with_indian_context(translated_text, extracted_data)
        
        # Detect inconsistencies (Requirement 6.9)
        inconsistencies = detect_inconsistencies(extracted_data, property_id)
        extracted_data['inconsistencies'] = inconsistencies
        
        # Generate document summary (Requirements: 1.1, 1.3)
        if extracted_data.get('bedrock_skipped'):
            document_summary = None
        else:
            document_summary = generate_document_summary(extracted_data, document_id)
        
        # Store extracted data and summary
        store_analysis_results(document_id, property_id, extracted_data, document_summary)
        
        # Update status to analysis_complete (Requirement 3.5, 3.7)
        update_document_status(document_id, property_id, 'analysis_complete')
        
        logger.info(f"Successfully analyzed document {document_id}")
        
    except Exception as e:
        logger.error(f"Error analyzing document {document_id}: {str(e)}", exc_info=True)
        update_document_status(document_id, property_id, 'analysis_failed', str(e))
        raise



def detect_document_type(text: str, document_data: Dict[str, Any]) -> str:
    """
    Detect document type from text content and metadata.
    
    Args:
        text: Document text
        document_data: Document metadata
        
    Returns:
        Document type: 'sale_deed', 'mother_deed', 'encumbrance_certificate', or 'unknown'
    """
    text_lower = text.lower()
    
    # Check for Encumbrance Certificate indicators
    ec_indicators = [
        'encumbrance certificate',
        'encumbrance cert',
        'ec certificate',
        'no encumbrance',
        'transaction history',
        'sub registrar',
        'registration details'
    ]
    if any(indicator in text_lower for indicator in ec_indicators):
        return 'encumbrance_certificate'
    
    # Check for Mother Deed indicators
    mother_deed_indicators = [
        'mother deed',
        'original grant',
        'first owner',
        'grant deed',
        'original title'
    ]
    if any(indicator in text_lower for indicator in mother_deed_indicators):
        return 'mother_deed'
    
    # Check for Sale Deed indicators
    sale_deed_indicators = [
        'sale deed',
        'conveyance deed',
        'transfer deed',
        'buyer',
        'seller',
        'vendee',
        'vendor',
        'sale consideration',
        'purchase price'
    ]
    if any(indicator in text_lower for indicator in sale_deed_indicators):
        return 'sale_deed'
    
    # Default to sale_deed if unclear
    logger.warning(f"Could not definitively determine document type, defaulting to sale_deed")
    return 'sale_deed'



def extract_sale_deed_data(text: str, document_id: str) -> Dict[str, Any]:
    """
    Extract structured data from Sale Deed documents using Claude 3.5 Sonnet.
    
    Extracts: buyer, seller, date, consideration, Survey_Number, property schedule,
    boundaries, measurements, family relationships, and Indian-specific identifiers.
    
    Requirements: 6.2, 6.5, 6.6, 6.8, 18.1, 18.2, 18.3, 18.6, 18.7, 18.8
    
    Args:
        text: Document text
        document_id: Document ID for logging
        
    Returns:
        Extracted structured data
    """
    logger.info(f"Extracting Sale Deed data for document {document_id}")
    
    # Construct prompt for Claude with Indian context
    prompt = f"""You are analyzing an Indian property Sale Deed document. Extract the following information in JSON format:

{{
  "buyer_name": "Full name of the buyer/purchaser/vendee (include S/o, D/o, W/o if present)",
  "seller_name": "Full name of the seller/vendor (include S/o, D/o, W/o if present)",
  "transaction_date": "Date of transaction (extract as-is, will be normalized later)",
  "sale_consideration": "Sale amount/consideration in INR",
  "survey_numbers": ["List of all Survey Numbers, Khata, Patta, Chitta, Adangal, or other property identifiers mentioned"],
  "property_schedule": "Complete property description",
  "boundaries": {{
    "north": "Northern boundary description",
    "south": "Southern boundary description",
    "east": "Eastern boundary description",
    "west": "Western boundary description"
  }},
  "measurements": {{
    "area": "Total area with units",
    "dimensions": "Dimensions if mentioned"
  }},
  "family_relationships": ["Any family relationships mentioned (e.g., 'son of', 'daughter of', 'wife of', 'S/o', 'D/o', 'W/o')"],
  "registration_details": {{
    "registration_number": "Registration number or document number if mentioned",
    "registration_date": "Registration date (extract as-is, will be normalized later)",
    "sub_registrar_office": "Sub-registrar office location",
    "stamp_duty": "Stamp duty amount if mentioned",
    "registration_fee": "Registration fee if mentioned"
  }}
}}

IMPORTANT INSTRUCTIONS:
- Extract ALL property identifiers including Survey Numbers, Khata numbers (Karnataka), Patta numbers (Tamil Nadu), Chitta, Adangal, or any state-specific land record numbers
- Preserve patronymic patterns like S/o (son of), D/o (daughter of), W/o (wife of) in names
- Extract dates in their original format (DD/MM/YYYY, DD-MM-YYYY, etc.) - they will be normalized later
- Look for stamp duty and registration fee amounts in the document
- Extract registration/document numbers carefully

Document text:
{text}

Extract the information accurately. If a field is not found, use null. Extract all property identifiers mentioned in the document."""
    
    # Invoke Bedrock
    extracted_data = invoke_bedrock_for_extraction(prompt, document_id)
    
    return extracted_data



def extract_mother_deed_data(text: str, document_id: str) -> Dict[str, Any]:
    """
    Extract structured data from Mother Deed documents using Claude 3.5 Sonnet.
    
    Extracts: original owner, grant date, Survey_Number, and Indian-specific identifiers.
    
    Requirements: 6.3, 18.1, 18.2, 18.3, 18.6, 18.7, 18.8
    
    Args:
        text: Document text
        document_id: Document ID for logging
        
    Returns:
        Extracted structured data
    """
    logger.info(f"Extracting Mother Deed data for document {document_id}")
    
    # Construct prompt for Claude with Indian context
    prompt = f"""You are analyzing an Indian property Mother Deed document (original grant/title document). Extract the following information in JSON format:

{{
  "original_owner_name": "Full name of the original owner/grantee (include S/o, D/o, W/o if present)",
  "grant_date": "Date of original grant (extract as-is, will be normalized later)",
  "survey_numbers": ["List of all Survey Numbers, Khata, Patta, Chitta, Adangal, or other property identifiers mentioned"],
  "property_schedule": "Complete property description",
  "grant_authority": "Authority that granted the property (if mentioned)",
  "boundaries": {{
    "north": "Northern boundary description",
    "south": "Southern boundary description",
    "east": "Eastern boundary description",
    "west": "Western boundary description"
  }},
  "measurements": {{
    "area": "Total area with units",
    "dimensions": "Dimensions if mentioned"
  }},
  "registration_details": {{
    "registration_number": "Registration number or document number if mentioned",
    "registration_date": "Registration date (extract as-is, will be normalized later)",
    "sub_registrar_office": "Sub-registrar office location",
    "stamp_duty": "Stamp duty amount if mentioned",
    "registration_fee": "Registration fee if mentioned"
  }}
}}

IMPORTANT INSTRUCTIONS:
- Extract ALL property identifiers including Survey Numbers, Khata numbers (Karnataka), Patta numbers (Tamil Nadu), Chitta, Adangal, or any state-specific land record numbers
- Preserve patronymic patterns like S/o (son of), D/o (daughter of), W/o (wife of) in names
- Extract dates in their original format (DD/MM/YYYY, DD-MM-YYYY, etc.) - they will be normalized later
- Look for stamp duty and registration fee amounts in the document

Document text:
{text}

Extract the information accurately. If a field is not found, use null. This is the root document of the ownership chain."""
    
    # Invoke Bedrock
    extracted_data = invoke_bedrock_for_extraction(prompt, document_id)
    
    # Mark as Mother Deed
    extracted_data['is_mother_deed'] = True
    
    return extracted_data



def extract_encumbrance_certificate_data(text: str, document_id: str) -> Dict[str, Any]:
    """
    Extract structured data from Encumbrance Certificate documents using Claude 3.5 Sonnet.
    
    Extracts: transaction history with dates and parties, and Indian-specific identifiers.
    
    Requirements: 6.4, 18.1, 18.2, 18.3, 18.7, 18.8
    
    Args:
        text: Document text
        document_id: Document ID for logging
        
    Returns:
        Extracted structured data
    """
    logger.info(f"Extracting Encumbrance Certificate data for document {document_id}")
    
    # Construct prompt for Claude with Indian context
    prompt = f"""You are analyzing an Indian Encumbrance Certificate document. Extract the following information in JSON format:

{{
  "survey_numbers": ["List of all Survey Numbers, Khata, Patta, Chitta, Adangal, or other property identifiers mentioned"],
  "certificate_period": {{
    "from_date": "Start date of EC period (extract as-is, will be normalized later)",
    "to_date": "End date of EC period (extract as-is, will be normalized later)"
  }},
  "transactions": [
    {{
      "transaction_date": "Date (extract as-is, will be normalized later)",
      "document_number": "Registration/document number",
      "transaction_type": "Type (Sale, Mortgage, Lease, etc.)",
      "parties": {{
        "from": "Party transferring/mortgaging",
        "to": "Party receiving/mortgagee"
      }},
      "consideration": "Amount if mentioned",
      "stamp_duty": "Stamp duty if mentioned",
      "remarks": "Any additional remarks"
    }}
  ],
  "sub_registrar_office": "Sub-registrar office that issued the certificate",
  "issue_date": "Date EC was issued (extract as-is, will be normalized later)",
  "encumbrance_status": "Status (No Encumbrance, Encumbrances Found, etc.)"
}}

IMPORTANT INSTRUCTIONS:
- Extract ALL property identifiers including Survey Numbers, Khata numbers (Karnataka), Patta numbers (Tamil Nadu), Chitta, Adangal, or any state-specific land record numbers
- Extract dates in their original format (DD/MM/YYYY, DD-MM-YYYY, etc.) - they will be normalized later
- Look for stamp duty amounts in transaction entries
- Parse the tabular transaction history carefully

Document text:
{text}

Extract all transaction entries from the certificate. If a field is not found, use null. Extract all property identifiers mentioned in the document."""
    
    # Invoke Bedrock
    extracted_data = invoke_bedrock_for_extraction(prompt, document_id)
    
    return extracted_data



def extract_generic_document_data(text: str, document_id: str) -> Dict[str, Any]:
    """
    Extract generic structured data from unknown document types.
    
    Args:
        text: Document text
        document_id: Document ID for logging
        
    Returns:
        Extracted structured data
    """
    logger.info(f"Extracting generic document data for document {document_id}")
    
    # Construct prompt for Claude
    prompt = f"""You are analyzing an Indian property document. Extract the following information in JSON format:

{{
  "parties": ["Names of all parties mentioned"],
  "dates": ["All dates mentioned in ISO 8601 format (YYYY-MM-DD)"],
  "survey_numbers": ["List of all Survey Numbers mentioned"],
  "property_description": "Property description if mentioned",
  "amounts": ["Any monetary amounts mentioned"],
  "document_purpose": "Purpose or type of document"
}}

Document text:
{text}

Extract the information accurately. If a field is not found, use null or empty array. For dates, convert to ISO 8601 format (YYYY-MM-DD)."""
    
    # Invoke Bedrock
    extracted_data = invoke_bedrock_for_extraction(prompt, document_id)
    
    return extracted_data


def invoke_gemini_for_extraction(prompt: str, document_id: str) -> Dict[str, Any]:
    """
    Invoke Google Gemini API for structured data extraction.
    Uses urllib (stdlib only, no extra packages needed in Lambda).
    Retries on 429 rate-limit errors with exponential backoff.
    """
    logger.info(f"Invoking Gemini for document {document_id}")
    start_time = time.time()

    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY environment variable not set")

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 4096,
        }
    }

    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
    data = json.dumps(payload).encode('utf-8')

    max_retries = 3
    for attempt in range(max_retries):
        req = urllib.request.Request(
            url,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        try:
            with urllib.request.urlopen(req, timeout=55) as resp:
                response_body = json.loads(resp.read().decode('utf-8'))
            break  # success
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            if e.code == 429 and attempt < max_retries - 1:
                wait = 45 * (attempt + 1)
                logger.warning(f"Gemini rate limited (429), retrying in {wait}s (attempt {attempt+1}/{max_retries})")
                time.sleep(wait)
                continue
            logger.error(f"Gemini HTTP error {e.code}: {error_body}")
            raise Exception(f"Gemini API error {e.code}: {error_body}")
    else:
        raise Exception("Gemini API failed after all retries")

    elapsed = time.time() - start_time

    # Extract text from Gemini response
    try:
        text_content = response_body['candidates'][0]['content']['parts'][0]['text']
    except (KeyError, IndexError) as e:
        raise Exception(f"Unexpected Gemini response structure: {response_body}")

    # Strip markdown code fences if present
    text_content = text_content.strip()
    if text_content.startswith('```json'):
        text_content = text_content[7:]
    if text_content.startswith('```'):
        text_content = text_content[3:]
    if text_content.endswith('```'):
        text_content = text_content[:-3]
    text_content = text_content.strip()

    try:
        extracted_data = json.loads(text_content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini JSON response: {text_content[:500]}")
        raise Exception(f"Gemini returned non-JSON: {str(e)}")

    extracted_data['_ai_metadata'] = {
        'provider': 'gemini',
        'model': GEMINI_MODEL,
        'elapsed_seconds': round(elapsed, 2),
        'timestamp': datetime.utcnow().isoformat()
    }

    logger.info(f"Gemini extraction complete for {document_id} in {elapsed:.2f}s")
    return extracted_data


# Alias so all callers work unchanged
def invoke_bedrock_for_extraction(prompt: str, document_id: str) -> Dict[str, Any]:
    return invoke_gemini_for_extraction(prompt, document_id)



def generate_document_summary(
    extracted_data: Dict[str, Any],
    document_id: str
) -> Optional[str]:
    """
    Generate a plain-English summary of a property document from extracted data.

    Invokes Bedrock with a short prompt and returns the summary string.
    Returns None on any error — does not re-raise.

    Requirements: 1.1, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3

    Args:
        extracted_data: Structured data extracted from the document
        document_id: Document ID for logging

    Returns:
        Summary string on success, None on error
    """
    logger.info(f"Generating document summary for document {document_id}")

    # Build prompt fields
    document_type = extracted_data.get('document_type') or 'not found'
    buyer_name_or_owner = (
        extracted_data.get('buyer_name')
        or extracted_data.get('original_owner_name')
        or 'not found'
    )
    seller_name = extracted_data.get('seller_name') or 'not found'
    survey_numbers_list = extracted_data.get('survey_numbers', [])
    survey_numbers_str = ', '.join(str(s) for s in survey_numbers_list) if survey_numbers_list else 'not found'
    date_str = extracted_data.get('transaction_date') or extracted_data.get('grant_date') or 'not found'
    sale_consideration = extracted_data.get('sale_consideration') or 'not found'

    prompt = f"""You are summarizing an Indian property document for a property verifier.
Based on the following extracted data, write a concise plain-English summary in no more than 300 words.
Do not use legal jargon. For any field that is absent or null, state "not found".

Document Type: {document_type}
Buyer / Purchaser: {buyer_name_or_owner}
Seller / Vendor: {seller_name}
Survey Number(s): {survey_numbers_str}
Transaction / Grant Date: {date_str}
Sale Consideration: {sale_consideration}

Write the summary now:"""

    try:
        url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512}
        }
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            response_body = json.loads(resp.read().decode('utf-8'))
        summary = response_body['candidates'][0]['content']['parts'][0]['text'].strip()
        logger.info(f"Successfully generated summary for document {document_id}")
        return summary
    except (ClientError, Exception) as e:
        logger.warning(f"Failed to generate summary for document {document_id}: {str(e)}")
        return None


def detect_inconsistencies(extracted_data: Dict[str, Any], property_id: str) -> List[Dict[str, Any]]:
    """
    Detect inconsistencies in extracted data compared to other documents for the same property.
    
    Checks for:
    - Survey Number mismatches
    - Name variations
    - Date inconsistencies
    
    Requirements: 6.9
    
    Args:
        extracted_data: Extracted data from current document
        property_id: Property ID to compare with other documents
        
    Returns:
        List of detected inconsistencies
    """
    logger.info(f"Detecting inconsistencies for property {property_id}")
    
    inconsistencies = []
    
    try:
        # Get all documents for this property
        documents_table = get_documents_table()
        
        response = documents_table.query(
            IndexName='propertyId-uploadedAt-index',
            KeyConditionExpression='propertyId = :property_id',
            ExpressionAttributeValues={
                ':property_id': property_id
            }
        )
        
        other_documents = response.get('Items', [])
        
        # Extract Survey Numbers from current document
        current_survey_numbers = extracted_data.get('survey_numbers', [])
        if not current_survey_numbers:
            return inconsistencies
        
        # Compare with other documents
        for doc in other_documents:
            if doc.get('processingStatus') != 'analysis_complete':
                continue
            
            other_extracted_data = doc.get('extractedData', {})
            if not other_extracted_data:
                continue
            
            other_survey_numbers = other_extracted_data.get('survey_numbers', [])
            
            # Check for Survey Number mismatches (Requirement 6.9)
            if other_survey_numbers:
                # Check if there's any overlap
                current_set = set(str(sn).strip() for sn in current_survey_numbers if sn)
                other_set = set(str(sn).strip() for sn in other_survey_numbers if sn)
                
                if current_set and other_set and not current_set.intersection(other_set):
                    inconsistencies.append({
                        'type': 'survey_number_mismatch',
                        'severity': 'high',
                        'description': f"Survey Numbers do not match between documents",
                        'current_values': list(current_set),
                        'other_values': list(other_set),
                        'other_document_id': doc.get('documentId')
                    })
        
        # Check for date inconsistencies within current document
        dates = []
        if 'transaction_date' in extracted_data and extracted_data['transaction_date']:
            dates.append(('transaction_date', extracted_data['transaction_date']))
        if 'grant_date' in extracted_data and extracted_data['grant_date']:
            dates.append(('grant_date', extracted_data['grant_date']))
        if 'registration_details' in extracted_data:
            reg_date = extracted_data['registration_details'].get('registration_date')
            if reg_date:
                dates.append(('registration_date', reg_date))
        
        # Check for illogical date sequences
        if len(dates) >= 2:
            for i, (name1, date1) in enumerate(dates):
                for name2, date2 in dates[i+1:]:
                    if date1 and date2:
                        try:
                            # Simple check: registration should not be before transaction
                            # Check both directions since dates can be in any order
                            if 'registration' in name1 and 'transaction' in name2:
                                if date1 < date2:
                                    inconsistencies.append({
                                        'type': 'date_inconsistency',
                                        'severity': 'medium',
                                        'description': f"Registration date is before transaction date",
                                        'dates': {name1: date1, name2: date2}
                                    })
                            elif 'transaction' in name1 and 'registration' in name2:
                                if date2 < date1:
                                    inconsistencies.append({
                                        'type': 'date_inconsistency',
                                        'severity': 'medium',
                                        'description': f"Registration date is before transaction date",
                                        'dates': {name1: date1, name2: date2}
                                    })
                        except Exception as e:
                            logger.warning(f"Error comparing dates: {str(e)}")
        
        logger.info(f"Detected {len(inconsistencies)} inconsistencies")
        
    except Exception as e:
        logger.error(f"Error detecting inconsistencies: {str(e)}", exc_info=True)
        # Don't fail the entire process if inconsistency detection fails
    
    return inconsistencies



def convert_floats_to_decimal(obj: Any) -> Any:
    """
    Recursively convert all float values to Decimal for DynamoDB compatibility.
    
    Args:
        obj: Object to convert (dict, list, float, or other)
        
    Returns:
        Object with floats converted to Decimal
    """
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: convert_floats_to_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    else:
        return obj


def store_analysis_results(
    document_id: str,
    property_id: str,
    extracted_data: Dict[str, Any],
    document_summary: Optional[str] = None
) -> None:
    """
    Store analysis results in DynamoDB Documents table.
    
    Requirements: 6.10
    
    Args:
        document_id: Document ID
        property_id: Property ID
        extracted_data: Extracted structured data
        document_summary: Plain-English summary of the document, or None
    """
    logger.info(f"Storing analysis results for document {document_id}")
    
    documents_table = get_documents_table()
    
    # Prepare update expression
    update_expression = """
        SET extractedData = :extracted_data,
            documentSummary = :document_summary,
            analysisMetadata = :analysis_metadata,
            updatedAt = :updated_at
    """
    
    # Build analysis metadata
    analysis_metadata = {
        'analysis_timestamp': datetime.utcnow().isoformat(),
        'model_id': BEDROCK_MODEL_ID,
        'document_type': extracted_data.get('document_type', 'unknown'),
        'inconsistencies_count': len(extracted_data.get('inconsistencies', []))
    }
    
    expression_values = {
        ':extracted_data': convert_floats_to_decimal(extracted_data),
        ':document_summary': document_summary,
        ':analysis_metadata': convert_floats_to_decimal(analysis_metadata),
        ':updated_at': datetime.utcnow().isoformat()
    }
    
    # Update document in DynamoDB
    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )
    
    logger.info(f"Analysis results stored successfully for document {document_id}")


def update_document_status(
    document_id: str,
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update document processing status in DynamoDB.
    
    Args:
        document_id: Document ID
        property_id: Property ID
        status: New processing status
        error_message: Optional error message for failed status
    """
    logger.info(f"Updating document {document_id} status to {status}")
    
    documents_table = get_documents_table()
    
    update_expression = "SET processingStatus = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.utcnow().isoformat()
    }
    
    if error_message:
        update_expression += ", errorMessage = :error"
        expression_values[':error'] = error_message
    
    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )
