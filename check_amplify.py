#!/usr/bin/env python3
import boto3
import json
from datetime import datetime

def json_serial(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

region = 'ap-south-1'

print("=" * 80)
print("CHECKING AWS AMPLIFY STATUS")
print("=" * 80)
print()

try:
    amplify = boto3.client('amplify', region_name=region)
    
    # List all Amplify apps
    print("Amplify Apps:")
    print("-" * 80)
    apps = amplify.list_apps()
    
    if apps['apps']:
        for app in apps['apps']:
            print(f"\n  App Name: {app['name']}")
            print(f"  App ID: {app['appId']}")
            print(f"  Default Domain: {app['defaultDomain']}")
            print(f"  Repository: {app.get('repository', 'N/A')}")
            print(f"  Platform: {app.get('platform', 'N/A')}")
            print(f"  Created: {app['createTime']}")
            print(f"  Updated: {app['updateTime']}")
            
            # Get branches for this app
            print(f"\n  Branches:")
            try:
                branches = amplify.list_branches(appId=app['appId'])
                for branch in branches['branches']:
                    print(f"    - Branch: {branch['branchName']}")
                    print(f"      Status: {branch.get('stage', 'N/A')}")
                    print(f"      URL: https://{branch['branchName']}.{app['defaultDomain']}")
                    
                    # Get latest deployment
                    try:
                        jobs = amplify.list_jobs(appId=app['appId'], branchName=branch['branchName'], maxResults=1)
                        if jobs['jobSummaries']:
                            latest_job = jobs['jobSummaries'][0]
                            print(f"      Latest Deployment:")
                            print(f"        Status: {latest_job['status']}")
                            print(f"        Started: {latest_job['startTime']}")
                            if 'endTime' in latest_job:
                                print(f"        Ended: {latest_job['endTime']}")
                    except Exception as e:
                        print(f"      Error getting deployment: {e}")
                    print()
            except Exception as e:
                print(f"    Error getting branches: {e}")
            
            # Get domain associations
            print(f"  Domain Associations:")
            try:
                domains = amplify.list_domain_associations(appId=app['appId'])
                if domains['domainAssociations']:
                    for domain in domains['domainAssociations']:
                        print(f"    - Domain: {domain['domainName']}")
                        print(f"      Status: {domain['domainStatus']}")
                else:
                    print(f"    No custom domains configured")
            except Exception as e:
                print(f"    Error getting domains: {e}")
            
            print("\n" + "=" * 80)
    else:
        print("  ❌ No Amplify apps found")
        print("\n  This means the frontend has NOT been deployed to AWS Amplify yet.")
        print("  Follow QUICK_START_AMPLIFY.md to deploy the frontend.")
        
except Exception as e:
    print(f"  ❌ Error accessing Amplify: {e}")
    print(f"\n  This could mean:")
    print(f"  1. No Amplify apps are deployed")
    print(f"  2. IAM user lacks amplify:ListApps permission")
    print(f"  3. Amplify service is not available in this region")

print()
print("=" * 80)
print("AMPLIFY CHECK COMPLETE")
print("=" * 80)
