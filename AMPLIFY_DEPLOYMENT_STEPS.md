# AWS Amplify Deployment - Step-by-Step Guide

## ✅ Completed Steps

1. **Code Pushed to GitHub** ✅
   - Repository: https://github.com/AyirusZone/SathyaMool.ai
   - Branch: `newer_mani`
   - All code successfully pushed (3565 objects, 16.36 MB)

2. **Infrastructure Deployed** ✅
   - AWS Account: 339648407295
   - Region: ap-south-1 (Mumbai)
   - Stack: SatyaMoolStack
   - Resources: DynamoDB tables, S3 buckets, Lambda functions, SQS queues

3. **Lambda Functions Tested** ✅
   - OCR Processor: Working
   - Notification Processor: Working
   - Cleanup Lambda: Working

## 🚀 Next Steps

### Step 1: Deploy API Gateway (REQUIRED FIRST)

The frontend needs the API Gateway URL to connect to the backend. We need to deploy API Gateway before setting up Amplify.

**Option A: Deploy API Gateway via CDK (Recommended)**

```bash
# Navigate to infrastructure directory
cd packages/infrastructure

# Update the stack to include API Gateway
# The ApiGatewayConfig construct is already created but not integrated
# We need to uncomment and integrate it in satyamool-stack.ts

# Deploy the updated stack
npx cdk deploy --require-approval never
```

**Option B: Deploy API Gateway Manually via AWS Console**

1. Go to AWS Console → API Gateway
2. Create REST API
3. Create resources and methods for each endpoint
4. Deploy to stage (e.g., "prod")
5. Note the Invoke URL

**What you'll get:**
- API Gateway Invoke URL: `https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/prod`
- This URL will be used as `VITE_API_BASE_URL` in Amplify

### Step 2: Deploy Cognito User Pool (REQUIRED)

The frontend needs Cognito for user authentication.

**Deploy via CDK:**

```bash
cd packages/infrastructure

# Cognito configuration is already in the stack
# Check if it's deployed:
aws cognito-idp list-user-pools --max-results 10 --region ap-south-1

# If not deployed, it should be included in the next CDK deployment
npx cdk deploy --require-approval never
```

**What you'll get:**
- User Pool ID: `ap-south-1_XXXXXXXXX`
- User Pool Client ID: `XXXXXXXXXXXXXXXXXXXXXXXXXX`

### Step 3: Set Up AWS Amplify

Now that we have the backend URLs, we can set up Amplify.

#### 3.1 Open AWS Amplify Console

1. Go to: https://console.aws.amazon.com/amplify/
2. **IMPORTANT**: Select region **ap-south-1 (Mumbai)** in the top-right corner
3. Click **"Get Started"** under "Amplify Hosting"

#### 3.2 Connect to GitHub

1. Click **"GitHub"** as your repository service
2. Click **"Continue"**
3. Authorize AWS Amplify to access your GitHub account (if not already authorized)
4. Select repository: **SathyaMool.ai**
5. Select branch: **newer_mani**
6. Click **"Next"**

#### 3.3 Configure Build Settings

**App name**: `SatyaMool`

**Build and test settings**: Should auto-detect from `amplify.yml`

Verify it shows:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd packages/frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: packages/frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - packages/frontend/node_modules/**/*
```

**Advanced settings** (click "Advanced settings"):

Add these environment variables:

```
VITE_API_BASE_URL = https://YOUR_API_GATEWAY_URL/v1
VITE_AWS_REGION = ap-south-1
VITE_USER_POOL_ID = YOUR_COGNITO_USER_POOL_ID
VITE_USER_POOL_CLIENT_ID = YOUR_COGNITO_CLIENT_ID
VITE_DOCUMENT_BUCKET = satyamool-documents-339648407295
```

**Note**: Replace the placeholder values with actual values from Step 1 and Step 2.

Click **"Next"**

#### 3.4 Review and Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait for deployment (3-5 minutes)

**Deployment phases:**
- Provision
- Build
- Deploy
- Verify

#### 3.5 Access Your Application

After successful deployment:
- **Amplify URL**: `https://newer_mani.XXXXXXXXXX.amplifyapp.com`
- Copy this URL for testing

