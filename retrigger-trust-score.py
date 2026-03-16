"""
Re-trigger Trust Score Lambda by touching lineage records for properties
where all eligible docs are lineage_complete.

Usage: python retrigger-trust-score.py [--dry-run]
"""
import boto3
import argparse
from datetime import datetime, timezone
from collections import defaultdict, Counter

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'
LINEAGE_TABLE = 'SatyaMool-Lineage'

TERMINAL_FAILED = {'ocr_failed', 'translation_failed', 'analysis_failed', 'lineage_failed'}

def get_properties_ready_for_scoring(docs_table):
    resp = docs_table.scan(ProjectionExpression='propertyId, processingStatus')
    docs = resp['Items']
    while 'LastEvaluatedKey' in resp:
        resp = docs_table.scan(ProjectionExpression='propertyId, processingStatus', ExclusiveStartKey=resp['LastEvaluatedKey'])
        docs.extend(resp['Items'])

    by_prop = defaultdict(list)
    for d in docs:
        by_prop[d['propertyId']].append(d['processingStatus'])

    ready = []
    for prop_id, statuses in by_prop.items():
        c = Counter(statuses)
        eligible = {s: n for s, n in c.items() if s not in TERMINAL_FAILED}
        failed = {s: n for s, n in c.items() if s in TERMINAL_FAILED}
        if eligible and all(s == 'lineage_complete' for s in eligible):
            ready.append({'propertyId': prop_id, 'eligible': eligible, 'failed': failed})
    return ready

def retrigger(dry_run=False):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    docs_table = dynamodb.Table(DOCUMENTS_TABLE)
    lineage_table = dynamodb.Table(LINEAGE_TABLE)

    ready = get_properties_ready_for_scoring(docs_table)
    if not ready:
        print("No properties ready for trust score re-trigger.")
        return

    print(f"Found {len(ready)} properties ready for scoring:")
    for p in ready:
        print(f"  {p['propertyId'][:8]}: {p['eligible']}, failed={p['failed']}")

    if dry_run:
        print("\n[DRY RUN] Would touch lineage records to re-trigger Trust Score Lambda.")
        return

    print()
    for p in ready:
        prop_id = p['propertyId']
        try:
            lineage_table.update_item(
                Key={'propertyId': prop_id},
                UpdateExpression='SET updatedAt = :t',
                ExpressionAttributeValues={':t': datetime.now(timezone.utc).isoformat()}
            )
            print(f"  Triggered trust score for property {prop_id[:8]}")
        except Exception as e:
            print(f"  FAILED for {prop_id[:8]}: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    retrigger(dry_run=args.dry_run)
