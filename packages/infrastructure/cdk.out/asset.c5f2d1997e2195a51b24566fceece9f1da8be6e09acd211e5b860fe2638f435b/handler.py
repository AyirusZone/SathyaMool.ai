"""
Dead Letter Queue (DLQ) Processor Lambda Function

This Lambda function processes messages that have failed processing after maximum retry attempts.
It analyzes the failure, logs detailed information, and sends alerts to operations team.

Requirements: 3.4 - Handle failed processing with DLQ
"""

import json
import os
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
import boto3
from botocore.exceptions import ClientError

# Configure logging
logger = logging.getLogger()
logger.setLevel(os.environ.get('LOG_LEVEL', 'INFO'))

# Environment variables
DOCUMENTS_TABLE_NAME = os.environ.get('DOCUMENTS_TABLE_NAME', '')
ALARM_TOPIC_ARN = os.environ.get('ALARM_TOPIC_ARN', '')

# Initialize AWS clients (will be initialized on first use)
dynamodb = None
sns = None
cloudwatch = None
documents_table = None


def get_dynamodb_table():
    """Get or initialize DynamoDB table"""
    global dynamodb, documents_table
    if documents_table is None:
        dynamodb = boto3.resource('dynamodb')
        documents_table = dynamodb.Table(DOCUMENTS_TABLE_NAME)
    return documents_table


def get_sns_client():
    """Get or initialize SNS client"""
    global sns
    if sns is None:
        sns = boto3.client('sns')
    return sns


def get_cloudwatch_client():
    """Get or initialize CloudWatch client"""
    global cloudwatch
    if cloudwatch is None:
        cloudwatch = boto3.client('cloudwatch')
    return cloudwatch


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process messages from the Dead Letter Queue.
    
    Args:
        event: SQS event containing DLQ messages
        context: Lambda context
        
    Returns:
        Response with processing results
    """
    logger.info(f"Processing {len(event['Records'])} DLQ messages")
    
    processed_count = 0
    failed_count = 0
    
    for record in event['Records']:
        try:
            # Process each DLQ message
            process_dlq_message(record)
            processed_count += 1
        except Exception as e:
            logger.error(f"Failed to process DLQ message: {str(e)}", exc_info=True)
            failed_count += 1
    
    # Publish custom CloudWatch metric for DLQ message count
    publish_dlq_metrics(processed_count)
    
    logger.info(f"DLQ processing complete: {processed_count} processed, {failed_count} failed")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'processed': processed_count,
            'failed': failed_count
        })
    }


def process_dlq_message(record: Dict[str, Any]) -> None:
    """
    Process a single DLQ message.
    
    Analyzes the failure, updates document status, and sends alert.
    
    Args:
        record: SQS record from DLQ
    """
    message_id = record['messageId']
    receipt_handle = record['receiptHandle']
    
    logger.info(f"Processing DLQ message: {message_id}")
    
    # Parse the message body
    try:
        message_body = json.loads(record['body'])
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse message body: {str(e)}")
        message_body = {'raw': record['body']}
    
    # Extract failure information
    failure_info = extract_failure_info(record, message_body)
    
    # Update document status if this is a document processing failure
    if 'documentId' in failure_info:
        update_document_status(failure_info)
    
    # Send alert notification
    send_failure_alert(failure_info)
    
    # Log detailed failure information
    log_failure_details(failure_info)


def extract_failure_info(record: Dict[str, Any], message_body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract failure information from DLQ message.
    
    Args:
        record: SQS record
        message_body: Parsed message body
        
    Returns:
        Dictionary containing failure information
    """
    failure_info = {
        'messageId': record['messageId'],
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'receiveCount': record['attributes'].get('ApproximateReceiveCount', 'unknown'),
        'firstReceiveTimestamp': record['attributes'].get('ApproximateFirstReceiveTimestamp', 'unknown'),
    }
    
    # Extract S3 event information if present
    if 'Records' in message_body:
        s3_records = message_body.get('Records', [])
        if s3_records and len(s3_records) > 0:
            s3_record = s3_records[0]
            if 's3' in s3_record:
                s3_info = s3_record['s3']
                failure_info['bucket'] = s3_info.get('bucket', {}).get('name')
                failure_info['key'] = s3_info.get('object', {}).get('key')
                
                # Extract documentId and propertyId from S3 key
                # Expected format: properties/{propertyId}/documents/{documentId}.{ext}
                key = failure_info.get('key', '')
                if key:
                    parts = key.split('/')
                    if len(parts) >= 4 and parts[0] == 'properties' and parts[2] == 'documents':
                        failure_info['propertyId'] = parts[1]
                        # Extract documentId from filename (remove extension)
                        filename = parts[3]
                        failure_info['documentId'] = filename.rsplit('.', 1)[0] if '.' in filename else filename
    
    # Add message body for debugging
    failure_info['messageBody'] = message_body
    
    return failure_info


