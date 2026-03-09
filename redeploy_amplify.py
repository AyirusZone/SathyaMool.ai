#!/usr/bin/env python3
import boto3
import time
import sys

# Configuration
APP_ID = "d2kh7n7sie9i2y"
BRANCH_NAME = "newer_mani"
REGION = "ap-south-1"

print("=" * 80)
print("REDEPLOYING AMPLIFY APP")
print("=" * 80)
print()
print(f"App ID: {APP_ID}")
print(f"Branch: {BRANCH_NAME}")
print(f"Region: {REGION}")
print()

try:
    amplify = boto3.client('amplify', region_name=REGION)
    
    # Start a new deployment
    print("Starting new deployment...")
    response = amplify.start_job(
        appId=APP_ID,
        branchName=BRANCH_NAME,
        jobType='RELEASE'
    )
    
    job_id = response['jobSummary']['jobId']
    print(f"✅ Deployment started!")
    print(f"Job ID: {job_id}")
    print()
    
    print("Deployment URL:")
    print(f"  https://console.aws.amazon.com/amplify/home?region={REGION}#/{APP_ID}/{BRANCH_NAME}/{job_id}")
    print()
    
    print("Monitoring deployment status...")
    print("-" * 80)
    
    # Monitor deployment status
    while True:
        job = amplify.get_job(appId=APP_ID, branchName=BRANCH_NAME, jobId=job_id)
        status = job['job']['summary']['status']
        
        print(f"Status: {status}")
        
        if status == 'SUCCEED':
            print()
            print("=" * 80)
            print("✅ DEPLOYMENT SUCCESSFUL!")
            print("=" * 80)
            print()
            print(f"Live URL: https://{BRANCH_NAME}.{APP_ID}.amplifyapp.com")
            print()
            print("The frontend is now using the correct API endpoints!")
            print("Test the registration and login flow.")
            break
        elif status in ['FAILED', 'CANCELLED']:
            print()
            print("=" * 80)
            print(f"❌ DEPLOYMENT {status}")
            print("=" * 80)
            print()
            print("Check the Amplify console for error details:")
            print(f"  https://console.aws.amazon.com/amplify/home?region={REGION}#/{APP_ID}/{BRANCH_NAME}/{job_id}")
            sys.exit(1)
        
        time.sleep(10)
    
except KeyboardInterrupt:
    print()
    print("Monitoring stopped. Deployment continues in background.")
    print(f"Check status at: https://console.aws.amazon.com/amplify/home?region={REGION}#/{APP_ID}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
