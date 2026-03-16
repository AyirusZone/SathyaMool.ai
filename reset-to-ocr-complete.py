"""
Reset translation_failed documents back to ocr_complete so the Translation Lambda re-processes them.
The Translation Lambda has a DynamoDB stream filter for processingStatus = 'ocr_complete'.

Usage: python reset-to-ocr-complete.py [--dry-run]
"""
import boto3
from datetime import datetime, timezone

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'

def reset_to_ocr_complete(dry_run=False):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(DOCUMENTS_TABLE)

    response = table.scan(
        FilterExpression='processingStatus = :s',
        ExpressionAttributeValues={':s': 'translation_failed'}
    )
    docs = response.get('Items', [])
    print(f"Found {len(docs)} translation_failed documents")

    if dry_run:
        for doc in docs:
            print(f"  [DRY RUN] {doc['documentId']} -> ocr_complete")
        return

    success = 0
    for doc in docs:
        try:
            table.update_item(
                Key={'documentId': doc['documentId'], 'propertyId': doc['propertyId']},
                UpdateExpression='SET processingStatus = :s, updatedAt = :t',
                ExpressionAttributeValues={
                    ':s': 'ocr_complete',
                    ':t': datetime.now(timezone.utc).isoformat()
                }
            )
            print(f"  Reset: {doc['documentId']}")
            success += 1
        except Exception as e:
            print(f"  FAILED {doc['documentId']}: {e}")

    print(f"\nDone. Reset {success} documents to ocr_complete.")

import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()
reset_to_ocr_complete(dry_run=args.dry_run)
