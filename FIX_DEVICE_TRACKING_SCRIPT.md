# Script to Fix Device Tracking Issue

## Problem
The Cognito User Pool has device tracking enabled, which causes 401 errors. Device tracking settings are **immutable** and cannot be changed after User Pool creation.

## Solution
Destroy and recreate the User Pool with device tracking disabled.

## Steps

### Step 1: Backup Current Configuration
```bash
# Save current User Pool ID and Client ID
echo "Current User Pool ID: ap-south-1_L9QAyUMp2"
echo "Current Client ID: 257jk8dhpt1l6mu2l5trld1r4q"

# Optional: Export users if needed
aws cognito-idp list-users \
  --user-pool-id ap-south-1_L9QAyUMp2 \
  --region ap-south-1 > users-backup.json
```

### Step 2: Destroy and Recreate Stack
```bash
cd packages/infrastructure

# Destroy the stack (this will delete the User Pool and all users)
cdk destroy

# Deploy again (this will create a new User Pool with device tracking disabled)
cdk deploy
```

### Step 3: Update Frontend Environment Variables
After deployment, CDK will output new User Pool ID and Client ID. Update frontend:

```bash
cd packages/frontend

# Edit .env.production with new values
# VITE_COGNITO_USER_POOL_ID=<new_user_pool_id>
# VITE_COGNITO_CLIENT_ID=<new_client_id>
```

### Step 4: Redeploy Frontend to AWS Amplify
```bash
git add .
git commit -m "fix: Update Cognito User Pool IDs after device tracking fix"
git push origin newer_mani
```

AWS Amplify will automatically redeploy the frontend.

### Step 5: Test Login Flow
1. Clear browser cache and localStorage
2. Go to https://newer-mani.d2kh7n7sie9i2y.amplifyapp.com/
3. Register a new account (old users were deleted)
4. Login and verify:
   - ✅ No redirect loop
   - ✅ Dashboard loads
   - ✅ Properties endpoint works
   - ✅ Notifications endpoint works
   - ✅ No `device_key` in access token

## Alternative: Manual AWS Console Fix (If you want to keep existing users)

If you have production users you want to keep:

1. **Export users** using AWS CLI or Console
2. **Create new User Pool** via AWS Console with device tracking disabled
3. **Update CDK code** to import existing User Pool instead of creating new one
4. **Import users** to new User Pool
5. **Update frontend** with new User Pool ID and Client ID

This is more complex but preserves user data.

## Recommendation

For development environment: **Use Step 2 (destroy and recreate)** - it's faster and cleaner.

For production environment: **Use manual fix** to preserve user data.
