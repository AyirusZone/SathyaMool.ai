"""
Re-trigger stuck documents by touching their processingStatus in DynamoDB.
This fires a DynamoDB stream MODIFY event which triggers the Translation Lambda.

Usage: python retrigger-stuck-docs.py [--dry-run] [--status ocr_complete]
"""
import boto3
import json
import argparse
from datetime import datetime, timezone

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'

def retrigger_documents(target_status='ocr_complete', dry_run=False):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(DOCUMENTS_TABLE)

    # Scan for documents with the target status
    response = table.scan(
        FilterExpression='processingStatus = :s',
        ExpressionAttributeValues={':s': target_status}
    )
    docs = response.get('Items', [])

    print(f"Found {len(docs)} documents with status '{target_status}'")

    if dry_run:
        for doc in docs:
            print(f"  [DRY RUN] Would re-trigger: {doc['documentId']} (property: {doc['propertyId']})")
        return

    success = 0
    failed = 0
    for doc in docs:
        doc_id = doc['documentId']
        prop_id = doc['propertyId']
        try:
            # Touch the item: set processingStatus to same value + update updatedAt
            # This fires a MODIFY stream event which re-triggers the Translation Lambda
            table.update_item(
                Key={'documentId': doc_id, 'propertyId': prop_id},
                UpdateExpression='SET processingStatus = :s, updatedAt = :t',
                ExpressionAttributeValues={
                    ':s': target_status,
                    ':t': datetime.now(timezone.utc).isoformat()
                }
            )
            print(f"  Re-triggered: {doc_id}")
            success += 1
        except Exception as e:
            print(f"  FAILED {doc_id}: {e}")
            failed += 1

    print(f"\nDone. Success: {success}, Failed: {failed}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--status', default='ocr_complete', help='Target processingStatus to re-trigger (default: ocr_complete)')
    args = parser.parse_args()
    retrigger_documents(target_status=args.status, dry_run=args.dry_run)
