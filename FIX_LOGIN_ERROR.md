# Fix Login Error - API Gateway Merged

## What Was Fixed

The auth endpoints (login, register, etc.) have been merged into the Main API Gateway. Now all API calls use a single URL.

## Current Status

✅ Auth endpoints added to Main API Gateway
✅ Backend deployed successfully
✅ All endpoints now available at: `https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/`

## What You Need to Do

The frontend environment variable is already set correctly in Amplify. Just redeploy the frontend:

### Option 1: Redeploy from Amplify Console (Recommended)

1. Go to: https://console.aws.amazon.com/amplify/home?region=ap-south-1
2. Click on your app
3. Click on the "newer-mani" branch
4. Click "Redeploy this version" button

### Option 2: Push a New Commit to GitHub

```bash
git add .
git commit -m "Merged auth endpoints into main API Gateway"
git push origin newer-mani
```

This will trigger an automatic deployment.

## Verify Environment Variable

The environment variable should already be set to:
```
VITE_API_BASE_URL=https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1
```

To verify:
1. Go to Amplify Console
2. Click on your app
3. Go to "Environment variables" in left menu
4. Check that `VITE_API_BASE_URL` is set correctly

## Test After Redeployment

1. Open: https://newer-mani.d2kh7n7sie9i2y.amplifyapp.com/
2. Try to login with your existing account
3. Login should now work!

## Available Endpoints

All endpoints are now on the Main API Gateway:

### Auth Endpoints (No Authorization)
- POST /v1/auth/register
- POST /v1/auth/login
- POST /v1/auth/verify-otp
- POST /v1/auth/refresh

### Property Endpoints (Authorization Required)
- POST /v1/properties
- GET /v1/properties
- GET /v1/properties/{id}
- DELETE /v1/properties/{id}
- GET /v1/properties/{id}/lineage
- GET /v1/properties/{id}/trust-score
- POST /v1/properties/{id}/report

### Document Endpoints (Authorization Required)
- POST /v1/documents/upload-url
- POST /v1/documents/register

## What Changed

**Before:**
- Auth API: `https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/` (auth endpoints)
- Main API: `https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/` (property endpoints)
- Frontend was configured to use Main API, but auth endpoints were on Auth API → Login failed

**After:**
- Main API: `https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/` (ALL endpoints)
- Frontend uses Main API for everything → Login works!

## Troubleshooting

If login still doesn't work after redeployment:

1. **Check browser console** for any errors
2. **Clear browser cache** and try again
3. **Check CloudWatch logs**:
   ```bash
   aws logs tail /aws/lambda/SatyaMool-Auth-Login --follow --region ap-south-1
   ```
4. **Test the endpoint directly**:
   ```bash
   curl -X POST https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"your-email@example.com","password":"YourPassword123"}'
   ```

## Summary

The issue was that the frontend was trying to call auth endpoints on the Main API Gateway, but they only existed on the Auth API Gateway. We fixed this by merging all auth endpoints into the Main API Gateway, so now everything uses one URL.

Just redeploy the frontend and login should work!
