# SatyaMool Deployment Reference

Complete reference document for all deployed resources, URLs, credentials, and configuration.

---

## 🌐 Application URLs

### Frontend
- **Amplify URL**: https://newer-mani.d2kh7n7sie9i2y.amplifyapp.com/
- **GitHub Repository**: https://github.com/AyirusZone/SathyaMool.ai
- **Branch**: newer_mani

### Backend APIs
- **Auth API Gateway**: https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/
- **Main API Gateway**: https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/

---

## 🔐 AWS Account Information

- **AWS Account ID**: 339648407295
- **AWS Region**: ap-south-1 (Mumbai)
- **IAM User**: devMG
- **IAM Permissions**: AdministratorAccess

---

## 🔑 Cognito User Pool

- **User Pool ID**: ap-south-1_L9QAyUMp2
- **User Pool Client ID**: 257jk8dhpt1l6mu2l5trld1r4q
- **User Pool Name**: SatyaMool-Users
- **App Client Name**: SatyaMool-Web

### Authentication Configuration
- **Sign-in Methods**: Email, Phone Number
- **Auto-verify**: Email and Phone
- **Self Sign-up**: Enabled
- **MFA**: Optional
- **Password Policy**: 
  - Minimum 8 characters
  - Requires uppercase, lowercase, and digits
  - Special characters optional

---

## 🌍 Environment Variables for Amplify

Configure these in AWS Amplify Console → Environment variables:

```bash
VITE_API_BASE_URL=https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1
VITE_USER_POOL_ID=ap-south-1_L9QAyUMp2
VITE_USER_POOL_CLIENT_ID=257jk8dhpt1l6mu2l5trld1r4q
VITE_AWS_REGION=ap-south-1
VITE_DOCUMENT_BUCKET=satyamool-documents-339648407295
```

### How to Update Environment Variables
1. Go to: https://console.aws.amazon.com/amplify/home?region=ap-south-1
2. Click on your app
3. Go to "Environment variables" in left menu
4. Add/Update the variables above
5. Click "Save"
6. Redeploy the app

---

## 📡 API Endpoints

### Auth API (https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /auth/register | User registration | No |
| POST | /auth/login | User login | No |
| POST | /auth/verify-otp | Verify phone OTP | No |
| POST | /auth/refresh | Refresh access token | No |

### Main API (https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | /properties | Create property | Yes |
| GET | /properties | List properties | Yes |
| GET | /properties/{propertyId} | Get property details | Yes |
| DELETE | /properties/{propertyId} | Delete property | Yes |
| GET | /properties/{propertyId}/lineage | Get property lineage | Yes |
| GET | /properties/{propertyId}/trust-score | Get trust score | Yes |
| POST | /properties/{propertyId}/report | Generate report | Yes |
| POST | /documents/upload-url | Generate upload URL | Yes |
| POST | /documents/register | Register document | Yes |

---

## 🗄️ DynamoDB Tables

| Table Name | Purpose |
|------------|---------|
| SatyaMool-Users | User accounts and profiles |
| SatyaMool-Properties | Property records |
| SatyaMool-Documents | Document metadata |
| SatyaMool-Lineage | Property ownership history |
| SatyaMool-TrustScores | Trust score calculations |
| SatyaMool-AuditLogs | Audit trail for compliance |
| SatyaMool-Notifications | User notifications |

---

## 📦 S3 Buckets

| Bucket Name | Purpose |
|-------------|---------|
| satyamool-documents-339648407295 | Document storage |
| satyamool-audit-logs-339648407295 | Audit log archives |
| satyamool-frontend-339648407295 | Frontend static assets |

---

## ⚡ Lambda Functions

### Authentication Functions
- **SatyaMool-Auth-Register**: User registration handler
- **SatyaMool-Auth-Login**: User login handler
- **SatyaMool-Auth-VerifyOtp**: OTP verification handler
- **SatyaMool-Auth-RefreshToken**: Token refresh handler
- **SatyaMool-Auth-Authorizer**: JWT token validator

### Property Management Functions
- **SatyaMool-CreateProperty**: Create new property
- **SatyaMool-ListProperties**: List user properties
- **SatyaMool-GetProperty**: Get property details
- **SatyaMool-DeleteProperty**: Delete property
- **SatyaMool-GenerateUploadUrl**: Generate S3 upload URL
- **SatyaMool-RegisterDocument**: Register document metadata
- **SatyaMool-GetLineage**: Get property lineage
- **SatyaMool-GetTrustScore**: Calculate trust score
- **SatyaMool-GenerateReport**: Generate property report

### Processing Functions
- **SatyaMool-OCR-Processor**: Document OCR processing
- **SatyaMool-Notification-Processor**: Notification handler
- **SatyaMool-Cleanup-Deactivated-Accounts**: Account cleanup

---

