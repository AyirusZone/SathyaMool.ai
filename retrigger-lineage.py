"""
Re-trigger Lineage Lambda for properties where all eligible docs are analysis_complete.
Touches one document per qualifying property to fire a DynamoDB stream MODIFY event.

Usage: python retrigger-lineage.py [--dry-run] [--property-id <id>]
"""
import boto3
import argparse
from datetime import datetime, timezone
from collections import defaultdict

REGION = 'ap-south-1'
DOCUMENTS_TABLE = 'SatyaMool-Documents'

TERMINAL_FAILED = {'ocr_failed', 'translation_failed', 'analysis_failed'}

def get_properties_ready_for_lineage(table):
    """Scan all docs and find properties where all non-failed docs are analysis_complete."""
    response = table.scan(ProjectionExpression='documentId, propertyId, processingStatus')
    docs = response.get('Items', [])
    while 'LastEvaluatedKey' in response:
        response = table.scan(
            ProjectionExpression='documentId, propertyId, processingStatus',
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        docs.extend(response.get('Items', []))

    by_property = defaultdict(list)
    for doc in docs:
        by_property[doc['propertyId']].append(doc)

    ready = {}
    for prop_id, prop_docs in by_property.items():
        eligible = [d for d in prop_docs if d['processingStatus'] not in TERMINAL_FAILED]
        failed = [d for d in prop_docs if d['processingStatus'] in TERMINAL_FAILED]
        all_complete = eligible and all(d['processingStatus'] == 'analysis_complete' for d in eligible)
        if all_complete:
            ready[prop_id] = {
                'eligible': eligible,
                'failed_count': len(failed),
                'trigger_doc': eligible[0]  # touch the first eligible doc
            }

    return ready

def retrigger_lineage(dry_run=False, target_property=None):
    dynamodb = boto3.resource('dynamodb', region_name=REGION)
    table = dynamodb.Table(DOCUMENTS_TABLE)

    ready = get_properties_ready_for_lineage(table)

    if target_property:
        if target_property not in ready:
            print(f"Property {target_property} is not ready for lineage (or not found).")
            return
        ready = {target_property: ready[target_property]}

    if not ready:
        print("No properties ready for lineage re-trigger.")
        return

    print(f"Found {len(ready)} properties ready for lineage:")
    for prop_id, info in ready.items():
        print(f"  {prop_id}: {len(info['eligible'])} eligible docs, {info['failed_count']} permanently failed")

    if dry_run:
        print("\n[DRY RUN] Would touch one doc per property to fire stream event.")
        return

    print()
    for prop_id, info in ready.items():
        doc = info['trigger_doc']
        doc_id = doc['documentId']
        try:
            table.update_item(
                Key={'documentId': doc_id, 'propertyId': prop_id},
                UpdateExpression='SET processingStatus = :s, updatedAt = :t',
                ExpressionAttributeValues={
                    ':s': 'analysis_complete',
                    ':t': datetime.now(timezone.utc).isoformat()
                }
            )
            print(f"  Triggered lineage for property {prop_id} via doc {doc_id}")
        except Exception as e:
            print(f"  FAILED for property {prop_id}: {e}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--property-id', help='Only re-trigger a specific property')
    args = parser.parse_args()
    retrigger_lineage(dry_run=args.dry_run, target_property=args.property_id)
