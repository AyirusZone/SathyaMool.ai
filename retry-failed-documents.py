#!/usr/bin/env python3
"""
Script to retry failed OCR documents by resetting their status and sending them back to the processing queue.
"""

import boto3
import json

# Initialize AWS clients
dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
sqs = boto3.client('sqs', region_name='ap-south-1')
s3 = boto3.client('s3', region_name='ap-south-1')

# Configuration
DOCUMENTS_TABLE = 'SatyaMool-Documents'
IDEMPOTENCY_TABLE = 'SatyaMool-Idempotency'
QUEUE_URL = 'https://sqs.ap-south-1.amazonaws.com/339648407295/satyamool-document-processing'
BUCKET_NAME = 'satyamool-documents-339648407295'

def retry_failed_documents():
    """Reset failed documents and send them back to the processing queue."""
    
    documents_table = dynamodb.Table(DOCUMENTS_TABLE)
    idempotency_table = dynamodb.Table(IDEMPOTENCY_TABLE)
    
    # Scan for failed or pending documents
    response = documents_table.scan(
        FilterExpression='processingStatus IN (:failed, :pending)',
        ExpressionAttributeValues={
            ':failed': 'ocr_failed',
            ':pending': 'pending'
        }
    )
    
    docs = response.get('Items', [])
    
    print(f"Found {len(docs)} documents to process")
    
    for doc in docs:
        document_id = doc['documentId']
        property_id = doc['propertyId']
        s3_key = doc['s3Key']
        status = doc['processingStatus']
        
        print(f"\nProcessing document: {document_id}")
        print(f"  Property ID: {property_id}")
        print(f"  S3 Key: {s3_key}")
        print(f"  Current Status: {status}")
        if status == 'ocr_failed':
            print(f"  Error: {doc.get('errorMessage', 'Unknown')}")
        
        # Reset document status to pending if failed
        if status == 'ocr_failed':
            try:
                documents_table.update_item(
                    Key={
                        'documentId': document_id,
                        'propertyId': property_id
                    },
                    UpdateExpression='SET processingStatus = :status, errorMessage = :null',
                    ExpressionAttributeValues={
                        ':status': 'pending',
                        ':null': None
                    }
                )
                print(f"  ✓ Reset status to pending")
            except Exception as e:
                print(f"  ✗ Failed to reset status: {str(e)}")
                continue
        
        # Delete idempotency record to allow reprocessing
        idempotency_key = f"ocr:{document_id}:{property_id}"
        try:
            idempotency_table.delete_item(
                Key={'idempotencyKey': idempotency_key}
            )
            print(f"  ✓ Deleted idempotency record")
        except Exception as e:
            print(f"  ✗ Failed to delete idempotency record: {str(e)}")
        
        # Send S3 event to SQS queue
        s3_event = {
            'Records': [{
                'eventName': 'ObjectCreated:Put',
                's3': {
                    'bucket': {
                        'name': BUCKET_NAME
                    },
                    'object': {
                        'key': s3_key
                    }
                }
            }]
        }
        
        try:
            sqs.send_message(
                QueueUrl=QUEUE_URL,
                MessageBody=json.dumps(s3_event)
            )
            print(f"  ✓ Sent to processing queue")
        except Exception as e:
            print(f"  ✗ Failed to send to queue: {str(e)}")

if __name__ == '__main__':
    retry_failed_documents()
    print("\n✅ Retry complete!")
