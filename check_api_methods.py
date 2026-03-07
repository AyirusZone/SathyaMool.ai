#!/usr/bin/env python3
import boto3
import json

region = 'ap-south-1'
main_api_id = '44f28lv3d2'

print("=" * 80)
print("CHECKING API GATEWAY METHODS AND AUTHORIZATION")
print("=" * 80)
print()

try:
    apigw = boto3.client('apigateway', region_name=region)
    
    # Get all resources
    resources = apigw.get_resources(restApiId=main_api_id, limit=500)
    
    print(f"Found {len(resources['items'])} resources in Main API")
    print()
    
    auth_issues = []
    
    for resource in resources['items']:
        path = resource['path']
        resource_id = resource['id']
        
        # Check each HTTP method on this resource
        if 'resourceMethods' in resource:
            for method in resource['resourceMethods'].keys():
                try:
                    method_details = apigw.get_method(
                        restApiId=main_api_id,
                        resourceId=resource_id,
                        httpMethod=method
                    )
                    
                    auth_type = method_details.get('authorizationType', 'NONE')
                    authorizer_id = method_details.get('authorizerId', None)
                    
                    if method != 'OPTIONS':  # Skip OPTIONS (CORS)
                        status = "✅" if auth_type != 'NONE' else "❌"
                        print(f"{status} {method:6} {path:40} Auth: {auth_type}")
                        
                        if auth_type == 'NONE' and path != '/':
                            auth_issues.append(f"{method} {path}")
                        
                        if authorizer_id:
                            print(f"       Authorizer ID: {authorizer_id}")
                
                except Exception as e:
                    print(f"  Error checking {method} {path}: {e}")
    
    print()
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print()
    
    if auth_issues:
        print(f"🔴 FOUND {len(auth_issues)} ENDPOINTS WITHOUT AUTHORIZATION:")
        print()
        for issue in auth_issues:
            print(f"  - {issue}")
        print()
        print("These endpoints are rejecting authenticated requests!")
        print()
        print("SOLUTION:")
        print("  The authorizer exists but is not attached to the methods.")
        print("  Run: python3 attach_authorizer_to_methods.py")
    else:
        print("✅ All endpoints have proper authorization configured")
        print()
        print("If users are still getting logged out, check:")
        print("  1. Token format (should be 'Bearer <token>')")
        print("  2. Authorizer Lambda logs for errors")
        print("  3. Token expiration time")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print()
print("=" * 80)
