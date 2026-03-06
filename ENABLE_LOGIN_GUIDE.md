# How to Enable Login - Quick Guide

## Current Situation

✅ **Frontend is deployed** - Your UI is live!  
❌ **Backend is not deployed** - Login won't work yet

## Why Login Doesn't Work

The frontend needs two backend services:
1. **Cognito User Pool** - Handles user authentication
2. **API Gateway** - Handles API requests

Neither of these are deployed yet, so login will fail.

## Solution: Deploy Backend Services

You have 2 options:

---

## Option 1: Quick Manual Setup (30 minutes) ⚡

Deploy Cognito manually through AWS Console - fastest way to enable login.

### Step 1: Create Cognito User Pool

1. Go to AWS Console: https://console.aws.amazon.com/cognito/home?region=ap-south-1
2. Click **"Create user pool"**
3. Configure sign-in:
   - ✅ Email
   - ✅ Phone number
   - Click **"Next"**

4. Configure security:
   - Password policy: Default
   - MFA: Optional (choose "No MFA" for testing)
   - Click **"Next"**

5. Configure sign-up:
   - Self-registration: Enabled
   - Attributes: Email, Phone number
   - Click **"Next"**

6. Configure message delivery:
   - Email provider: Send email with Cognito
   - Click **"Next"**

7. Integrate your app:
   - User pool name: `SatyaMool-Users`
   - App client name: `SatyaMool-Web`
   - Click **"Next"**

8. Review and create:
   - Click **"Create user pool"**

9. **Save these values** (you'll need them):
   - User Pool ID: `ap-south-1_XXXXXXXXX`
   - App Client ID: `XXXXXXXXXXXXXXXXXXXXXXXXXX`

### Step 2: Update Amplify Environment Variables

1. Go to Amplify Console: https://console.aws.amazon.com/amplify/home?region=ap-south-1
2. Click on your app
3. Click **"Environment variables"** in left menu
4. Update these variables:
   ```
   VITE_USER_POOL_ID = ap-south-1_XXXXXXXXX (from Step 1)
   VITE_USER_POOL_CLIENT_ID = XXXXXXXXXXXXXXXXXXXXXXXXXX (from Step 1)
   ```
5. Click **"Save"**

### Step 3: Redeploy Frontend

1. In Amplify Console, go to **"Deployments"** tab
2. Click **"Redeploy this version"**
3. Wait 2-3 minutes for deployment

### Step 4: Test Login

1. Open your Amplify URL
2. Click **"Register"** or **"Sign Up"**
3. Enter email and password
4. Verify email (check your inbox)
5. Login!

**Note**: API calls still won't work (need API Gateway), but authentication will work!

---

## Option 2: Deploy via CDK (1-2 hours) 🔧

Deploy everything properly using Infrastructure as Code.

This requires:
1. Adding Cognito to CDK stack
2. Creating Lambda functions for auth endpoints
3. Deploying API Gateway
4. Updating Amplify environment variables

**This is more complex but production-ready.**

See `AMPLIFY_DEPLOYMENT_STEPS.md` for detailed instructions.

---

## Recommended Approach

**For quick testing**: Use Option 1 (Manual Setup)
- ✅ Fast (30 minutes)
- ✅ Login works immediately
- ⚠️ API calls still won't work

**For production**: Use Option 2 (CDK Deployment)
- ✅ Proper infrastructure
- ✅ Everything works
- ⚠️ Takes longer

---

## What Will Work After Option 1

### ✅ Will Work:
- User registration
- Email verification
- User login
- JWT token generation
- Protected routes

### ⚠️ Won't Work Yet:
- Creating properties (needs API Gateway)
- Uploading documents (needs API Gateway)
- Viewing data (needs API Gateway)
- Any API calls (needs API Gateway)

---

## Quick Commands to Check Status

```bash
# Check if Cognito User Pool exists
aws cognito-idp list-user-pools --max-results 10 --region ap-south-1

# Check Amplify app
aws amplify list-apps --region ap-south-1

# Check environment variables
aws amplify get-app --app-id YOUR_APP_ID --region ap-south-1
```

---

## Troubleshooting

### "User Pool not found"
- Make sure you created it in **ap-south-1** region
- Check User Pool ID is correct

### "Invalid client ID"
- Make sure App Client ID is correct
- Check you copied the full ID

### "Email not verified"
- Check your email inbox
- Click verification link
- Try resending verification code

### Login still doesn't work
- Check browser console (F12) for errors
- Verify environment variables are set correctly
- Make sure you redeployed after updating variables

---

## Next Steps After Login Works

Once login is working, you'll want to:

1. **Deploy API Gateway** - Enable backend API calls
2. **Create Lambda functions** - Handle API requests
3. **Test full application** - Verify everything works

See `DEPLOYMENT_ROADMAP.md` for the complete plan.

---

**Quick Start**: Follow Option 1 above (30 minutes)  
**Production Ready**: Follow Option 2 (see AMPLIFY_DEPLOYMENT_STEPS.md)  
**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
