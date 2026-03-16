"""
Trust Score Calculation Lambda Function for SatyaMool

This Lambda function is triggered when lineage construction completes.
It calculates a Trust Score (0-100) based on:
- Base score for complete chains (80 points)
- Gap penalties (-15 points per gap)
- Inconsistency penalties (-10 points per date inconsistency)
- Survey Number mismatch penalty (-20 points)
- Encumbrance Certificate bonus (+10 points if EC matches)
- Recency bonus (+5 points if all documents < 30 years old)
- Succession bonus (+5 points for documented family succession)

Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10
"""

import json
import os
import boto3
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment variables
LINEAGE_TABLE_NAME = os.environ.get('LINEAGE_TABLE_NAME', 'SatyaMool-Lineage')
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', 'SatyaMool-Documents')
PROPERTIES_TABLE_NAME = os.environ.get('PROPERTIES_TABLE_NAME', 'SatyaMool-Properties')
TRUST_SCORES_TABLE_NAME = os.environ.get('TRUST_SCORES_TABLE_NAME', 'SatyaMool-TrustScores')

# AWS clients (lazy initialization)
_dynamodb = None
_lineage_table = None
_documents_table = None
_properties_table = None
_trust_scores_table = None


def get_dynamodb_resource():
    """Get or create DynamoDB resource"""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb')
    return _dynamodb


def get_lineage_table():
    """Get or create Lineage table"""
    global _lineage_table
    if _lineage_table is None:
        dynamodb = get_dynamodb_resource()
        _lineage_table = dynamodb.Table(LINEAGE_TABLE_NAME)
    return _lineage_table


def get_documents_table():
    """Get or create Documents table"""
    global _documents_table
    if _documents_table is None:
        dynamodb = get_dynamodb_resource()
        _documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)
    return _documents_table


def get_properties_table():
    """Get or create Properties table"""
    global _properties_table
    if _properties_table is None:
        dynamodb = get_dynamodb_resource()
        _properties_table = dynamodb.Table(PROPERTIES_TABLE_NAME)
    return _properties_table


