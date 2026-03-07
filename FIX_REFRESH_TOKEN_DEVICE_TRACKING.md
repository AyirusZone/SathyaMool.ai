# Fix: Refresh Token "Invalid Refresh Token" Error

## Problem
After successful login, users were immediately redirected back to the login page. The root cause was:

1. **Device Tracking Enabled**: Cognito User Pool had device tracking enabled with `challengeRequiredOnNewDevice: true`
2. **No Device Confirmation Flow**: Frontend doesn't implement device confirmation flow
3. **Refresh Token Rejection**: Cognito rejected refresh tokens because device wasn't confirmed

## Error Logs
```
NotAuthorizedException: Invalid Refresh Token
```

## Solution
Disabled device tracking in Cognito User Pool configuration:

```typescript
// packages/infrastructure/lib/cognito-config.ts
deviceTracking: {
  challengeRequiredOnNewDevice: false,  // Changed from true
  deviceOnlyRememberedOnUserPrompt: false,  // Changed from true
}
```

## Why This Fixes It
- Device tracking requires a device confirmation flow that our frontend doesn't implement
- When device tracking is enabled, Cognito ties refresh tokens to specific devices
- Without device confirmation, Cognito rejects refresh tokens as "Invalid"
- Disabling device tracking allows refresh tokens to work without device confirmation

## Deployment
```bash
cd packages/infrastructure
npm run build
npx cdk deploy --require-approval never --region ap-south-1
```

## User Action Required
**IMPORTANT**: Existing users must log out and log in again to get new refresh tokens that work with the updated configuration.

### Steps for Users:
1. Clear browser localStorage (or just log out)
2. Log in again with your credentials
3. New refresh token will work correctly

## Testing
After redeployment and fresh login:
1. Login should work ✅
2. Dashboard should load ✅
3. API calls should work ✅
4. Token refresh should work ✅ (no more "Invalid Refresh Token" errors)

## Related Files
- `packages/infrastructure/lib/cognito-config.ts` - Cognito configuration
- `packages/backend/src/auth/refresh-token.ts` - Refresh token Lambda
- `packages/frontend/src/services/api.ts` - API interceptor with refresh logic

## Date
March 7, 2026
