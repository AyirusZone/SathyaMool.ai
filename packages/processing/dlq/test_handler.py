"""
Unit tests for DLQ Processor Lambda function

Tests the DLQ message processing, failure analysis, and alerting functionality.
"""

import json
import os
import pytest
from unittest.mock import Mock, patch, MagicMock

# Set environment variables before importing handler
os.environ['DOCUMENTS_TABLE_NAME'] = 'test-documents-table'
os.environ['ALARM_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:123456789012:test-topic'
os.environ['LOG_LEVEL'] = 'INFO'
os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'

import handler


@pytest.fixture(autouse=True)
def reset_clients():
    """Reset global clients before each test"""
    handler.dynamodb = None
    handler.sns = None
    handler.cloudwatch = None
    handler.documents_table = None
    yield


@pytest.fixture
def mock_dynamodb_table():
    """Mock DynamoDB table"""
    with patch('handler.get_dynamodb_table') as mock:
        mock_table = MagicMock()
        mock.return_value = mock_table
        yield mock_table


@pytest.fixture
def mock_sns_client():
    """Mock SNS client"""
    with patch('handler.get_sns_client') as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def mock_cloudwatch_client():
    """Mock CloudWatch client"""
    with patch('handler.get_cloudwatch_client') as mock:
        mock_client = MagicMock()
        mock.return_value = mock_client
        yield mock_client


@pytest.fixture
def sample_s3_event():
    """Sample S3 event message"""
    return {
        'Records': [
            {
                'eventVersion': '2.1',
                'eventSource': 'aws:s3',
                'eventName': 'ObjectCreated:Put',
                's3': {
                    'bucket': {
                        'name': 'test-bucket'
                    },
                    'object': {
                        'key': 'properties/prop-123/documents/doc-456.pdf'
                    }
                }
            }
        ]
    }


@pytest.fixture
def sample_dlq_record(sample_s3_event):
    """Sample DLQ record"""
    return {
        'messageId': 'msg-789',
        'receiptHandle': 'receipt-handle-123',
        'body': json.dumps(sample_s3_event),
        'attributes': {
            'ApproximateReceiveCount': '4',
            'ApproximateFirstReceiveTimestamp': '1234567890000'
        }
    }


@pytest.fixture
def sample_dlq_event(sample_dlq_record):
    """Sample DLQ event with multiple records"""
    return {
        'Records': [sample_dlq_record]
    }


def test_lambda_handler_success(mock_dynamodb_table, mock_sns_client, mock_cloudwatch_client, sample_dlq_event):
    """Test successful DLQ message processing"""
    # Call handler
    response = handler.lambda_handler(sample_dlq_event, None)
    
    # Verify response
    assert response['statusCode'] == 200
    body = json.loads(response['body'])
    assert body['processed'] == 1
    assert body['failed'] == 0
    
    # Verify DynamoDB update was called
    mock_dynamodb_table.update_item.assert_called_once()
    
    # Verify SNS publish was called
    mock_sns_client.publish.assert_called_once()
    
    # Verify CloudWatch metric was published
    mock_cloudwatch_client.put_metric_data.assert_called_once()


def test_lambda_handler_multiple_records(mock_dynamodb_table, mock_sns_client, mock_cloudwatch_client, sample_dlq_record):
    """Test processing multiple DLQ records"""
    # Create event with 3 records
    event = {
        'Records': [sample_dlq_record, sample_dlq_record, sample_dlq_record]
    }
    
    # Call handler
    response = handler.lambda_handler(event, None)
    
    # Verify response
    assert response['statusCode'] == 200
    body = json.loads(response['body'])
    assert body['processed'] == 3
    assert body['failed'] == 0
    
    # Verify DynamoDB update was called 3 times
    assert mock_dynamodb_table.update_item.call_count == 3
    
    # Verify SNS publish was called 3 times
    assert mock_sns_client.publish.call_count == 3


def test_extract_failure_info_with_s3_event(sample_dlq_record, sample_s3_event):
    """Test extracting failure info from S3 event"""
    failure_info = handler.extract_failure_info(sample_dlq_record, sample_s3_event)
    
    # Verify extracted information
    assert failure_info['messageId'] == 'msg-789'
    assert failure_info['receiveCount'] == '4'
    assert failure_info['bucket'] == 'test-bucket'
    assert failure_info['key'] == 'properties/prop-123/documents/doc-456.pdf'
    assert failure_info['propertyId'] == 'prop-123'
    assert failure_info['documentId'] == 'doc-456'
    assert 'timestamp' in failure_info


def test_extract_failure_info_without_s3_event(sample_dlq_record):
    """Test extracting failure info from non-S3 event"""
    message_body = {'custom': 'data'}
    
    failure_info = handler.extract_failure_info(sample_dlq_record, message_body)
    
    # Verify basic information is extracted
    assert failure_info['messageId'] == 'msg-789'
    assert failure_info['receiveCount'] == '4'
    assert 'documentId' not in failure_info
    assert 'propertyId' not in failure_info


def test_update_document_status(mock_dynamodb_table):
    """Test updating document status to failed"""
    # Create failure info
    failure_info = {
        'documentId': 'doc-456',
        'propertyId': 'prop-123',
        'messageId': 'msg-789',
        'timestamp': '2024-01-01T00:00:00'
    }
    
    # Call update function
    handler.update_document_status(failure_info)
    
    # Verify DynamoDB update was called with correct parameters
    mock_dynamodb_table.update_item.assert_called_once()
    call_args = mock_dynamodb_table.update_item.call_args
    
    assert call_args[1]['Key']['documentId'] == 'doc-456'
    assert call_args[1]['Key']['propertyId'] == 'prop-123'
    assert ':status' in call_args[1]['ExpressionAttributeValues']
    assert call_args[1]['ExpressionAttributeValues'][':status'] == 'failed'


def test_update_document_status_missing_ids(mock_dynamodb_table):
    """Test update document status with missing IDs"""
    # Create failure info without documentId
    failure_info = {
        'messageId': 'msg-789',
        'timestamp': '2024-01-01T00:00:00'
    }
    
    # Call update function
    handler.update_document_status(failure_info)
    
    # Verify DynamoDB update was NOT called
    mock_dynamodb_table.update_item.assert_not_called()


def test_send_failure_alert(mock_sns_client):
    """Test sending SNS failure alert"""
    failure_info = {
        'messageId': 'msg-789',
        'timestamp': '2024-01-01T00:00:00',
        'receiveCount': '4',
        'firstReceiveTimestamp': '1234567890000',
        'documentId': 'doc-456',
        'propertyId': 'prop-123',
        'bucket': 'test-bucket',
        'key': 'properties/prop-123/documents/doc-456.pdf'
    }
    
    # Call send alert function
    handler.send_failure_alert(failure_info)
    
    # Verify SNS publish was called
    mock_sns_client.publish.assert_called_once()
    call_args = mock_sns_client.publish.call_args
    
    assert call_args[1]['TopicArn'] == os.environ['ALARM_TOPIC_ARN']
    assert 'DLQ Alert' in call_args[1]['Subject']
    assert 'msg-789' in call_args[1]['Message']
    assert 'doc-456' in call_args[1]['Message']


def test_send_failure_alert_without_document_info(mock_sns_client):
    """Test sending alert without document information"""
    failure_info = {
        'messageId': 'msg-789',
        'timestamp': '2024-01-01T00:00:00',
        'receiveCount': '4',
        'firstReceiveTimestamp': '1234567890000'
    }
    
    # Call send alert function
    handler.send_failure_alert(failure_info)
    
    # Verify SNS publish was called
    mock_sns_client.publish.assert_called_once()
    call_args = mock_sns_client.publish.call_args
    
    assert 'msg-789' in call_args[1]['Message']
    # Should not contain document-specific information
    assert 'Document ID' not in call_args[1]['Message']


def test_publish_dlq_metrics(mock_cloudwatch_client):
    """Test publishing CloudWatch metrics"""
    # Call publish metrics function
    handler.publish_dlq_metrics(5)
    
    # Verify CloudWatch put_metric_data was called
    mock_cloudwatch_client.put_metric_data.assert_called_once()
    call_args = mock_cloudwatch_client.put_metric_data.call_args
    
    assert call_args[1]['Namespace'] == 'SatyaMool/DLQ'
    assert len(call_args[1]['MetricData']) == 1
    assert call_args[1]['MetricData'][0]['MetricName'] == 'MessagesProcessed'
    assert call_args[1]['MetricData'][0]['Value'] == 5
    assert call_args[1]['MetricData'][0]['Unit'] == 'Count'


def test_process_dlq_message_with_invalid_json(mock_dynamodb_table, mock_sns_client, mock_cloudwatch_client):
    """Test processing DLQ message with invalid JSON body"""
    record = {
        'messageId': 'msg-789',
        'receiptHandle': 'receipt-handle-123',
        'body': 'invalid json {{{',
        'attributes': {
            'ApproximateReceiveCount': '4',
            'ApproximateFirstReceiveTimestamp': '1234567890000'
        }
    }
    
    # Call process function - should not raise exception
    handler.process_dlq_message(record)
    
    # Verify SNS alert was still sent
    mock_sns_client.publish.assert_called_once()


def test_lambda_handler_partial_failure(mock_dynamodb_table, mock_sns_client, mock_cloudwatch_client, sample_dlq_record):
    """Test handler with partial failures"""
    # Create event with 3 records
    event = {
        'Records': [sample_dlq_record, sample_dlq_record, sample_dlq_record]
    }
    
    # Make the second call fail
    mock_sns_client.publish.side_effect = [None, Exception("SNS error"), None]
    
    # Call handler
    response = handler.lambda_handler(event, None)
    
    # Verify response shows partial failure
    assert response['statusCode'] == 200
    body = json.loads(response['body'])
    assert body['processed'] == 2
    assert body['failed'] == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
