# AWS Amplify Deployment Guide for SatyaMool

This guide will help you deploy the SatyaMool frontend to AWS Amplify with automatic CI/CD from GitHub.

## Prerequisites

- ✅ AWS Account (339648407295)
- ✅ GitHub account
- ✅ Code ready to push to GitHub
- ✅ Backend infrastructure deployed (Lambda functions, DynamoDB, S3)

## Step 1: Push Code to GitHub

### 1.1 Create a new GitHub repository

Go to https://github.com/new and create a new repository:
- Repository name: `satyamool` (or your preferred name)
- Description: "Property verification system with blockchain-inspired lineage tracking"
- Visibility: Private (recommended) or Public
- Do NOT initialize with README, .gitignore, or license (we already have these)

### 1.2 Add GitHub remote and push

```bash
# Add GitHub remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/satyamool.git

# Or if you prefer SSH
git remote add origin git@github.com:YOUR_USERNAME/satyamool.git

# Check current branch
git branch

# Add all files
git add .

# Commit changes
git commit -m "Initial commit: SatyaMool property verification system

- Backend Lambda functions (OCR, Notifications, Cleanup)
- Frontend React app with Material-UI
- Infrastructure as Code with AWS CDK
- Processing pipelines for document analysis
- DynamoDB tables and S3 buckets configured"

# Push to GitHub
git push -u origin newer_mani

# Or push to main branch
git branch -M main
git push -u origin main
```

## Step 2: Set Up AWS Amplify

### 2.1 Open AWS Amplify Console

1. Go to AWS Console: https://console.aws.amazon.com/amplify/
2. Select region: **ap-south-1 (Mumbai)**
3. Click **"Get Started"** under "Amplify Hosting"

### 2.2 Connect to GitHub

1. Click **"GitHub"** as your repository service
2. Click **"Continue"**
3. Authorize AWS Amplify to access your GitHub account
4. Select your repository: `satyamool`
5. Select branch: `newer_mani` (or `main`)
6. Click **"Next"**

### 2.3 Configure Build Settings

AWS Amplify will auto-detect the `amplify.yml` file. Verify the settings:

**App name**: `SatyaMool`

**Build and test settings**: (should auto-populate from amplify.yml)
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
- **Environment variables**: Add these:
  ```
  VITE_API_BASE_URL = https://YOUR_API_GATEWAY_URL/v1
  VITE_AWS_REGION = ap-south-1
  VITE_USER_POOL_ID = (will be set after Cognito deployment)
  VITE_USER_POOL_CLIENT_ID = (will be set after Cognito deployment)
  ```

Click **"Next"**

### 2.4 Review and Deploy

1. Review all settings
2. Click **"Save and deploy"**
3. Wait for deployment to complete (usually 3-5 minutes)

## Step 3: Configure Custom Domain (Optional)

### 3.1 Add Custom Domain

1. In Amplify Console, click **"Domain management"**
2. Click **"Add domain"**
3. Enter your domain: `app.satyamool.com`
4. Follow the DNS configuration instructions
5. Wait for SSL certificate provisioning (can take up to 24 hours)

### 3.2 Update DNS Records

Add the CNAME records provided by Amplify to your DNS provider:
```
Type: CNAME
Name: app
Value: [provided by Amplify]
```

## Step 4: Configure Environment Variables

After deploying the backend API Gateway, update the environment variables:

1. Go to Amplify Console
2. Click on your app
3. Click **"Environment variables"** in the left menu
4. Add/Update:
   ```
   VITE_API_BASE_URL = https://YOUR_API_GATEWAY_URL/v1
   VITE_AWS_REGION = ap-south-1
   VITE_USER_POOL_ID = YOUR_COGNITO_USER_POOL_ID
   VITE_USER_POOL_CLIENT_ID = YOUR_COGNITO_CLIENT_ID
   VITE_DOCUMENT_BUCKET = satyamool-documents-339648407295
   ```
5. Click **"Save"**
6. Trigger a new deployment: **"Redeploy this version"**