def get_trust_scores_table():
    """Get or create TrustScores table"""
    global _trust_scores_table
    if _trust_scores_table is None:
        dynamodb = get_dynamodb_resource()
        _trust_scores_table = dynamodb.Table(TRUST_SCORES_TABLE_NAME)
    return _trust_scores_table


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main Lambda handler for Trust Score calculation.
    
    Triggered by DynamoDB Streams when lineage construction completes.
    
    Requirements: 8.1
    
    Args:
        event: DynamoDB Stream event
        context: Lambda context
        
    Returns:
        Response with processing statistics
    """
    logger.info(f"Received DynamoDB Stream event with {len(event.get('Records', []))} records")
    
    processed_properties = set()
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
            
            # Extract lineage data
            lineage_data = deserialize_dynamodb_item(new_image)
            
            # Get property ID
            property_id = lineage_data.get('propertyId')
            if not property_id:
                logger.warning("No propertyId in lineage data")
                skipped_count += 1
                continue
            
            # Avoid processing the same property multiple times in this batch
            if property_id not in processed_properties:
                logger.info(f"Calculating Trust Score for property {property_id}")
                calculate_trust_score_for_property(property_id, lineage_data)
                processed_properties.add(property_id)
            else:
                logger.debug(f"Property {property_id} already processed in this batch")
                skipped_count += 1
            
        except Exception as e:
            logger.error(f"Error processing record: {str(e)}", exc_info=True)
            failed_count += 1
            # Continue processing other records
    
    logger.info(
        f"Trust Score calculation complete. "
        f"Properties processed: {len(processed_properties)}, Skipped: {skipped_count}, Failed: {failed_count}"
    )
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'properties_processed': len(processed_properties),
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


def calculate_trust_score_for_property(property_id: str, lineage_data: Dict[str, Any]) -> None:
    """
    Calculate Trust Score for a property.
    
    This is the main orchestration function that:
    1. Guards: checks all documents are lineage_complete before proceeding
    2. Retrieves lineage graph and document metadata
    3. Calculates base score
    4. Applies penalties and bonuses
    5. Clamps score to 0-100
    6. Generates detailed breakdown
    7. Stores results in TrustScores table
    8. Updates each document to scoring_complete and property to completed
    
    Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 3.5, 3.6, 3.8, 4.1, 4.3
    
    Args:
        property_id: Property ID
        lineage_data: Lineage graph data
    """
    logger.info(f"Calculating Trust Score for property {property_id}")

    # Guard: only proceed when all documents are lineage_complete (Requirement 3.8)
    if not check_all_documents_lineage_complete(property_id):
        logger.info(
            f"Not all documents are lineage_complete for property {property_id}, skipping scoring"
        )
        return
    
    try:
        # Retrieve document metadata
        documents = retrieve_property_documents(property_id)
        
        if not documents:
            logger.warning(f"No documents found for property {property_id}")
            return
        
        # Initialize score components
        score_components = []
        total_score = 0
        
        # Calculate base score (Requirement 8.2)
        base_score, base_explanation = calculate_base_score(lineage_data)
        total_score += base_score
        score_components.append({
            'component': 'base_score',
            'value': base_score,
            'explanation': base_explanation
        })
        
        # Apply gap penalty (Requirement 8.3)
        gap_penalty, gap_explanation = calculate_gap_penalty(lineage_data)
        total_score += gap_penalty
        score_components.append({
            'component': 'gap_penalty',
            'value': gap_penalty,
            'explanation': gap_explanation
        })
        
        # Apply inconsistency penalty (Requirement 8.4)
        inconsistency_penalty, inconsistency_explanation = calculate_inconsistency_penalty(documents)
        total_score += inconsistency_penalty
        score_components.append({
            'component': 'inconsistency_penalty',
            'value': inconsistency_penalty,
            'explanation': inconsistency_explanation
        })
        
        # Apply Survey Number mismatch penalty (Requirement 8.5)
        survey_penalty, survey_explanation = calculate_survey_number_penalty(documents)
        total_score += survey_penalty
        score_components.append({
            'component': 'survey_number_penalty',
            'value': survey_penalty,
            'explanation': survey_explanation
        })
        
        # Apply Encumbrance Certificate bonus (Requirement 8.6)
        ec_bonus, ec_explanation = calculate_ec_bonus(documents)
        total_score += ec_bonus
        score_components.append({
            'component': 'ec_bonus',
            'value': ec_bonus,
            'explanation': ec_explanation
        })
        
        # Apply recency bonus (Requirement 8.7)
        recency_bonus, recency_explanation = calculate_recency_bonus(documents)
        total_score += recency_bonus
        score_components.append({
            'component': 'recency_bonus',
            'value': recency_bonus,
            'explanation': recency_explanation
        })
        
        # Apply succession bonus (Requirement 8.8)
        succession_bonus, succession_explanation = calculate_succession_bonus(documents)
        total_score += succession_bonus
        score_components.append({
            'component': 'succession_bonus',
            'value': succession_bonus,
            'explanation': succession_explanation
        })
        
        # Clamp score to 0-100 (Requirement 8.9)
        final_score = max(0, min(100, total_score))
        
        # Generate detailed breakdown (Requirement 8.10)
        score_breakdown = {
            'total_score': final_score,
            'raw_score': total_score,
            'clamped': total_score != final_score,
            'components': score_components,
            'summary': generate_score_summary(final_score, score_components)
        }
        
        # Store Trust Score
        store_trust_score(property_id, final_score, score_breakdown)
        
        # Update property with Trust Score (score only, status handled separately)
        update_property_trust_score(property_id, final_score)

        # Update all documents to scoring_complete and set property to completed (Requirements 3.5, 4.1)
        update_all_documents_status(property_id, 'scoring_complete')
        
        logger.info(f"Trust Score calculated successfully for property {property_id}: {final_score}")
        
    except Exception as e:
        logger.error(f"Error calculating Trust Score for property {property_id}: {str(e)}", exc_info=True)
        # Update all documents to scoring_failed and set property to failed (Requirements 3.6, 4.3)
        update_all_documents_status(property_id, 'scoring_failed', str(e))
        raise


def retrieve_property_documents(property_id: str) -> List[Dict[str, Any]]:
    """
    Retrieve all documents for a property.
    
    Args:
        property_id: Property ID
        
    Returns:
        List of document data
    """
    documents_table = get_documents_table()
    
    response = documents_table.query(
        IndexName='propertyId-uploadedAt-index',
        KeyConditionExpression='propertyId = :property_id',
        ExpressionAttributeValues={
            ':property_id': property_id
        }
    )
    
    documents = response.get('Items', [])
    
    logger.info(f"Retrieved {len(documents)} documents for property {property_id}")
    
    return documents


def calculate_base_score(lineage_data: Dict[str, Any]) -> tuple[int, str]:
    """
    Calculate base score for complete ownership chains.
    
    Requirements: 8.2
    
    Args:
        lineage_data: Lineage graph data
        
    Returns:
        Tuple of (score, explanation)
    """
    gaps = lineage_data.get('gaps', [])
    
    # Check if chain is complete (no gaps)
    if not gaps:
        return (80, "Complete ownership chain with no gaps detected")
    else:
        return (80, f"Base score assigned (chain has {len(gaps)} gaps that will be penalized)")


def calculate_gap_penalty(lineage_data: Dict[str, Any]) -> tuple[int, str]:
    """
    Calculate penalty for gaps in ownership chain.
    
    Requirements: 8.3
    
    Args:
        lineage_data: Lineage graph data
        
    Returns:
        Tuple of (penalty, explanation)
    """
    gaps = lineage_data.get('gaps', [])
    
    if not gaps:
        return (0, "No gaps detected in ownership chain")
    
    # Count gaps (excluding temporal gaps which are less severe)
    critical_gaps = [g for g in gaps if g.get('type') in ['disconnected_chain', 'multiple_terminal_owners']]
    gap_count = len(critical_gaps)
    
    penalty = -15 * gap_count
    
    gap_descriptions = [g.get('description', 'Unknown gap') for g in critical_gaps]
    explanation = f"Deducted {abs(penalty)} points for {gap_count} gap(s): {'; '.join(gap_descriptions)}"
    
    return (penalty, explanation)


def calculate_inconsistency_penalty(documents: List[Dict[str, Any]]) -> tuple[int, str]:
    """
    Calculate penalty for date inconsistencies.
    
    Requirements: 8.4
    
    Args:
        documents: List of documents
        
    Returns:
        Tuple of (penalty, explanation)
    """
    inconsistencies = []
    
    # Extract transaction dates
    transactions = []
    for doc in documents:
        extracted_data = doc.get('extractedData') or {}
        transaction_date = extracted_data.get('transaction_date') or extracted_data.get('grant_date')
        
        if transaction_date:
            date_obj = parse_date_safely(transaction_date)
            if date_obj:
                transactions.append({
                    'date': date_obj,
                    'document_id': doc.get('documentId'),
                    'document_type': extracted_data.get('document_type', 'unknown')
                })
    
    # Sort by date
    transactions.sort(key=lambda x: x['date'])
    
    # Check for illogical sequences and future dates
    for i in range(len(transactions)):
        current = transactions[i]
        
        # Check if dates are in the future
        if current['date'] > datetime.now():
            inconsistencies.append(f"Future date detected in {current['document_type']}")
        
        # Check for same-day transactions (potential inconsistency)
        if i < len(transactions) - 1:
            next_trans = transactions[i + 1]
            if current['date'] == next_trans['date'] and current['document_type'] == next_trans['document_type']:
                inconsistencies.append(f"Multiple {current['document_type']} documents on same date")
    
    # Check for documents with very old dates (before 1900)
    for trans in transactions:
        if trans['date'].year < 1900:
            inconsistencies.append(f"Suspiciously old date in {trans['document_type']}: {trans['date'].year}")
    
    if not inconsistencies:
        return (0, "No date inconsistencies detected")
    
    penalty = -10 * len(inconsistencies)
    explanation = f"Deducted {abs(penalty)} points for {len(inconsistencies)} date inconsistency(ies): {'; '.join(inconsistencies[:3])}"
    
    if len(inconsistencies) > 3:
        explanation += f" and {len(inconsistencies) - 3} more"
    
    return (penalty, explanation)


def calculate_survey_number_penalty(documents: List[Dict[str, Any]]) -> tuple[int, str]:
    """
    Calculate penalty for Survey Number mismatches.
    
    Requirements: 8.5
    
    Args:
        documents: List of documents
        
    Returns:
        Tuple of (penalty, explanation)
    """
    survey_numbers = set()
    
    for doc in documents:
        extracted_data = doc.get('extractedData') or {}
        doc_survey_numbers = extracted_data.get('survey_numbers', [])
        
        if doc_survey_numbers:
            # Normalize survey numbers
            for sn in doc_survey_numbers:
                normalized_sn = normalize_survey_number(sn)
                if normalized_sn:
                    survey_numbers.add(normalized_sn)
    
    if len(survey_numbers) == 0:
        return (0, "No Survey Numbers found in documents")
    
    if len(survey_numbers) == 1:
        return (0, f"All documents reference the same Survey Number: {list(survey_numbers)[0]}")
    
    # Multiple survey numbers indicate mismatch
    penalty = -20
    explanation = f"Deducted {abs(penalty)} points for Survey Number mismatch: Found {len(survey_numbers)} different Survey Numbers ({', '.join(list(survey_numbers)[:3])})"
    
    return (penalty, explanation)


def calculate_ec_bonus(documents: List[Dict[str, Any]]) -> tuple[int, str]:
    """
    Calculate bonus for Encumbrance Certificate verification.
    
    Requirements: 8.6
    
    Args:
        documents: List of documents
        
    Returns:
        Tuple of (bonus, explanation)
    """
    # Find Encumbrance Certificate
    ec_docs = [doc for doc in documents if (doc.get('extractedData') or {}).get('document_type') == 'encumbrance_certificate']
    
    if not ec_docs:
        return (0, "No Encumbrance Certificate provided")
    
    # Find Sale Deeds
    sale_deeds = [doc for doc in documents if (doc.get('extractedData') or {}).get('document_type') == 'sale_deed']
    
    if not sale_deeds:
        return (0, "Encumbrance Certificate provided but no Sale Deeds to verify against")
    
    # Check if EC data matches Sale Deed data
    ec_data = (ec_docs[0].get('extractedData') or {})
    ec_transactions = ec_data.get('transaction_entries', [])
    
    if not ec_transactions:
        return (0, "Encumbrance Certificate provided but contains no transaction entries")
    
    # Simple verification: check if EC has transactions
    # In a real implementation, we would cross-verify dates, parties, and amounts
    matches = 0
    for sale_deed in sale_deeds:
        sale_data = (sale_deed.get('extractedData') or {})
        sale_date = sale_data.get('transaction_date')
        
        for ec_trans in ec_transactions:
            ec_date = ec_trans.get('date')
            if sale_date and ec_date and sale_date == ec_date:
                matches += 1
                break
    
    if matches > 0:
        bonus = 10
        explanation = f"Added {bonus} points for Encumbrance Certificate verification (matched {matches} transaction(s))"
        return (bonus, explanation)
    else:
        return (0, "Encumbrance Certificate provided but no matching transactions found")


def calculate_recency_bonus(documents: List[Dict[str, Any]]) -> tuple[int, str]:
    """
    Calculate bonus for recent documents.
    
    Requirements: 8.7
    
    Args:
        documents: List of documents
        
    Returns:
        Tuple of (bonus, explanation)
    """
    cutoff_date = datetime.now() - timedelta(days=30 * 365)  # 30 years ago
    
    all_recent = True
    oldest_date = None
    
    for doc in documents:
        extracted_data = doc.get('extractedData') or {}
        transaction_date = extracted_data.get('transaction_date') or extracted_data.get('grant_date')
        
        if transaction_date:
            date_obj = parse_date_safely(transaction_date)
            if date_obj:
                if oldest_date is None or date_obj < oldest_date:
                    oldest_date = date_obj
                
                if date_obj < cutoff_date:
                    all_recent = False
    
    if all_recent and oldest_date:
        bonus = 5
        years_old = (datetime.now() - oldest_date).days / 365.25
        explanation = f"Added {bonus} points for recent documents (oldest document is {years_old:.1f} years old)"
        return (bonus, explanation)
    else:
        if oldest_date:
            years_old = (datetime.now() - oldest_date).days / 365.25
            explanation = f"No recency bonus (oldest document is {years_old:.1f} years old, threshold is 30 years)"
        else:
            explanation = "No recency bonus (no document dates found)"
        return (0, explanation)


def calculate_succession_bonus(documents: List[Dict[str, Any]]) -> tuple[int, str]:
    """
    Calculate bonus for documented family succession.
    
    Requirements: 8.8
    
    Args:
        documents: List of documents
        
    Returns:
        Tuple of (bonus, explanation)
    """
    succession_indicators = []
    
    for doc in documents:
        extracted_data = doc.get('extractedData') or {}
        family_relationships = extracted_data.get('family_relationships', [])
        
        # Check for legal heir indicators
        legal_heir_keywords = ['legal heir', 'heir certificate', 'succession certificate', 'will', 'testament']
        
        for relationship in family_relationships:
            relationship_lower = relationship.lower()
            if any(keyword in relationship_lower for keyword in legal_heir_keywords):
                succession_indicators.append(relationship)
    
    if succession_indicators:
        bonus = 5
        explanation = f"Added {bonus} points for documented family succession ({len(succession_indicators)} indicator(s) found)"
        return (bonus, explanation)
    else:
        return (0, "No documented family succession found")


def normalize_survey_number(survey_number: str) -> Optional[str]:
    """
    Normalize Survey Number for comparison.
    
    Args:
        survey_number: Survey Number string
        
    Returns:
        Normalized Survey Number
    """
    if not survey_number:
        return None
    
    # Remove whitespace and convert to lowercase
    normalized = survey_number.strip().lower()
    
    # Remove common prefixes
    prefixes = ['survey no.', 'survey no', 'sy.no.', 'sy.no', 'sy no', 's.no.', 's.no', 's no']
    for prefix in prefixes:
        if normalized.startswith(prefix):
            normalized = normalized[len(prefix):].strip()
    
    # Remove special characters except / and -
    normalized = ''.join(c for c in normalized if c.isalnum() or c in ['/', '-'])
    
    return normalized


def parse_date_safely(date_str: str) -> Optional[datetime]:
    """
    Parse date string safely, handling various formats.
    
    Args:
        date_str: Date string
        
    Returns:
        Datetime object or None if parsing fails
    """
    if not date_str:
        return None
    
    # Try ISO format first
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except:
        pass
    
    # Try common Indian date formats
    formats = [
        '%d/%m/%Y',
        '%d-%m-%Y',
        '%Y-%m-%d',
        '%d.%m.%Y',
        '%d %B %Y',
        '%d %b %Y'
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            continue
    
    logger.warning(f"Could not parse date: {date_str}")
    return None


def generate_score_summary(final_score: int, components: List[Dict[str, Any]]) -> str:
    """
    Generate human-readable summary of Trust Score.
    
    Args:
        final_score: Final Trust Score
        components: Score components
        
    Returns:
        Summary string
    """
    if final_score >= 90:
        rating = "Excellent"
        description = "Property has a very strong title with minimal risk"
    elif final_score >= 75:
        rating = "Good"
        description = "Property has a strong title with low risk"
    elif final_score >= 60:
        rating = "Fair"
        description = "Property has an acceptable title with moderate risk"
    elif final_score >= 40:
        rating = "Poor"
        description = "Property has a weak title with significant risk"
    else:
        rating = "Very Poor"
        description = "Property has a very weak title with high risk"
    
    return f"{rating} ({final_score}/100): {description}"


def store_trust_score(property_id: str, score: int, breakdown: Dict[str, Any]) -> None:
    """
    Store Trust Score in TrustScores table.
    
    Args:
        property_id: Property ID
        score: Final Trust Score
        breakdown: Score breakdown
    """
    logger.info(f"Storing Trust Score for property {property_id}")
    
    trust_scores_table = get_trust_scores_table()
    
    # Prepare trust score item
    trust_score_item = {
        'propertyId': property_id,
        'totalScore': score,
        'scoreBreakdown': breakdown,
        'calculatedAt': datetime.now(timezone.utc).isoformat(),
        'factors': [component['component'] for component in breakdown.get('components', [])]
    }
    
    # Store in DynamoDB
    trust_scores_table.put_item(Item=trust_score_item)
    
    logger.info(f"Trust Score stored successfully for property {property_id}")


def update_property_trust_score(property_id: str, score: int) -> None:
    """
    Update property with Trust Score (score only, status handled separately).
    
    Args:
        property_id: Property ID
        score: Trust Score
    """
    logger.info(f"Updating property {property_id} with Trust Score {score}")
    
    properties_table = get_properties_table()
    
    properties_table.update_item(
        Key={'propertyId': property_id},
        UpdateExpression="SET trustScore = :score, updatedAt = :updated_at",
        ExpressionAttributeValues={
            ':score': score,
            ':updated_at': datetime.now(timezone.utc).isoformat()
        }
    )
    
    logger.info(f"Property Trust Score updated successfully")


def update_property_status(
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update property status in Properties table.

    Args:
        property_id: Property ID
        status: New status
        error_message: Optional error message
    """
    logger.info(f"Updating property {property_id} status to {status}")

    properties_table = get_properties_table()

    update_expression = "SET #status = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.now(timezone.utc).isoformat()
    }
    expression_names = {
        '#status': 'status'
    }

    if error_message:
        update_expression += ", errorMessage = :error_message"
        expression_values[':error_message'] = error_message

    properties_table.update_item(
        Key={'propertyId': property_id},
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values,
        ExpressionAttributeNames=expression_names
    )

    logger.info(f"Property status updated successfully")


