# Copy of common/idempotency.py for Lambda packaging
import boto3
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from botocore.exceptions import ClientError

logger = logging.getLogger()

# Initialize DynamoDB resource
dynamodb = boto3.resource('dynamodb')

# Get idempotency table name from environment
import os
IDEMPOTENCY_TABLE_NAME = os.environ.get('IDEMPOTENCY_TABLE_NAME', 'SatyaMool-Idempotency')
idempotency_table = dynamodb.Table(IDEMPOTENCY_TABLE_NAME)

# TTL for idempotency records (24 hours)
IDEMPOTENCY_TTL_HOURS = 24


def extract_sqs_idempotency_key(record: Dict[str, Any]) -> str:
    """
    Extract idempotency key from SQS message.
    
    Args:
        record: SQS message record
        
    Returns:
        Idempotency key string
    """
    message_id = record.get('messageId', '')
    return f"sqs:{message_id}"


def check_idempotency(idempotency_key: str) -> Optional[Dict[str, Any]]:
    """
    Check if an operation has already been processed.
    
    Args:
        idempotency_key: Unique key for the operation
        
    Returns:
        Existing record if found, None otherwise
    """
    try:
        response = idempotency_table.get_item(
            Key={'idempotencyKey': idempotency_key}
        )
        return response.get('Item')
    except ClientError as e:
        logger.error(f"Error checking idempotency: {str(e)}")
        return None


def mark_in_progress(idempotency_key: str) -> bool:
    """
    Mark an operation as in progress (prevents duplicate processing).
    
    Uses conditional write to ensure only one instance can mark as in progress.
    
    Args:
        idempotency_key: Unique key for the operation
        
    Returns:
        True if successfully marked as in progress, False if already exists
    """
    try:
        ttl = int((datetime.utcnow() + timedelta(hours=IDEMPOTENCY_TTL_HOURS)).timestamp())
        
        idempotency_table.put_item(
            Item={
                'idempotencyKey': idempotency_key,
                'status': 'IN_PROGRESS',
                'createdAt': datetime.utcnow().isoformat(),
                'ttl': ttl
            },
            ConditionExpression='attribute_not_exists(idempotencyKey)'
        )
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.info(f"Idempotency key {idempotency_key} already exists")
            return False
        logger.error(f"Error marking in progress: {str(e)}")
        return False


def mark_completed(idempotency_key: str, result: Dict[str, Any]) -> None:
    """
    Mark an operation as completed.
    
    Args:
        idempotency_key: Unique key for the operation
        result: Result data to store
    """
    try:
        ttl = int((datetime.utcnow() + timedelta(hours=IDEMPOTENCY_TTL_HOURS)).timestamp())
        
        idempotency_table.update_item(
            Key={'idempotencyKey': idempotency_key},
            UpdateExpression='SET #status = :status, completedAt = :completed_at, #result = :result, #ttl = :ttl',
            ExpressionAttributeNames={
                '#status': 'status',
                '#result': 'result',
                '#ttl': 'ttl'
            },
            ExpressionAttributeValues={
                ':status': 'COMPLETED',
                ':completed_at': datetime.utcnow().isoformat(),
                ':result': result,
                ':ttl': ttl
            }
        )
    except ClientError as e:
        logger.error(f"Error marking completed: {str(e)}")


def mark_failed(idempotency_key: str, error_message: str) -> None:
    """
    Mark an operation as failed.
    
    Args:
        idempotency_key: Unique key for the operation
        error_message: Error message to store
    """
    try:
        ttl = int((datetime.utcnow() + timedelta(hours=IDEMPOTENCY_TTL_HOURS)).timestamp())
        
        idempotency_table.update_item(
            Key={'idempotencyKey': idempotency_key},
            UpdateExpression='SET #status = :status, failedAt = :failed_at, errorMessage = :error, #ttl = :ttl',
            ExpressionAttributeNames={
                '#status': 'status',
                '#ttl': 'ttl'
            },
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':failed_at': datetime.utcnow().isoformat(),
                ':error': error_message,
                ':ttl': ttl
            }
        )
    except ClientError as e:
        logger.error(f"Error marking failed: {str(e)}")


def conditional_update_document_status(
    table,
    document_id: str,
    property_id: str,
    new_status: str,
    expected_status: Optional[str] = None
) -> bool:
    """
    Update document status with conditional write to prevent race conditions.
    
    Args:
        table: DynamoDB table resource
        document_id: Document ID
        property_id: Property ID
        new_status: New status to set
        expected_status: Expected current status (optional)
        
    Returns:
        True if update succeeded, False if condition failed
    """
    try:
        update_params = {
            'Key': {
                'documentId': document_id,
                'propertyId': property_id
            },
            'UpdateExpression': 'SET processingStatus = :new_status, updatedAt = :updated_at',
            'ExpressionAttributeValues': {
                ':new_status': new_status,
                ':updated_at': datetime.utcnow().isoformat()
            }
        }
        
        if expected_status:
            update_params['ConditionExpression'] = 'processingStatus = :expected_status'
            update_params['ExpressionAttributeValues'][':expected_status'] = expected_status
        
        table.update_item(**update_params)
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.warning(
                f"Conditional update failed for document {document_id}. "
                f"Expected status: {expected_status}, new status: {new_status}"
            )
            return False
        logger.error(f"Error updating document status: {str(e)}")
        raise
