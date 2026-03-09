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
from typing import Dict, Any, List, Optional
from datetime import datetime
from botocore.exceptions import ClientError

# Import Indian legal context support
from indian_legal_context import enhance_extraction_with_indian_context

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')

# Bedrock configuration (Requirement 16.3, 16.4)
# Use on-demand inference for cost optimization (as per design doc)
# On-demand saves ~95% during development vs provisioned throughput
# Switch to provisioned throughput only when consistent high volume (>1M tokens/day)
BEDROCK_MODEL_ID = 'anthropic.claude-3-5-sonnet-20241022-v2:0'
BEDROCK_INFERENCE_MODE = 'on-demand'  # 'on-demand' or 'provisioned'

# Bedrock request configuration for optimal performance
BEDROCK_MAX_TOKENS = 4096
BEDROCK_TEMPERATURE = 0.0  # Deterministic output for extraction
BEDROCK_TOP_P = 1.0

# Timeout configuration (Requirement 16.4: Complete AI analysis in < 30 seconds)
BEDROCK_REQUEST_TIMEOUT = 30  # seconds

# AWS clients (lazy initialization)
_bedrock_client = None
_dynamodb = None
_documents_table = None


def get_bedrock_client():
    """
    Get or create Amazon Bedrock client with optimized configuration.
    
    Configures client for on-demand inference mode for cost optimization.
    Requirements: 16.3, 16.4 - Configure Bedrock for optimal performance
    """
    global _bedrock_client
    if _bedrock_client is None:
        # Create Bedrock Runtime client with timeout configuration
        config = boto3.session.Config(
            read_timeout=BEDROCK_REQUEST_TIMEOUT,
            connect_timeout=10,
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        )
        _bedrock_client = boto3.client('bedrock-runtime', config=config)
        logger.info(
            f"Initialized Bedrock client with {BEDROCK_INFERENCE_MODE} inference mode, "
            f"timeout: {BEDROCK_REQUEST_TIMEOUT}s"
        )
    return _bedrock_client


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
        # Get translated text
        translated_text = document_data.get('translatedText', '')
        
        if not translated_text:
            logger.warning(f"No translated text found for document {document_id}")
            update_document_status(document_id, property_id, 'analysis_complete')
            return
        
        # Detect document type
        document_type = detect_document_type(translated_text, document_data)
        logger.info(f"Detected document type: {document_type}")
        
        # Extract structured data based on document type
        if document_type == 'sale_deed':
            extracted_data = extract_sale_deed_data(translated_text, document_id)
        elif document_type == 'mother_deed':
            extracted_data = extract_mother_deed_data(translated_text, document_id)
        elif document_type == 'encumbrance_certificate':
            extracted_data = extract_encumbrance_certificate_data(translated_text, document_id)
        else:
            logger.warning(f"Unknown document type: {document_type}")
            extracted_data = extract_generic_document_data(translated_text, document_id)
        
        # Add document type to extracted data
        extracted_data['document_type'] = document_type
        
        # Enhance with Indian legal context (Requirements 18.1-18.8)
        extracted_data = enhance_extraction_with_indian_context(translated_text, extracted_data)
        
        # Detect inconsistencies (Requirement 6.9)
        inconsistencies = detect_inconsistencies(extracted_data, property_id)
        extracted_data['inconsistencies'] = inconsistencies
        
        # Store extracted data
        store_analysis_results(document_id, property_id, extracted_data)
        
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


def invoke_bedrock_for_extraction(prompt: str, document_id: str) -> Dict[str, Any]:
    """
    Invoke Amazon Bedrock with Claude 3.5 Sonnet for structured data extraction.
    
    Optimized for performance with on-demand inference and timeout handling.
    Requirements: 6.1, 16.3, 16.4 - Complete AI analysis in < 30 seconds
    
    Args:
        prompt: Extraction prompt
        document_id: Document ID for logging
        
    Returns:
        Extracted structured data as dictionary
    """
    logger.info(f"Invoking Bedrock for document {document_id} (mode: {BEDROCK_INFERENCE_MODE})")
    
    bedrock_client = get_bedrock_client()
    start_time = time.time()
    
    try:
        # Prepare request body for Claude 3.5 Sonnet with optimized settings
        request_body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": BEDROCK_MAX_TOKENS,
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": BEDROCK_TEMPERATURE,  # Deterministic output for extraction
            "top_p": BEDROCK_TOP_P
        }
        
        # Invoke Bedrock with on-demand inference (Requirement 16.3, 16.4)
        response = bedrock_client.invoke_model(
            modelId=BEDROCK_MODEL_ID,
            body=json.dumps(request_body)
        )
        
        elapsed_time = time.time() - start_time
        
        # Parse response
        response_body = json.loads(response['body'].read())
        
        # Extract the content from Claude's response
        content = response_body.get('content', [])
        if content and len(content) > 0:
            text_content = content[0].get('text', '{}')
        else:
            text_content = '{}'
        
        # Parse JSON from response
        # Claude might wrap JSON in markdown code blocks, so clean it
        text_content = text_content.strip()
        if text_content.startswith('```json'):
            text_content = text_content[7:]
        if text_content.startswith('```'):
            text_content = text_content[3:]
        if text_content.endswith('```'):
            text_content = text_content[:-3]
        text_content = text_content.strip()
        
        extracted_data = json.loads(text_content)
        
        # Add performance metadata
        extracted_data['_bedrock_metadata'] = {
            'inference_mode': BEDROCK_INFERENCE_MODE,
            'model_id': BEDROCK_MODEL_ID,
            'elapsed_seconds': elapsed_time,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(
            f"Successfully extracted data from document {document_id} "
            f"in {elapsed_time:.2f}s (target: <{BEDROCK_REQUEST_TIMEOUT}s)"
        )
        
        # Warn if approaching timeout threshold
        if elapsed_time > BEDROCK_REQUEST_TIMEOUT * 0.8:
            logger.warning(
                f"Bedrock request took {elapsed_time:.2f}s, "
                f"approaching timeout threshold of {BEDROCK_REQUEST_TIMEOUT}s"
            )
        
        return extracted_data
        
    except ClientError as e:
        elapsed_time = time.time() - start_time
        error_code = e.response.get('Error', {}).get('Code', 'Unknown')
        logger.error(
            f"Bedrock API error after {elapsed_time:.2f}s: {error_code} - {str(e)}"
        )
        raise
    except json.JSONDecodeError as e:
        elapsed_time = time.time() - start_time
        logger.error(
            f"Failed to parse Bedrock response as JSON after {elapsed_time:.2f}s: {str(e)}"
        )
        logger.error(f"Response content: {text_content}")
        raise
    except Exception as e:
        elapsed_time = time.time() - start_time
        logger.error(
            f"Bedrock invocation error after {elapsed_time:.2f}s: {str(e)}",
            exc_info=True
        )
        raise



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



def store_analysis_results(
    document_id: str,
    property_id: str,
    extracted_data: Dict[str, Any]
) -> None:
    """
    Store analysis results in DynamoDB Documents table.
    
    Requirements: 6.10
    
    Args:
        document_id: Document ID
        property_id: Property ID
        extracted_data: Extracted structured data
    """
    logger.info(f"Storing analysis results for document {document_id}")
    
    documents_table = get_documents_table()
    
    # Prepare update expression
    update_expression = """
        SET extractedData = :extracted_data,
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
        ':extracted_data': extracted_data,
        ':analysis_metadata': analysis_metadata,
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