def update_document_status(
    document_id: str,
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update a single document's processingStatus in the Documents table.

    Requirements: 3.5, 3.6

    Args:
        document_id: Document ID (partition key)
        property_id: Property ID (sort key)
        status: New processingStatus value
        error_message: Optional error message
    """
    logger.info(f"Updating document {document_id} status to {status}")

    documents_table = get_documents_table()

    update_expression = "SET processingStatus = :status, updatedAt = :updated_at"
    expression_values = {
        ':status': status,
        ':updated_at': datetime.now(timezone.utc).isoformat()
    }

    if error_message:
        update_expression += ", errorMessage = :error_message"
        expression_values[':error_message'] = error_message

    documents_table.update_item(
        Key={
            'documentId': document_id,
            'propertyId': property_id
        },
        UpdateExpression=update_expression,
        ExpressionAttributeValues=expression_values
    )

    logger.info(f"Document {document_id} status updated to {status}")


def update_all_documents_status(
    property_id: str,
    status: str,
    error_message: Optional[str] = None
) -> None:
    """
    Update processingStatus for all documents belonging to a property,
    then update the property status.

    Requirements: 3.5, 3.6, 4.1, 4.3

    Args:
        property_id: Property ID
        status: New processingStatus value for each document
        error_message: Optional error message
    """
    logger.info(f"Updating all documents for property {property_id} to status {status}")

    documents_table = get_documents_table()

    try:
        response = documents_table.query(
            IndexName='propertyId-uploadedAt-index',
            KeyConditionExpression='propertyId = :property_id',
            ExpressionAttributeValues={
                ':property_id': property_id
            }
        )
        documents = response.get('Items', [])
    except Exception as e:
        logger.error(f"Error querying documents for property {property_id}: {str(e)}", exc_info=True)
        documents = []

    any_failed = False
    TERMINAL_FAILED_STATUSES = {'ocr_failed', 'translation_failed', 'analysis_failed', 'lineage_failed'}
    for doc in documents:
        document_id = doc.get('documentId')
        if document_id:
            # Skip permanently failed documents — don't overwrite their failed status
            current_status = doc.get('processingStatus', '')
            if current_status in TERMINAL_FAILED_STATUSES and not status.endswith('_failed'):
                logger.debug(f"Skipping status update for permanently failed document {document_id} ({current_status})")
                continue
            try:
                update_document_status(document_id, property_id, status, error_message)
            except Exception as e:
                logger.error(
                    f"Error updating document {document_id} to {status}: {str(e)}",
                    exc_info=True
                )
                any_failed = True

    # Determine property-level status
    if status == 'scoring_complete' and not any_failed:
        property_status = 'completed'
    elif status == 'scoring_failed' or any_failed:
        property_status = 'failed'
    else:
        property_status = status

    update_property_status(property_id, property_status, error_message)

    logger.info(f"Finished updating {len(documents)} documents for property {property_id} to {status}")


def check_all_documents_lineage_complete(property_id: str) -> bool:
    """
    Check if all documents for a property have processingStatus == 'lineage_complete'.

    Requirements: 3.8

    Args:
        property_id: Property ID

    Returns:
        True if all documents are lineage_complete, False otherwise
    """
    documents_table = get_documents_table()

    try:
        response = documents_table.query(
            IndexName='propertyId-uploadedAt-index',
            KeyConditionExpression='propertyId = :property_id',
            ExpressionAttributeValues={
                ':property_id': property_id
            }
        )
        documents = response.get('Items', [])
    except Exception as e:
        logger.error(f"Error querying documents for property {property_id}: {str(e)}", exc_info=True)
        return False

    if not documents:
        logger.warning(f"No documents found for property {property_id}")
        return False

    for doc in documents:
        status = doc.get('processingStatus', '')
        if status != 'lineage_complete':
            # Skip permanently failed documents — they should not block the pipeline
            TERMINAL_FAILED_STATUSES = {'ocr_failed', 'translation_failed', 'analysis_failed', 'lineage_failed'}
            if status in TERMINAL_FAILED_STATUSES:
                logger.debug(
                    f"Document {doc.get('documentId')} is permanently failed ({status}), skipping in guard check"
                )
                continue
            logger.debug(
                f"Document {doc.get('documentId')} has status {status}, not lineage_complete"
            )
            return False

    eligible = [d for d in documents if d.get('processingStatus') not in {'ocr_failed', 'translation_failed', 'analysis_failed', 'lineage_failed'}]
    if not eligible:
        logger.warning(f"All documents for property {property_id} are in failed states, skipping scoring")
        return False

    logger.info(f"All eligible documents are lineage_complete for property {property_id} ({len(documents)} total, {len(documents)-len(eligible)} permanently failed)")
    return True