## Step 5: Enable Automatic Deployments

Amplify automatically deploys on every push to the connected branch.

### 5.1 Configure Branch Settings

1. In Amplify Console, click **"App settings"** → **"Branch settings"**
2. Verify auto-deployment is enabled
3. Configure branch patterns if needed

### 5.2 Set Up Pull Request Previews (Optional)

1. Click **"Previews"** in the left menu
2. Enable **"Pull request previews"**
3. Select which branches to create previews for

## Step 6: Monitor Deployments

### 6.1 View Build Logs

1. Click on a deployment in the Amplify Console
2. View build logs for each phase:
   - Provision
   - Build
   - Deploy
   - Verify

### 6.2 Access Your App

After successful deployment, your app will be available at:
- **Amplify URL**: `https://newer_mani.XXXXXXXXXX.amplifyapp.com`
- **Custom Domain** (if configured): `https://app.satyamool.com`

## Step 7: Configure Redirects and Rewrites

For React Router to work properly, add redirects:

1. In Amplify Console, click **"Rewrites and redirects"**
2. Add this rule:
   ```
   Source: </^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>
   Target: /index.html
   Type: 200 (Rewrite)
   ```
3. Click **"Save"**

## Troubleshooting

### Build Fails

**Issue**: `npm ci` fails
**Solution**: Delete `package-lock.json` and run `npm install` locally, then commit

**Issue**: TypeScript errors
**Solution**: The build script skips TypeScript checking. If needed, fix errors in the code.

**Issue**: Environment variables not working
**Solution**: Ensure variables start with `VITE_` prefix for Vite to expose them

### App Not Loading

**Issue**: Blank page after deployment
**Solution**: 
1. Check browser console for errors
2. Verify API_BASE_URL is set correctly
3. Check CORS settings on API Gateway

**Issue**: 404 on page refresh
**Solution**: Add the redirect rule in Step 7

### API Connection Issues

**Issue**: Cannot connect to backend
**Solution**:
1. Verify API Gateway is deployed
2. Check CORS configuration
3. Verify environment variables are set
4. Check browser network tab for actual errors

## Next Steps After Deployment

1. **Deploy API Gateway** for backend endpoints
2. **Configure Cognito** for user authentication
3. **Set up CloudFront** (optional, for better performance)
4. **Enable monitoring** with CloudWatch
5. **Set up custom domain** with SSL certificate
6. **Configure CI/CD notifications** (Slack, email, etc.)

## Amplify CLI (Alternative Method)

If you prefer using the CLI:

```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Configure Amplify
amplify configure

# Initialize Amplify in your project
cd packages/frontend
amplify init

# Add hosting
amplify add hosting

# Publish
amplify publish
```

## Cost Estimate

AWS Amplify Hosting costs:
- **Build minutes**: $0.01 per build minute
- **Storage**: $0.023 per GB per month
- **Data transfer**: $0.15 per GB served

**Estimated monthly cost**: $5-15 for low to moderate traffic

## Useful Commands

```bash
# View deployment status
aws amplify list-apps --region ap-south-1

# Get app details
aws amplify get-app --app-id YOUR_APP_ID --region ap-south-1

# Trigger manual deployment
aws amplify start-job --app-id YOUR_APP_ID --branch-name newer_mani --job-type RELEASE --region ap-south-1

# View build logs
aws amplify list-jobs --app-id YOUR_APP_ID --branch-name newer_mani --region ap-south-1
```

## Security Best Practices

1. **Use environment variables** for all sensitive configuration
2. **Enable branch protection** on GitHub
3. **Use HTTPS only** (enforced by Amplify)
4. **Implement CSP headers** in Amplify settings
5. **Regular dependency updates** via Dependabot
6. **Enable AWS WAF** for DDoS protection (optional)

## Support

- AWS Amplify Documentation: https://docs.amplify.aws/
- GitHub Issues: Create issues in your repository
- AWS Support: Contact through AWS Console

---

**Deployment Status**: Ready to deploy  
**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
