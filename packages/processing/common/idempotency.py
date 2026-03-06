"""
Idempotency Utility for SatyaMool Processing Lambda Functions

Provides idempotency key management and conditional write operations
to prevent duplicate processing and race conditions.

Requirements: 3.1, 3.3 - Handle duplicate messages and prevent race conditions
"""

import json
import hashlib
import time
import logging
from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from functools import wraps
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# DynamoDB client (lazy initialization)
_dynamodb = None
_idempotency_table = None

# Configuration
IDEMPOTENCY_TABLE_NAME = 'SatyaMool-Idempotency'
IDEMPOTENCY_TTL_HOURS = 24  # Keep idempotency records for 24 hours


def get_dynamodb_resource():
    """Get or create DynamoDB resource"""
    global _dynamodb
    if _dynamodb is None:
        _dynamodb = boto3.resource('dynamodb')
    return _dynamodb


def get_idempotency_table():
    """Get or create Idempotency table"""
    global _idempotency_table
    if _idempotency_table is None:
        dynamodb = get_dynamodb_resource()
        _idempotency_table = dynamodb.Table(IDEMPOTENCY_TABLE_NAME)
    return _idempotency_table


def generate_idempotency_key(data: Any) -> str:
    """
    Generate idempotency key from data using SHA-256 hash.
    
    Args:
        data: Data to generate key from (dict, string, or any JSON-serializable object)
        
    Returns:
        SHA-256 hash as hex string
    """
    if isinstance(data, dict):
        # Sort keys for consistent hashing
        data_string = json.dumps(data, sort_keys=True)
    elif isinstance(data, str):
        data_string = data
    else:
        data_string = json.dumps(data)
    
    return hashlib.sha256(data_string.encode('utf-8')).hexdigest()


def check_idempotency(idempotency_key: str) -> Optional[Dict[str, Any]]:
    """
    Check if an operation with the given idempotency key has already been processed.
    
    Args:
        idempotency_key: Unique key for the operation
        
    Returns:
        Idempotency record if exists, None otherwise
    """
    try:
        table = get_idempotency_table()
        
        response = table.get_item(
            Key={'idempotencyKey': idempotency_key}
        )
        
        return response.get('Item')
        
    except Exception as e:
        logger.error(f"Error checking idempotency: {str(e)}")
        raise


def mark_in_progress(
    idempotency_key: str,
    ttl_hours: int = IDEMPOTENCY_TTL_HOURS
) -> bool:
    """
    Mark operation as in progress using conditional write to prevent race conditions.
    
    Args:
        idempotency_key: Unique key for the operation
        ttl_hours: TTL in hours (default: 24)
        
    Returns:
        True if successfully marked, False if already exists
    """
    try:
        table = get_idempotency_table()
        now = datetime.utcnow().isoformat()
        ttl = int(time.time()) + (ttl_hours * 3600)
        
        table.put_item(
            Item={
                'idempotencyKey': idempotency_key,
                'status': 'IN_PROGRESS',
                'createdAt': now,
                'updatedAt': now,
                'ttl': ttl
            },
            # Conditional write: only create if doesn't exist
            ConditionExpression='attribute_not_exists(idempotencyKey)'
        )
        
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            # Record already exists
            logger.info(f"Idempotency key {idempotency_key} already exists")
            return False
        logger.error(f"Error marking operation in progress: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Error marking operation in progress: {str(e)}")
        raise


def mark_completed(idempotency_key: str, result: Any = None) -> None:
    """
    Mark operation as completed and store result.
    
    Args:
        idempotency_key: Unique key for the operation
        result: Result to store (optional)
    """
    try:
        table = get_idempotency_table()
        now = datetime.utcnow().isoformat()
        
        update_expression = 'SET #status = :status, updatedAt = :updatedAt'
        expression_attribute_names = {'#status': 'status'}
        expression_attribute_values = {
            ':status': 'COMPLETED',
            ':updatedAt': now
        }
        
        if result is not None:
            update_expression += ', #result = :result'
            expression_attribute_names['#result'] = 'result'
            expression_attribute_values[':result'] = result
        
        table.update_item(
            Key={'idempotencyKey': idempotency_key},
            UpdateExpression=update_expression,
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values
        )
        
    except Exception as e:
        logger.error(f"Error marking operation completed: {str(e)}")
        raise


def mark_failed(idempotency_key: str, error: str) -> None:
    """
    Mark operation as failed and store error.
    
    Args:
        idempotency_key: Unique key for the operation
        error: Error message
    """
    try:
        table = get_idempotency_table()
        now = datetime.utcnow().isoformat()
        
        table.update_item(
            Key={'idempotencyKey': idempotency_key},
            UpdateExpression='SET #status = :status, updatedAt = :updatedAt, #error = :error',
            ExpressionAttributeNames={
                '#status': 'status',
                '#error': 'error'
            },
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':updatedAt': now,
                ':error': error
            }
        )
        
    except Exception as e:
        logger.error(f"Error marking operation failed: {str(e)}")
        raise


