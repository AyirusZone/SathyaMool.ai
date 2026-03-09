# Fix: Refresh Token "Invalid Refresh Token" Error

## Problem
After successful login, users were immediately redirected back to the login page. The root causes were:

1. **Device Tracking Enabled**: Cognito User Pool had device tracking enabled with `challengeRequiredOnNewDevice: true`
2. **No Device Confirmation Flow**: Frontend doesn't implement device confirmation flow
3. **Refresh Token Rejection**: Cognito rejected refresh tokens because device wasn't confirmed
4. **Authorizer Context Mismatch**: All Lambda functions were looking for `authorizer.claims.sub` but the authorizer was returning `authorizer.userId`
5. **Authorizer Policy Too Specific**: Authorizer was generating policy for exact resource ARN instead of wildcard

## Error Logs
```
NotAuthorizedException: Invalid Refresh Token
GET /properties 401 (Unauthorized) - despite authorizer success
```

## Solutions Implemented

### 1. Disabled Device Tracking
```typescript
// packages/infrastructure/lib/cognito-config.ts
deviceTracking: {
  challengeRequiredOnNewDevice: false,  // Changed from true
  deviceOnlyRememberedOnUserPrompt: false,  // Changed from true
}
```

### 2. Fixed Authorizer Policy to Use Wildcard
```typescript
// packages/backend/src/authorizer/index.ts
// Use wildcard to allow all API calls after authentication
const arnParts = event.methodArn.split('/');
const apiGatewayArnPrefix = arnParts.slice(0, 2).join('/');
const wildcardArn = `${apiGatewayArnPrefix}/*/*`;

return generatePolicy(userId, 'Allow', wildcardArn, { userId, email, role });
```

### 3. Fixed All Lambda Functions to Read Correct Authorizer Context
Updated all Lambda functions to read from `authorizer.userId` instead of `authorizer.claims.sub`:

**Files Updated**:
- `packages/backend/src/properties/list-properties.ts`
- `packages/backend/src/properties/create-property.ts`
- `packages/backend/src/properties/get-property.ts`
- `packages/backend/src/properties/delete-property.ts`
- `packages/backend/src/properties/generate-upload-url.ts`
- `packages/backend/src/properties/generate-report.ts`
- `packages/backend/src/properties/get-lineage.ts`
- `packages/backend/src/properties/get-trust-score.ts`
- `packages/backend/src/properties/register-document.ts`
- `packages/backend/src/notifications/get-notifications.ts`
- `packages/backend/src/admin/search-audit-logs.ts`
- `packages/backend/src/admin/export-user-data.ts`
- `packages/backend/src/admin/export-audit-logs.ts`
- `packages/backend/src/integration/gov-portal-ec-retrieval.ts`
- `packages/backend/src/audit/logger.ts`

**Pattern**:
```typescript
// OLD (incorrect)
const userId = event.requestContext.authorizer?.claims?.sub;

// NEW (correct)
const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
```

## Why This Fixes It
- Device tracking requires a device confirmation flow that our frontend doesn't implement
- When device tracking is enabled, Cognito ties refresh tokens to specific devices
- Without device confirmation, Cognito rejects refresh tokens as "Invalid"
- Disabling device tracking allows refresh tokens to work without device confirmation
- Wildcard policy allows all API calls after successful authentication (cached for 5 minutes)
- Lambda functions now correctly extract userId from authorizer context

## Deployment
```bash
cd packages/backend
npm run build

cd ../infrastructure
npm run build
npx cdk deploy --require-approval never --region ap-south-1
```

## User Action Required
**IMPORTANT**: Existing users must clear browser storage and log in again to get new tokens.

### Steps for Users:
1. Open Developer Tools (F12)
2. Go to Application/Storage tab
3. Find Local Storage → your domain
4. Clear these keys: `accessToken`, `refreshToken`, `user`
5. Refresh the page
6. Log in again

## Testing
After redeployment and fresh login:
1. Login should work ✅
2. Dashboard should load ✅
3. API calls should work ✅
4. Token refresh should work ✅
5. No redirect loop ✅

## Related Files
- `packages/infrastructure/lib/cognito-config.ts` - Cognito configuration
- `packages/backend/src/authorizer/index.ts` - JWT authorizer with wildcard policy
- `packages/backend/src/auth/refresh-token.ts` - Refresh token Lambda
- `packages/frontend/src/services/api.ts` - API interceptor with refresh logic
- All property, notification, admin, and integration Lambda functions

## Date
March 7, 2026
