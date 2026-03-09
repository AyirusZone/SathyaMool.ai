# Fix API URL in AWS Amplify

## Problem
The frontend is using the old Auth API Gateway URL (`tabclk95h4`) instead of the Main API Gateway URL (`44f28lv3d2`), causing token refresh to fail and redirect users back to login.

## Solution
Add environment variables in AWS Amplify Console:

### Steps:
1. Go to AWS Amplify Console: https://ap-south-1.console.aws.amazon.com/amplify/home?region=ap-south-1#/
2. Select your app: `SathyaMool.ai`
3. Click on `newer_mani` branch
4. Go to **Environment variables** in the left sidebar
5. Click **Manage variables**
6. Add these variables:

```
VITE_API_BASE_URL = https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1
VITE_USER_POOL_ID = ap-south-1_L9QAyUMp2
VITE_USER_POOL_CLIENT_ID = 257jk8dhpt1l6mu2l5trld1r4q
```

7. Click **Save**
8. Go to **Deployments** and click **Redeploy this version** to rebuild with new env vars

## Alternative: Wait for Automatic Deployment
The `.env.production` file has been added to the repo with the correct URL. The next automatic deployment will pick it up.

## Verification
After deployment, check browser console - the refresh URL should be:
```
POST https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/auth/refresh
```

NOT:
```
POST https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/auth/refresh
```