## 🔄 SQS Queues

| Queue Name | Purpose |
|------------|---------|
| satyamool-document-processing | Document processing queue |
| satyamool-document-processing-dlq | Dead letter queue for failed processing |

**Queue URL**: https://sqs.ap-south-1.amazonaws.com/339648407295/satyamool-document-processing

---

## 🔐 KMS Encryption

- **Key ID**: 706dac77-659e-474d-aa97-ad94f26f21db
- **Alias**: satyamool/document-encryption
- **Key Rotation**: Enabled (Annual)

---

## 📊 Monitoring & Alerts

### SNS Topic
- **Topic Name**: SatyaMool-Alarm-Notifications
- **ARN**: arn:aws:sns:ap-south-1:339648407295:SatyaMool-Alarm-Notifications

### CloudWatch Log Groups
- `/aws/lambda/SatyaMool-Auth-Register`
- `/aws/lambda/SatyaMool-Auth-Login`
- `/aws/lambda/SatyaMool-CreateProperty`
- `/aws/lambda/SatyaMool-ListProperties`
- `/aws/apigateway/satyamool-auth-api-access`
- `/aws/apigateway/satyamool-main-api-access`

---

## 🚀 Deployment Commands

### Deploy Backend Infrastructure
```bash
cd packages/infrastructure
npx cdk deploy --require-approval never
```

### Build Backend Code
```bash
cd packages/backend
npm run build
```

### Deploy Frontend to Amplify
Frontend deploys automatically on push to GitHub branch `newer_mani`

---

## 🧪 Testing the Application

### 1. Test Registration
```bash
curl -X POST https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

### 2. Test Login
```bash
curl -X POST https://tabclk95h4.execute-api.ap-south-1.amazonaws.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test1234"
  }'
```

### 3. Test List Properties (requires auth token)
```bash
curl -X GET https://44f28lv3d2.execute-api.ap-south-1.amazonaws.com/v1/properties \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## 🔧 Troubleshooting

### Check Lambda Logs
```bash
# Auth Login logs
aws logs tail /aws/lambda/SatyaMool-Auth-Login --follow --region ap-south-1

# Create Property logs
aws logs tail /aws/lambda/SatyaMool-CreateProperty --follow --region ap-south-1
```

### Check Cognito Users
```bash
aws cognito-idp list-users \
  --user-pool-id ap-south-1_L9QAyUMp2 \
  --region ap-south-1
```

### Check DynamoDB Tables
```bash
# List all tables
aws dynamodb list-tables --region ap-south-1

# Scan properties table
aws dynamodb scan \
  --table-name SatyaMool-Properties \
  --region ap-south-1
```

---

## 📝 Important Notes

### Current Status
✅ Frontend deployed to Amplify
✅ Authentication working (register, login)
✅ Backend APIs deployed
✅ Database tables created
✅ S3 buckets configured
⚠️ Dashboard will be blank until you update VITE_API_BASE_URL

### Next Steps to Complete Setup
1. Update Amplify environment variable `VITE_API_BASE_URL` to Main API URL
2. Redeploy frontend in Amplify Console
3. Test creating a property
4. Test uploading documents

### Known Issues
- Email is required for registration (phone-only registration not supported due to Cognito configuration)
- CloudFront distribution disabled (requires AWS account verification)

---

## 📞 Support & Resources

### AWS Console Links
- **Amplify Console**: https://console.aws.amazon.com/amplify/home?region=ap-south-1
- **Cognito Console**: https://console.aws.amazon.com/cognito/home?region=ap-south-1
- **Lambda Console**: https://console.aws.amazon.com/lambda/home?region=ap-south-1
- **API Gateway Console**: https://console.aws.amazon.com/apigateway/home?region=ap-south-1
- **DynamoDB Console**: https://console.aws.amazon.com/dynamodb/home?region=ap-south-1
- **CloudWatch Console**: https://console.aws.amazon.com/cloudwatch/home?region=ap-south-1

### Documentation
- AWS CDK: https://docs.aws.amazon.com/cdk/
- AWS Amplify: https://docs.amplify.aws/
- AWS Cognito: https://docs.aws.amazon.com/cognito/

---

## 📅 Deployment History

| Date | Action | Status |
|------|--------|--------|
| 2026-03-06 | Frontend deployed to Amplify | ✅ Complete |
| 2026-03-06 | Auth API Gateway deployed | ✅ Complete |
| 2026-03-06 | Cognito User Pool created | ✅ Complete |
| 2026-03-06 | Auth Lambda functions deployed | ✅ Complete |
| 2026-03-06 | Main API Gateway deployed | ✅ Complete |
| 2026-03-06 | Property Lambda functions deployed | ✅ Complete |

---

**Last Updated**: March 6, 2026
**Document Version**: 1.0
**Maintained By**: Development Team
