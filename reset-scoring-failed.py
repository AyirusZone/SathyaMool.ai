"""
Reset scoring_failed documents back to lineage_complete so Trust Score Lambda can retry.
Usage: python reset-scoring-failed.py [--dry-run]
"""
import boto3
import argparse
from datetime import datetime, timezone

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'
LINEAGE_TABLE = 'SatyaMool-Lineage'

def reset_and_retrigger(dry_run=False):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    docs_table = dynamodb.Table(DOCUMENTS_TABLE)
    lineage_table = dynamodb.Table(LINEAGE_TABLE)

    # Find all scoring_failed docs
    resp = docs_table.scan(
        FilterExpression='processingStatus = :s',
        ExpressionAttributeValues={':s': 'scoring_failed'}
    )
    docs = resp['Items']
    while 'LastEvaluatedKey' in resp:
        resp = docs_table.scan(
            FilterExpression='processingStatus = :s',
            ExpressionAttributeValues={':s': 'scoring_failed'},
            ExclusiveStartKey=resp['LastEvaluatedKey']
        )
        docs.extend(resp['Items'])

    print(f"Found {len(docs)} scoring_failed documents")

    if dry_run:
        from collections import Counter
        by_prop = Counter(d['propertyId'][:8] for d in docs)
        for p, c in by_prop.items():
            print(f"  {p}: {c} docs")
        print("[DRY RUN] Would reset to lineage_complete and re-trigger.")
        return

    # Reset to lineage_complete
    props_triggered = set()
    for doc in docs:
        doc_id = doc['documentId']
        prop_id = doc['propertyId']
        try:
            docs_table.update_item(
                Key={'documentId': doc_id, 'propertyId': prop_id},
                UpdateExpression='SET processingStatus = :s, updatedAt = :t',
                ExpressionAttributeValues={
                    ':s': 'lineage_complete',
                    ':t': datetime.now(timezone.utc).isoformat()
                }
            )
            props_triggered.add(prop_id)
        except Exception as e:
            print(f"  FAILED reset {doc_id}: {e}")

    print(f"Reset {len(docs)} docs to lineage_complete across {len(props_triggered)} properties")

    # Touch lineage records to re-trigger Trust Score Lambda
    print("Re-triggering Trust Score Lambda via lineage table...")
    for prop_id in props_triggered:
        try:
            lineage_table.update_item(
                Key={'propertyId': prop_id},
                UpdateExpression='SET updatedAt = :t',
                ExpressionAttributeValues={':t': datetime.now(timezone.utc).isoformat()}
            )
            print(f"  Triggered: {prop_id[:8]}")
        except Exception as e:
            print(f"  FAILED trigger {prop_id[:8]}: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    reset_and_retrigger(dry_run=args.dry_run)