def execute_idempotent(
    operation: Callable,
    data: Any,
    idempotency_key: Optional[str] = None,
    ttl_hours: int = IDEMPOTENCY_TTL_HOURS,
    throw_on_in_progress: bool = False
) -> Any:
    """
    Execute an idempotent operation.
    Handles checking, marking in progress, executing, and marking completed/failed.
    
    Args:
        operation: Function to execute
        data: Data to generate idempotency key from
        idempotency_key: Custom idempotency key (optional)
        ttl_hours: TTL in hours (default: 24)
        throw_on_in_progress: Whether to raise error if operation is in progress
        
    Returns:
        Result of the operation
    """
    key = idempotency_key or generate_idempotency_key(data)
    
    logger.info(f"Executing idempotent operation with key: {key}")
    
    # Check if operation already processed
    existing_record = check_idempotency(key)
    
    if existing_record:
        status = existing_record.get('status')
        logger.info(f"Idempotency record found with status: {status}")
        
        if status == 'COMPLETED':
            logger.info("Operation already completed, returning cached result")
            return existing_record.get('result')
        
        if status == 'IN_PROGRESS':
            if throw_on_in_progress:
                raise Exception('Operation already in progress')
            logger.info("Operation already in progress, skipping")
            return existing_record.get('result')
        
        if status == 'FAILED':
            logger.info("Previous operation failed, retrying")
            # Allow retry for failed operations
    
    # Mark as in progress
    marked = mark_in_progress(key, ttl_hours)
    
    if not marked:
        # Another process marked it first (race condition)
        logger.info("Another process started this operation, checking again")
        record = check_idempotency(key)
        
        if record and record.get('status') == 'COMPLETED':
            return record.get('result')
        
        if throw_on_in_progress:
            raise Exception('Operation already in progress (race condition detected)')
        
        return None
    
    # Execute the operation
    try:
        result = operation()
        mark_completed(key, result)
        logger.info("Operation completed successfully")
        return result
    except Exception as e:
        error_message = str(e)
        mark_failed(key, error_message)
        logger.error(f"Operation failed: {error_message}")
        raise


def idempotent(
    key_generator: Optional[Callable] = None,
    ttl_hours: int = IDEMPOTENCY_TTL_HOURS
):
    """
    Decorator to make a function idempotent.
    
    Args:
        key_generator: Function to generate idempotency key from function args
        ttl_hours: TTL in hours (default: 24)
        
    Example:
        @idempotent(key_generator=lambda doc_id, prop_id: f"{doc_id}:{prop_id}")
        def process_document(document_id, property_id):
            # Processing logic
            pass
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate idempotency key
            if key_generator:
                key = key_generator(*args, **kwargs)
            else:
                # Use function name and arguments
                key_data = {
                    'function': func.__name__,
                    'args': args,
                    'kwargs': kwargs
                }
                key = generate_idempotency_key(key_data)
            
            # Execute idempotent operation
            return execute_idempotent(
                lambda: func(*args, **kwargs),
                key_data if not key_generator else key,
                idempotency_key=key,
                ttl_hours=ttl_hours
            )
        
        return wrapper
    return decorator


def extract_sqs_idempotency_key(sqs_record: Dict[str, Any]) -> str:
    """
    Extract idempotency key from SQS message.
    Checks message attributes and generates from body if not present.
    
    Args:
        sqs_record: SQS record from Lambda event
        
    Returns:
        Idempotency key
    """
    # Check for explicit idempotency key in message attributes
    message_attributes = sqs_record.get('messageAttributes', {})
    
    if 'idempotencyKey' in message_attributes:
        return message_attributes['idempotencyKey']['stringValue']
    
    # For FIFO queues, use message deduplication ID
    attributes = sqs_record.get('attributes', {})
    if 'MessageDeduplicationId' in attributes:
        return attributes['MessageDeduplicationId']
    
    # Generate from message body
    message_body = json.loads(sqs_record['body'])
    return generate_idempotency_key(message_body)


def conditional_update_document_status(
    documents_table,
    document_id: str,
    property_id: str,
    new_status: str,
    expected_status: Optional[str] = None,
    additional_updates: Optional[Dict[str, Any]] = None
) -> bool:
    """
    Conditionally update document status to prevent race conditions.
    
    Args:
        documents_table: DynamoDB table resource
        document_id: Document ID
        property_id: Property ID
        new_status: New status to set
        expected_status: Expected current status (optional, for stricter checking)
        additional_updates: Additional fields to update (optional)
        
    Returns:
        True if update successful, False if condition not met
    """
    try:
        now = datetime.utcnow().isoformat()
        
        update_expression = 'SET processingStatus = :new_status, updatedAt = :updated_at'
        expression_attribute_values = {
            ':new_status': new_status,
            ':updated_at': now
        }
        
        # Add additional updates if provided
        if additional_updates:
            for key, value in additional_updates.items():
                update_expression += f', {key} = :{key}'
                expression_attribute_values[f':{key}'] = value
        
        # Build condition expression
        condition_expression = None
        if expected_status:
            condition_expression = 'processingStatus = :expected_status'
            expression_attribute_values[':expected_status'] = expected_status
        
        update_params = {
            'Key': {
                'documentId': document_id,
                'propertyId': property_id
            },
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_attribute_values
        }
        
        if condition_expression:
            update_params['ConditionExpression'] = condition_expression
        
        documents_table.update_item(**update_params)
        
        return True
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            logger.warning(
                f"Conditional update failed for document {document_id}: "
                f"expected status {expected_status}, trying to set {new_status}"
            )
            return False
        raise
    except Exception as e:
        logger.error(f"Error updating document status: {str(e)}")
        raise
