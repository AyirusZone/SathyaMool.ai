#!/usr/bin/env python3
import boto3
import json

region = 'ap-south-1'
main_api_id = '44f28lv3d2'
auth_api_id = 'tabclk95h4'

print("=" * 80)
print("CHECKING API GATEWAY AUTHORIZER CONFIGURATION")
print("=" * 80)
print()

try:
    apigw = boto3.client('apigateway', region_name=region)
    
    # Check Main API
    print("1. Main API (44f28lv3d2):")
    print("-" * 80)
    
    try:
        authorizers = apigw.get_authorizers(restApiId=main_api_id)
        
        if authorizers['items']:
            print(f"  ✅ Authorizers found: {len(authorizers['items'])}")
            for auth in authorizers['items']:
                print(f"\n  Authorizer: {auth['name']}")
                print(f"    ID: {auth['id']}")
                print(f"    Type: {auth['type']}")
                print(f"    Identity Source: {auth.get('identitySource', 'N/A')}")
                if 'authorizerUri' in auth:
                    print(f"    Lambda: {auth['authorizerUri']}")
        else:
            print("  ❌ NO AUTHORIZERS CONFIGURED")
            print("  This is why users are getting logged out!")
            print()
            print("  The Main API needs an authorizer to validate JWT tokens.")
            print("  Without it, all authenticated requests return 401.")
    except Exception as e:
        print(f"  Error checking authorizers: {e}")
    
    print()
    
    # Check Auth API
    print("2. Auth API (tabclk95h4):")
    print("-" * 80)
    
    try:
        authorizers = apigw.get_authorizers(restApiId=auth_api_id)
        
        if authorizers['items']:
            print(f"  ✅ Authorizers found: {len(authorizers['items'])}")
            for auth in authorizers['items']:
                print(f"\n  Authorizer: {auth['name']}")
                print(f"    ID: {auth['id']}")
                print(f"    Type: {auth['type']}")
        else:
            print("  ℹ️  No authorizers (expected - auth endpoints don't need authorization)")
    except Exception as e:
        print(f"  Error checking authorizers: {e}")
    
    print()
    print("=" * 80)
    print("CHECKING LAMBDA AUTHORIZER FUNCTION")
    print("=" * 80)
    print()
    
    lambda_client = boto3.client('lambda', region_name=region)
    
    try:
        func = lambda_client.get_function(FunctionName='SatyaMool-Auth-Authorizer')
        print("✅ Lambda Authorizer Function exists:")
        print(f"  Name: {func['Configuration']['FunctionName']}")
        print(f"  ARN: {func['Configuration']['FunctionArn']}")
        print(f"  Runtime: {func['Configuration']['Runtime']}")
        print(f"  Last Modified: {func['Configuration']['LastModified']}")
    except Exception as e:
        print(f"❌ Lambda Authorizer Function not found: {e}")
    
    print()
    print("=" * 80)
    print("DIAGNOSIS")
    print("=" * 80)
    print()
    
    if not authorizers['items']:
        print("🔴 PROBLEM IDENTIFIED:")
        print()
        print("The Main API Gateway has NO authorizer configured.")
        print("This means:")
        print("  1. User logs in successfully → Gets valid JWT token")
        print("  2. Dashboard loads → Makes API call to Main API")
        print("  3. Main API has no authorizer → Rejects request with 401")
        print("  4. Frontend sees 401 → Tries to refresh token")
        print("  5. Refresh may work but Main API still rejects → User logged out")
        print()
        print("SOLUTION:")
        print("  Run: python3 configure_api_authorizer.py")
        print()
    else:
        print("✅ Authorizer is configured")
        print("The auto-logout issue may be caused by:")
        print("  1. Token format mismatch")
        print("  2. Authorizer Lambda errors")
        print("  3. Token expiration")
        print()
        print("Check CloudWatch logs:")
        print("  aws logs tail /aws/lambda/SatyaMool-Auth-Authorizer --follow --region ap-south-1")
    
except Exception as e:
    print(f"❌ Error: {e}")

print()
print("=" * 80)
