"""
Reset analysis_failed documents back to translation_complete so the Analysis Lambda re-processes them.
Run this AFTER enabling Bedrock model access in the AWS console.

Usage: python retrigger-analysis-failed.py [--dry-run]
"""
import boto3
from datetime import datetime, timezone

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'

def retrigger_analysis_failed(dry_run=False):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(DOCUMENTS_TABLE)

    response = table.scan(
        FilterExpression='processingStatus = :s',
        ExpressionAttributeValues={':s': 'analysis_failed'}
    )
    docs = response.get('Items', [])
    print(f"Found {len(docs)} analysis_failed documents")

    if dry_run:
        for doc in docs:
            print(f"  [DRY RUN] {doc['documentId']} -> translation_complete")
        return

    success = 0
    for doc in docs:
        try:
            table.update_item(
                Key={'documentId': doc['documentId'], 'propertyId': doc['propertyId']},
                UpdateExpression='SET processingStatus = :s, updatedAt = :t',
                ExpressionAttributeValues={
                    ':s': 'translation_complete',
                    ':t': datetime.now(timezone.utc).isoformat()
                }
            )
            print(f"  Reset: {doc['documentId']}")
            success += 1
        except Exception as e:
            print(f"  FAILED {doc['documentId']}: {e}")

    print(f"\nDone. Reset {success} documents to translation_complete.")

import argparse
parser = argparse.ArgumentParser()
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()
retrigger_analysis_failed(dry_run=args.dry_run)
