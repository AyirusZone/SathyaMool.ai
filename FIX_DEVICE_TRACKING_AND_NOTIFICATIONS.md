# Fix Device Tracking and Add Notifications Endpoint

## Issues Fixed

### 1. Device Tracking Causing 401 Errors
**Problem**: The access token contains `device_key` claim, indicating device tracking is still enabled in Cognito. This causes:
- 401 Unauthorized on `/properties` endpoint
- 401 Unauthorized on `/auth/refresh` endpoint
- Redirect loop after login

**Root Cause**: Device tracking was enabled when the User Pool was first created. The CDK code was updated to disable it, but Cognito User Pool device tracking settings are **immutable** - they cannot be changed after creation.

**Solution**: The User Pool must be recreated with device tracking disabled.

### 2. Missing Notifications Endpoint
**Problem**: Frontend calls `/notifications` endpoint but it doesn't exist in API Gateway, causing CORS error.

**Solution**: Added GET notifications Lambda and wired it to Main API Gateway.

## Changes Made

### Infrastructure Changes

1. **Added GET Notifications Lambda** (`packages/infrastructure/lib/satyamool-stack.ts`):
   ```typescript
   const getNotificationsLambdaConstruct = createOptimizedProcessingLambda(
     this,
     'GetNotificationsFunction',
     {
       functionName: 'SatyaMool-Get-Notifications',
       description: 'Lambda function for retrieving user notifications via API',
       runtime: lambda.Runtime.NODEJS_20_X,
       handler: 'notifications/get-notifications.handler',
       code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/dist')),
       memorySize: 256,
       timeout: cdk.Duration.seconds(10),
       environment: {
         NOTIFICATIONS_TABLE_NAME: notificationsTable.tableName,
         LOG_LEVEL: 'INFO',
       },
     },
     layers
   );
   ```

2. **Added Notifications Endpoint to API Gateway** (`packages/infrastructure/lib/main-api-gateway.ts`):
   ```typescript
   // GET /v1/notifications - Get user notifications
   const notificationsResource = this.api.root.addResource('notifications');
   notificationsResource.addMethod(
     'GET',
     new apigateway.LambdaIntegration(props.getNotificationsLambda),
     {
       authorizer: authorizer,
       authorizationType: apigateway.AuthorizationType.CUSTOM,
     }
   );
   ```

3. **Updated MainApiGateway Props** to include `getNotificationsLambda`

4. **Passed getNotificationsLambda to MainApiGateway** in stack instantiation

### Device Tracking Fix (REQUIRES MANUAL ACTION)

The Cognito User Pool device tracking settings are **immutable**. To fix this, you have two options:

#### Option 1: Destroy and Recreate User Pool (RECOMMENDED for development)

**WARNING**: This will delete all existing users!

```bash
cd packages/infrastructure

# Destroy the stack (this will delete the User Pool)
cdk destroy

# Deploy again (this will create a new User Pool with device tracking disabled)
cdk deploy
```

After redeployment:
1. Update frontend `.env.production` with new Cognito User Pool ID and Client ID
2. Redeploy frontend to AWS Amplify
3. Users will need to re-register

#### Option 2: Manual AWS Console Fix (PRODUCTION)

If you have existing users you want to keep:

1. **Export existing users** (if needed):
   ```bash
   aws cognito-idp list-users \
     --user-pool-id ap-south-1_L9QAyUMp2 \
     --region ap-south-1 > users-backup.json
   ```

2. **Create new User Pool via AWS Console**:
   - Go to AWS Console → Cognito → User Pools
   - Click "Create user pool"
   - Configure with same settings as current pool
   - **IMPORTANT**: In "Device tracking" section, select:
     - ✅ "Don't remember devices"
     - ❌ Uncheck "Challenge required on new device"
     - ❌ Uncheck "Device only remembered on user prompt"

3. **Update CDK stack** to use new User Pool:
   - Comment out the `CognitoConfig` construct in `satyamool-stack.ts`
   - Import the existing User Pool instead:
     ```typescript
     const userPool = cognito.UserPool.fromUserPoolId(
       this,
       'ExistingUserPool',
       'NEW_USER_POOL_ID'
     );
     ```

4. **Migrate users** (if needed):
   - Use AWS Cognito User Import feature
   - Or have users re-register

## Deployment Steps

### Step 1: Compile Backend
```bash
cd packages/backend
npm run build
```

### Step 2: Deploy Infrastructure
```bash
cd packages/infrastructure

# If choosing Option 1 (destroy and recreate):
cdk destroy
cdk deploy

# If choosing Option 2 (manual fix):
# First create new User Pool in AWS Console, then:
cdk deploy
```

### Step 3: Test Notifications Endpoint
```bash
# Get access token by logging in
ACCESS_TOKEN="your_access_token_here"

# Test notifications endpoint
curl -X GET \
  https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/notifications \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Expected response:
```json
{
  "notifications": [],
  "unreadCount": 0,
  "total": 0
}
```

### Step 4: Test Login Flow
1. Clear browser cache and localStorage
2. Go to https://newer-mani.d2kh7n7sie9i2y.amplifyapp.com/
3. Login with credentials: manikantgautam3@gmail.com / 7415979166Mkg
4. Verify:
   - ✅ Login succeeds
   - ✅ Dashboard loads
   - ✅ No redirect loop
   - ✅ Properties endpoint works
   - ✅ Notifications endpoint works (no CORS error)
   - ✅ No `device_key` in access token

### Step 5: Push to GitHub
```bash
git add .
git commit -m "fix: Add notifications endpoint and document device tracking fix"
git push origin newer_mani
```

## Verification

### Check Access Token (Should NOT have device_key)
After login, decode the access token at https://jwt.io/

**Before fix** (BAD):
```json
{
  "sub": "d1435dda-9071-7075-15c1-475ad4762ba2",
  "device_key": "ap-south-1_79eda5a1-b432-433a-bba3-9c4c8a86e5d1",  ← THIS SHOULD NOT BE HERE
  "iss": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_L9QAyUMp2",
  ...
}
```

**After fix** (GOOD):
```json
{
  "sub": "d1435dda-9071-7075-15c1-475ad4762ba2",
  "iss": "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_NEW_POOL_ID",
  ...
}
```

### Check Notifications Endpoint
```bash
# Should return 200 OK with notifications array
curl -X GET \
  https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/notifications \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

## Summary

- ✅ Added GET notifications Lambda function
- ✅ Added `/notifications` endpoint to Main API Gateway
- ✅ Documented device tracking fix (requires User Pool recreation)
- ⚠️ **ACTION REQUIRED**: Choose Option 1 or Option 2 to fix device tracking
- ⚠️ **ACTION REQUIRED**: Deploy infrastructure changes

## Next Steps

1. Choose device tracking fix option (Option 1 recommended for development)
2. Deploy infrastructure changes
3. Test login flow and notifications endpoint
4. Update frontend environment variables if User Pool was recreated
5. Push changes to GitHub
