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
print("COMPLETE PROJECT STATUS CHECK")
print("=" * 80)
print()

# 1. API Gateway
print("1. API Gateway:")
print("-" * 80)
try:
    apigw = boto3.client('apigateway', region_name=region)
    apis = apigw.get_rest_apis()
    satyamool_apis = [api for api in apis['items'] if 'satyamool' in api['name'].lower() or 'SatyaMool' in api['name']]
    
    if satyamool_apis:
        for api in satyamool_apis:
            print(f"  Name: {api['name']}")
            print(f"  API ID: {api['id']}")
            print(f"  Created: {api['createdDate']}")
            
            # Get stages
            try:
                stages = apigw.get_stages(restApiId=api['id'])
                if stages['item']:
                    for stage in stages['item']:
                        print(f"  Stage: {stage['stageName']}")
                        print(f"  Invoke URL: https://{api['id']}.execute-api.{region}.amazonaws.com/{stage['stageName']}")
                        print(f"  Deployed: {stage.get('createdDate', 'N/A')}")
            except Exception as e:
                print(f"  Error getting stages: {e}")
            print()
    else:
        print("  ❌ No SatyaMool API Gateway found")
except Exception as e:
    print(f"  ❌ Error: {e}")
print()

# 2. Cognito User Pools
print("2. Cognito User Pools:")
print("-" * 80)
try:
    cognito = boto3.client('cognito-idp', region_name=region)
    pools = cognito.list_user_pools(MaxResults=60)
    satyamool_pools = [pool for pool in pools['UserPools'] if 'satyamool' in pool['Name'].lower() or 'SatyaMool' in pool['Name']]
    
    if satyamool_pools:
        for pool in satyamool_pools:
            print(f"  Name: {pool['Name']}")
            print(f"  Pool ID: {pool['Id']}")
            print(f"  Created: {pool['CreationDate']}")
            print(f"  Status: {pool.get('Status', 'N/A')}")
            
            # Get app clients
            try:
                clients = cognito.list_user_pool_clients(UserPoolId=pool['Id'], MaxResults=60)
                if clients['UserPoolClients']:
                    print(f"  App Clients:")
                    for client in clients['UserPoolClients']:
                        print(f"    - {client['ClientName']} (ID: {client['ClientId']})")
            except Exception as e:
                print(f"  Error getting clients: {e}")
            print()
    else:
        print("  ❌ No SatyaMool Cognito User Pool found")
except Exception as e:
    print(f"  ❌ Error: {e}")
print()

# 3. CloudFront Distributions
print("3. CloudFront Distributions:")
print("-" * 80)
try:
    cf = boto3.client('cloudfront')
    distributions = cf.list_distributions()
    
    if 'DistributionList' in distributions and 'Items' in distributions['DistributionList']:
        satyamool_dists = []
        for dist in distributions['DistributionList']['Items']:
            # Check if comment or origin contains satyamool
            comment = dist.get('Comment', '').lower()
            origins = dist.get('Origins', {}).get('Items', [])
            origin_domains = [o.get('DomainName', '').lower() for o in origins]
            
            if 'satyamool' in comment or any('satyamool' in od for od in origin_domains):
                satyamool_dists.append(dist)
        
        if satyamool_dists:
            for dist in satyamool_dists:
                print(f"  Distribution ID: {dist['Id']}")
                print(f"  Domain: {dist['DomainName']}")
                print(f"  Status: {dist['Status']}")
                print(f"  Enabled: {dist['Enabled']}")
                print(f"  Comment: {dist.get('Comment', 'N/A')}")
                print()
        else:
            print("  ℹ️  No SatyaMool CloudFront distributions found")
    else:
        print("  ℹ️  No CloudFront distributions found")
except Exception as e:
    print(f"  ℹ️  Error or no access: {e}")
print()

# 4. Amplify App (Summary)
print("4. AWS Amplify:")
print("-" * 80)
try:
    amplify = boto3.client('amplify', region_name=region)
    apps = amplify.list_apps()
    
    if apps['apps']:
        for app in apps['apps']:
            print(f"  ✅ App Name: {app['name']}")
            print(f"  App ID: {app['appId']}")
            print(f"  Default Domain: {app['defaultDomain']}")
            
            branches = amplify.list_branches(appId=app['appId'])
            for branch in branches['branches']:
                print(f"  Branch: {branch['branchName']}")
                print(f"  🌐 Live URL: https://{branch['branchName']}.{app['defaultDomain']}")
                
                # Get environment variables
                try:
                    env_vars = branch.get('environmentVariables', {})
                    if env_vars:
                        print(f"  Environment Variables:")
                        for key in sorted(env_vars.keys()):
                            value = env_vars[key]
                            # Mask sensitive values
                            if len(value) > 50:
                                value = value[:20] + "..." + value[-10:]
                            print(f"    - {key}: {value}")
                except Exception as e:
                    print(f"  Error getting env vars: {e}")
            print()
    else:
        print("  ❌ No Amplify apps found")
except Exception as e:
    print(f"  ❌ Error: {e}")
print()

# 5. EventBridge Rules
print("5. EventBridge Rules:")
print("-" * 80)
try:
    events = boto3.client('events', region_name=region)
    rules = events.list_rules(NamePrefix='SatyaMool')
    
    if rules['Rules']:
        for rule in rules['Rules']:
            print(f"  Name: {rule['Name']}")
            print(f"  State: {rule['State']}")
            print(f"  Schedule: {rule.get('ScheduleExpression', 'N/A')}")
            print(f"  Description: {rule.get('Description', 'N/A')}")
            print()
    else:
        print("  ℹ️  No SatyaMool EventBridge rules found")
except Exception as e:
    print(f"  ❌ Error: {e}")
print()

print("=" * 80)
print("PROJECT STATUS CHECK COMPLETE")
print("=" * 80)
