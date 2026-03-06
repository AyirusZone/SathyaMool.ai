# Backend Deployment Summary

## What We're Deploying

To enable login on your frontend, we're deploying:

1. **Cognito User Pool** - User authentication service
2. **5 Auth Lambda Functions**:
   - Register (user signup)
   - Login (user authentication)
   - Verify OTP (phone verification)
   - Refresh Token (token renewal)
   - Authorizer (JWT validation)
3. **API Gateway** - REST API with auth endpoints

## Files Created

1. **`cognito-config.ts`** - Cognito User Pool configuration
2. **`auth-lambdas.ts`** - Auth Lambda functions
3. **`auth-api-gateway.ts`** - API Gateway with auth endpoints

## Issues Fixed

### Issue 1: AWS_REGION Environment Variable
**Error**: "AWS_REGION environment variable is reserved by the lambda runtime"
**Fix**: Removed AWS_REGION from environment variables (Lambda provides it automatically)

### Issue 2: SMS Message Template
**Error**: "Invalid SMS message for Admin create user flow parameter"
**Fix**: Changed SMS template to include `{username}` placeholder

### Issue 3: OAuth Configuration
**Error**: "AllowedOAuthFlows and AllowedOAuthScopes are required"
**Fix**: Removed OAuth configuration (not needed for username/password auth)

## Next Deployment

Running: `npm run build && npx cdk deploy`

This will:
- Create Cognito User Pool
- Deploy 5 Lambda functions
- Create API Gateway
- Configure all permissions

## After Deployment

You'll get these outputs:
```
UserPoolId = ap-south-1_XXXXXXXXX
UserPoolClientId = XXXXXXXXXXXXXXXXXXXXXXXXXX
ApiUrl = https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/v1/
```

## Update Amplify

After deployment, update these environment variables in Amplify:

```
VITE_API_BASE_URL = https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/v1
VITE_USER_POOL_ID = ap-south-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID = XXXXXXXXXXXXXXXXXXXXXXXXXX
```

Then redeploy frontend in Amplify Console.

## Test Login

1. Open your Amplify URL
2. Click "Register"
3. Enter email and password
4. Verify email
5. Login!

---

**Status**: Deploying backend services  
**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