### Step 4: Configure Redirects for React Router

For React Router to work properly with client-side routing:

1. In Amplify Console, click **"Rewrites and redirects"**
2. Click **"Add rule"**
3. Add this rule:
   - **Source address**: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>`
   - **Target address**: `/index.html`
   - **Type**: `200 (Rewrite)`
4. Click **"Save"**

### Step 5: Test the Application

1. Open the Amplify URL in your browser
2. Test user registration
3. Test login
4. Test property creation (will fail until API Gateway is deployed)

## 📋 Environment Variables Reference

Here's what each environment variable does:

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `VITE_API_BASE_URL` | Backend API endpoint | `https://abc123.execute-api.ap-south-1.amazonaws.com/prod/v1` |
| `VITE_AWS_REGION` | AWS region for services | `ap-south-1` |
| `VITE_USER_POOL_ID` | Cognito User Pool ID | `ap-south-1_abc123XYZ` |
| `VITE_USER_POOL_CLIENT_ID` | Cognito App Client ID | `1234567890abcdefghijklmnop` |
| `VITE_DOCUMENT_BUCKET` | S3 bucket for documents | `satyamool-documents-339648407295` |

## 🔧 Troubleshooting

### Build Fails in Amplify

**Issue**: `npm ci` fails
**Solution**: 
```bash
# Locally, regenerate package-lock.json
cd packages/frontend
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Update package-lock.json"
git push origin newer_mani
```

**Issue**: TypeScript errors during build
**Solution**: The build script already skips TypeScript checking (`npm run build` uses `vite build` without `tsc`). If errors persist, check the Amplify build logs.

### App Shows Blank Page

**Issue**: Blank page after deployment
**Solution**:
1. Open browser DevTools (F12)
2. Check Console for errors
3. Common issues:
   - Missing environment variables
   - Incorrect API_BASE_URL
   - CORS errors (need to configure API Gateway CORS)

### API Connection Fails

**Issue**: Cannot connect to backend
**Solution**:
1. Verify API Gateway is deployed
2. Check CORS configuration in API Gateway
3. Verify environment variables in Amplify
4. Check browser Network tab for actual error responses

## 📊 Monitoring Deployment

### View Build Logs

1. Go to Amplify Console
2. Click on your app
3. Click on the deployment
4. View logs for each phase

### Check Deployment Status

```bash
# List Amplify apps
aws amplify list-apps --region ap-south-1

# Get app details
aws amplify get-app --app-id YOUR_APP_ID --region ap-south-1

# List deployments
aws amplify list-jobs --app-id YOUR_APP_ID --branch-name newer_mani --region ap-south-1
```

## 🎯 Success Criteria

Deployment is successful when:

1. ✅ Amplify build completes without errors
2. ✅ Application loads in browser
3. ✅ No console errors in browser DevTools
4. ✅ Can navigate between pages
5. ✅ API calls work (after API Gateway is deployed)
6. ✅ Authentication works (after Cognito is deployed)

## 📝 Next Steps After Amplify Deployment

1. **Deploy API Gateway** - Enable backend functionality
2. **Deploy Cognito** - Enable user authentication
3. **Configure CORS** - Allow frontend to call backend
4. **Set up custom domain** (optional) - Use your own domain
5. **Enable monitoring** - Set up CloudWatch dashboards
6. **Configure CI/CD notifications** - Get notified of deployments

## 🔗 Useful Links

- AWS Amplify Console: https://console.aws.amazon.com/amplify/
- GitHub Repository: https://github.com/AyirusZone/SathyaMool.ai
- AWS Amplify Documentation: https://docs.amplify.aws/
- Deployment Guide: See `AWS_AMPLIFY_DEPLOYMENT_GUIDE.md`

---

**Current Status**: Code pushed to GitHub ✅  
**Next Action**: Deploy API Gateway and Cognito, then set up Amplify  
**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
