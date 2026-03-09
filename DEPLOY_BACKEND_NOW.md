# Deploy Backend for Login - Step by Step

## What We Just Created

I've created 3 new files to add authentication to your stack:

1. **`cognito-config.ts`** - Cognito User Pool configuration
2. **`auth-lambdas.ts`** - All 5 auth Lambda functions
3. **`auth-api-gateway.ts`** - API Gateway with auth endpoints

## Step 1: Update the Main CDK Stack

We need to integrate these into `satyamool-stack.ts`. Here's what to add:

### Add Imports (at the top of the file)

Add these imports after the existing imports:

```typescript
import { CognitoConfig } from './cognito-config';
import { AuthLambdas } from './auth-lambdas';
import { AuthApiGateway } from './auth-api-gateway';
```

### Add to Constructor (after DynamoDB tables are created)

Find where the DynamoDB tables are created (around line 200-400), then add this code after all tables are created:

```typescript
// ========== Cognito User Pool (Task 2.1) ==========
const cognitoConfig = new CognitoConfig(this, 'CognitoConfig');

// ========== Auth Lambda Functions (Task 3) ==========
const authLambdas = new AuthLambdas(this, 'AuthLambdas', {
  userPool: cognitoConfig.userPool,
  userPoolClient: cognitoConfig.userPoolClient,
  usersTable: usersTable,
  auditLogsTable: auditLogsTable,
  nodeLayer: layers.nodeLayer,
});

// ========== Auth API Gateway (Task 22.1) ==========
const authApiGateway = new AuthApiGateway(this, 'AuthApiGateway', {
  registerLambda: authLambdas.registerLambda,
  loginLambda: authLambdas.loginLambda,
  verifyOtpLambda: authLambdas.verifyOtpLambda,
  refreshTokenLambda: authLambdas.refreshTokenLambda,
});
```

## Step 2: Deploy to AWS

```bash
# Navigate to infrastructure directory
cd packages/infrastructure

# Deploy the stack
npx cdk deploy --require-approval never
```

This will:
- Create Cognito User Pool
- Deploy 5 Lambda functions (register, login, verify-otp, refresh-token, authorizer)
- Create API Gateway with auth endpoints
- Configure all permissions

**Deployment time**: 5-10 minutes

## Step 3: Get the Output Values

After deployment completes, you'll see outputs like:

```
Outputs:
SatyaMoolStack.UserPoolId = ap-south-1_XXXXXXXXX
SatyaMoolStack.UserPoolClientId = XXXXXXXXXXXXXXXXXXXXXXXXXX
SatyaMoolStack.ApiUrl = https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/v1/
```

**Save these values!** You'll need them for Amplify.

## Step 4: Update Amplify Environment Variables

1. Go to Amplify Console: https://console.aws.amazon.com/amplify/home?region=ap-south-1
2. Click on your app
3. Click **"Environment variables"** in left menu
4. Update these variables with the values from Step 3:

```
VITE_API_BASE_URL = https://XXXXXXXXXX.execute-api.ap-south-1.amazonaws.com/v1
VITE_USER_POOL_ID = ap-south-1_XXXXXXXXX
VITE_USER_POOL_CLIENT_ID = XXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_AWS_REGION = ap-south-1
VITE_DOCUMENT_BUCKET = satyamool-documents-339648407295
```

5. Click **"Save"**

## Step 5: Redeploy Frontend

1. In Amplify Console, go to **"Deployments"** tab
2. Click **"Redeploy this version"**
3. Wait 2-3 minutes

## Step 6: Test Login!

1. Open your Amplify URL
2. Click **"Register"** or **"Sign Up"**
3. Enter email and password
4. Check your email for verification code
5. Verify your email
6. Login with your credentials

**Login should now work!** 🎉

---

## Quick Commands

```bash
# Check if deployment is ready
cd packages/infrastructure

# See what will be deployed
npx cdk diff

# Deploy
npx cdk deploy --require-approval never

# Get outputs
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --region ap-south-1 \
  --query 'Stacks[0].Outputs'
```

---

## Troubleshooting

### Build Errors

**Error**: "Cannot find module './cognito-config'"
**Solution**: Make sure all 3 new files are in `packages/infrastructure/lib/`

**Error**: "usersTable is not defined"
**Solution**: Make sure you add the code after the DynamoDB tables are created

### Deployment Errors

**Error**: "User Pool already exists"
**Solution**: Delete the existing User Pool or change the name in cognito-config.ts

**Error**: "Lambda function code not found"
**Solution**: Make sure backend is compiled:
```bash
cd packages/backend
npm run build
```

### Login Still Doesn't Work

**Check 1**: Verify environment variables in Amplify
```bash
aws amplify get-app --app-id YOUR_APP_ID --region ap-south-1
```

**Check 2**: Check API Gateway URL
```bash
curl https://YOUR_API_URL/v1/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.com","password":"Test123"}'
```

**Check 3**: Check Lambda logs
```bash
aws logs tail /aws/lambda/SatyaMool-Auth-Login --follow --region ap-south-1
```

---

## What Will Work After This

### ✅ Will Work:
- User registration
- Email verification
- User login
- JWT token generation
- Token refresh
- Protected routes

### ⚠️ Won't Work Yet:
- Creating properties (need property Lambda functions)
- Uploading documents (need property Lambda functions)
- Viewing data (need property Lambda functions)

---

## Next Steps

After login works, you can add more Lambda functions for:
- Property management
- Document upload
- Admin panel
- Notifications

See `DEPLOYMENT_ROADMAP.md` for the complete plan.

---

**Ready to deploy?** Follow Step 1 above to update the stack!

**Region**: ap-south-1 (Mumbai)  
**Account**: 339648407295
