#!/usr/bin/env python3
import boto3
import json

region = 'ap-south-1'
app_id = 'd2kh7n7sie9i2y'
branch_name = 'newer_mani'

print("=" * 80)
print("CHECKING AMPLIFY ENVIRONMENT VARIABLES")
print("=" * 80)
print()

try:
    amplify = boto3.client('amplify', region_name=region)
    
    # Get branch details
    branch = amplify.get_branch(appId=app_id, branchName=branch_name)
    
    print(f"App ID: {app_id}")
    print(f"Branch: {branch_name}")
    print()
    
    # Get environment variables
    env_vars = branch['branch'].get('environmentVariables', {})
    
    if env_vars:
        print("Environment Variables:")
        print("-" * 80)
        for key, value in sorted(env_vars.items()):
            # Mask sensitive values
            if 'SECRET' in key.upper() or 'KEY' in key.upper() or 'PASSWORD' in key.upper():
                display_value = '***MASKED***'
            elif len(value) > 100:
                display_value = value[:50] + '...' + value[-20:]
            else:
                display_value = value
            print(f"  {key}: {display_value}")
    else:
        print("No environment variables configured")
        print()
        print("⚠️  WARNING: Frontend may not work correctly without environment variables!")
        print()
        print("Required variables:")
        print("  - VITE_API_BASE_URL")
        print("  - VITE_AWS_REGION")
        print("  - VITE_USER_POOL_ID")
        print("  - VITE_USER_POOL_CLIENT_ID")
    
    print()
    
except Exception as e:
    print(f"Error: {e}")

print("=" * 80)
