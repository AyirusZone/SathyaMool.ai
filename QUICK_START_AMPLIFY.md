# Quick Start: Deploy Frontend to AWS Amplify

## ✅ What's Already Done

- ✅ Code pushed to GitHub (branch: `newer_mani`)
- ✅ Infrastructure deployed (DynamoDB, S3, Lambda functions)
- ✅ `amplify.yml` configuration file ready

## 🚀 Deploy Frontend Now (Without Backend)

You can deploy the frontend to Amplify now and add backend integration later. The frontend will load but API calls won't work until we deploy API Gateway.

### Step 1: Open AWS Amplify Console

1. Go to: https://console.aws.amazon.com/amplify/home?region=ap-south-1
2. **IMPORTANT**: Verify region is **ap-south-1 (Mumbai)** in top-right corner
3. Click **"New app"** → **"Host web app"**

### Step 2: Connect GitHub Repository

1. Select **"GitHub"** as the source
2. Click **"Continue"**
3. Authorize AWS Amplify (if prompted)
4. Select repository: **SathyaMool.ai**
5. Select branch: **newer_mani**
6. Click **"Next"**

### Step 3: Configure Build Settings

**App name**: `SatyaMool`

The build settings should auto-detect from `amplify.yml`. Verify it shows:

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
```

### Step 4: Add Environment Variables (Temporary Placeholders)

Click **"Advanced settings"** and add these environment variables:

```
VITE_API_BASE_URL = https://placeholder.execute-api.ap-south-1.amazonaws.com/v1
VITE_AWS_REGION = ap-south-1
VITE_USER_POOL_ID = placeholder
VITE_USER_POOL_CLIENT_ID = placeholder
VITE_DOCUMENT_BUCKET = satyamool-documents-339648407295
```

**Note**: These are placeholders. The app will load but authentication and API calls won't work until we update these with real values.

Click **"Next"**

### Step 5: Review and Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait 3-5 minutes for deployment

**Watch the deployment progress:**
- ✅ Provision (30 seconds)
- ✅ Build (2-3 minutes)
- ✅ Deploy (30 seconds)
- ✅ Verify (10 seconds)

### Step 6: Access Your Application

After deployment completes, you'll see:

**Your app URL**: `https://newer_mani.XXXXXXXXXX.amplifyapp.com`

Click the URL to open your application!

### Step 7: Configure React Router Redirects

For client-side routing to work:

1. In Amplify Console, click **"Rewrites and redirects"** in left menu
2. Click **"Edit"**
3. Add this rule at the top:

```
Source: </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>
Target: /index.html
Type: 200 (Rewrite)
```

4. Click **"Save"**

## 🎉 Success!

Your frontend is now deployed! You should see:
- ✅ Application loads in browser
- ✅ Can navigate between pages
- ⚠️ Authentication won't work (needs Cognito)
- ⚠️ API calls won't work (needs API Gateway)

## 📋 What Works Now vs. What Doesn't

### ✅ Works Now:
- Frontend UI loads
- Page navigation
- Static content
- UI components render

### ⚠️ Doesn't Work Yet (Needs Backend):
- User registration/login
- Property creation
- Document upload
- Data fetching from API

## 🔧 Next Steps to Enable Full Functionality

### Option 1: Deploy Everything via CDK (Recommended)

We need to create Lambda functions for all API endpoints and deploy API Gateway. This requires:

1. Creating Lambda functions for auth endpoints (register, login, verify-otp, refresh)
2. Creating Lambda functions for property endpoints
3. Creating Lambda functions for admin endpoints
4. Deploying Cognito User Pool
5. Deploying API Gateway with all endpoints
6. Updating Amplify environment variables

**Estimated time**: 2-3 hours of development + testing

### Option 2: Manual AWS Console Setup (Faster for Testing)

1. **Create Cognito User Pool** (15 minutes)
   - Go to AWS Console → Cognito
   - Create User Pool with email/phone sign-in
   - Note User Pool ID and Client ID

2. **Create API Gateway** (30 minutes)
   - Go to AWS Console → API Gateway
   - Create REST API
   - Create basic endpoints
   - Deploy to stage
   - Note Invoke URL

3. **Update Amplify Environment Variables** (5 minutes)
   - Go to Amplify Console → Environment variables
   - Update with real values
   - Redeploy

**Estimated time**: 1 hour

## 🔄 Update Environment Variables Later

When you have the real backend URLs:

1. Go to Amplify Console
2. Click on your app
3. Click **"Environment variables"** in left menu
4. Update these values:
   ```
   VITE_API_BASE_URL = https://YOUR_REAL_API_URL/v1
   VITE_USER_POOL_ID = ap-south-1_XXXXXXXXX
   VITE_USER_POOL_CLIENT_ID = XXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
5. Click **"Save"**
6. Go to **"Deployments"** tab
7. Click **"Redeploy this version"**

## 📊 Monitor Your Deployment

### View Build Logs

1. Go to Amplify Console
2. Click on your app
3. Click on the deployment
4. View logs for each phase

### Check for Errors

Common issues:
- **Build fails**: Check build logs for npm errors
- **Blank page**: Check browser console (F12) for errors
- **404 on refresh**: Add the redirect rule (Step 7)

## 🎯 Deployment Checklist

- [ ] Amplify app created
- [ ] GitHub repository connected
- [ ] Build settings configured
- [ ] Environment variables added
- [ ] First deployment successful
- [ ] Application loads in browser
- [ ] Redirect rule added for React Router
- [ ] No console errors (except API call failures)

## 📞 Need Help?

If deployment fails:
1. Check build logs in Amplify Console
2. Verify `amplify.yml` is in repository root
3. Verify `packages/frontend/package.json` exists
4. Check that `npm run build` works locally

## 🔗 Useful Commands

```bash
# Check Amplify apps
aws amplify list-apps --region ap-south-1

# Get app details
aws amplify get-app --app-id YOUR_APP_ID --region ap-south-1

# Trigger manual deployment
aws amplify start-job --app-id YOUR_APP_ID --branch-name newer_mani --job-type RELEASE --region ap-south-1
```

---

**Status**: Ready to deploy frontend ✅  
**Backend**: Will be deployed separately  
**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