def update_document_status(failure_info: Dict[str, Any]) -> None:
    """
    Update document status to 'failed' in DynamoDB.
    
    Args:
        failure_info: Failure information dictionary
    """
    document_id = failure_info.get('documentId')
    property_id = failure_info.get('propertyId')
    
    if not document_id or not property_id:
        logger.warning("Missing documentId or propertyId, skipping document status update")
        return
    
    try:
        # Update document status to failed
        table = get_dynamodb_table()
        table.update_item(
            Key={
                'documentId': document_id,
                'propertyId': property_id
            },
            UpdateExpression='SET processingStatus = :status, failureReason = :reason, failureTimestamp = :timestamp',
            ExpressionAttributeValues={
                ':status': 'failed',
                ':reason': f"Processing failed after maximum retries. Message ID: {failure_info['messageId']}",
                ':timestamp': failure_info['timestamp']
            }
        )
        
        logger.info(f"Updated document {document_id} status to 'failed'")
        
    except ClientError as e:
        logger.error(f"Failed to update document status: {str(e)}", exc_info=True)


def send_failure_alert(failure_info: Dict[str, Any]) -> None:
    """
    Send SNS alert notification for DLQ message.
    
    Args:
        failure_info: Failure information dictionary
    """
    try:
        # Construct alert message
        subject = f"SatyaMool DLQ Alert: Processing Failure"
        
        message_lines = [
            "A message has been moved to the Dead Letter Queue after maximum retry attempts.",
            "",
            "Failure Details:",
            f"- Message ID: {failure_info['messageId']}",
            f"- Timestamp: {failure_info['timestamp']}",
            f"- Receive Count: {failure_info['receiveCount']}",
            f"- First Receive: {failure_info['firstReceiveTimestamp']}",
        ]
        
        if 'documentId' in failure_info:
            message_lines.extend([
                "",
                "Document Information:",
                f"- Document ID: {failure_info['documentId']}",
                f"- Property ID: {failure_info['propertyId']}",
                f"- S3 Bucket: {failure_info.get('bucket', 'N/A')}",
                f"- S3 Key: {failure_info.get('key', 'N/A')}",
            ])
        
        message_lines.extend([
            "",
            "Action Required:",
            "1. Review the failure details in CloudWatch Logs",
            "2. Check if this is a systemic issue or isolated failure",
            "3. Investigate the root cause (API throttling, invalid data, etc.)",
            "4. Take corrective action if needed",
            "",
            f"CloudWatch Logs: /aws/lambda/SatyaMool-DLQ-Processor",
        ])
        
        message = "\n".join(message_lines)
        
        # Send SNS notification
        sns_client = get_sns_client()
        sns_client.publish(
            TopicArn=ALARM_TOPIC_ARN,
            Subject=subject,
            Message=message
        )
        
        logger.info(f"Sent failure alert for message {failure_info['messageId']}")
        
    except ClientError as e:
        logger.error(f"Failed to send SNS alert: {str(e)}", exc_info=True)


def publish_dlq_metrics(message_count: int) -> None:
    """
    Publish custom CloudWatch metrics for DLQ processing.
    
    Args:
        message_count: Number of DLQ messages processed
    """
    try:
        cw_client = get_cloudwatch_client()
        cw_client.put_metric_data(
            Namespace='SatyaMool/DLQ',
            MetricData=[
                {
                    'MetricName': 'MessagesProcessed',
                    'Value': message_count,
                    'Unit': 'Count',
                    'Timestamp': datetime.now(timezone.utc)
                }
            ]
        )
        
        logger.info(f"Published DLQ metric: {message_count} messages processed")
        
    except ClientError as e:
        logger.error(f"Failed to publish CloudWatch metric: {str(e)}", exc_info=True)


def log_failure_details(failure_info: Dict[str, Any]) -> None:
    """
    Log detailed failure information for debugging.
    
    Args:
        failure_info: Failure information dictionary
    """
    logger.error(
        "DLQ Message Details",
        extra={
            'messageId': failure_info['messageId'],
            'timestamp': failure_info['timestamp'],
            'receiveCount': failure_info['receiveCount'],
            'documentId': failure_info.get('documentId'),
            'propertyId': failure_info.get('propertyId'),
            'bucket': failure_info.get('bucket'),
            'key': failure_info.get('key'),
            'messageBody': json.dumps(failure_info.get('messageBody', {}))
        }
    )
