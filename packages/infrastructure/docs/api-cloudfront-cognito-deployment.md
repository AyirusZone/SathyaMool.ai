# API Gateway, CloudFront, and Cognito Deployment Guide

## API Gateway Deployment (Task 28.5)

### Configuration

**API Name**: `SatyaMool-API`
**Type**: REST API
**Stage**: dev/staging/prod
**Endpoint Type**: Regional

### Features

1. **Lambda Authorizer**: JWT token validation
2. **Rate Limiting**: 100 req/min per user (prod)
3. **CORS**: Configured for frontend origins
4. **Caching**: Enabled for GET endpoints (staging/prod)
5. **Access Logging**: CloudWatch Logs
6. **X-Ray Tracing**: Enabled

### Endpoints

```
POST   /v1/auth/register
POST   /v1/auth/login
POST   /v1/auth/verify-otp
POST   /v1/auth/refresh
POST   /v1/properties
GET    /v1/properties
GET    /v1/properties/{id}
DELETE /v1/properties/{id}
POST   /v1/properties/{id}/upload-url
POST   /v1/properties/{id}/documents
GET    /v1/properties/{id}/lineage
GET    /v1/properties/{id}/trust-score
GET    /v1/properties/{id}/report
GET    /v1/admin/users
PUT    /v1/admin/users/{id}/role
PUT    /v1/admin/users/{id}/deactivate
GET    /v1/admin/audit-logs
GET    /v1/admin/audit-logs/export
```

### Custom Domain (Optional)

**Domain**: api.satyamool.com (prod)
**Certificate**: ACM certificate in us-east-1
**Base Path Mapping**: / → prod stage

### Deployment

```bash
# Deploy via CDK
cdk deploy

# Get API endpoint
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
  --output text

# Test API
curl https://api-id.execute-api.us-east-1.amazonaws.com/prod/v1/health
```

## CloudFront Deployment (Task 28.6)

### Configuration

**Distribution**: SatyaMool Frontend
**Origin**: S3 bucket (satyamool-prod-frontend)
**Price Class**: PriceClass_200 (prod), PriceClass_100 (dev/staging)
**SSL Certificate**: ACM certificate in us-east-1
**Custom Domain**: app.satyamool.com (prod)

### Cache Behaviors

**Default Behavior**:
- Path Pattern: `/*`
- Viewer Protocol: Redirect HTTP to HTTPS
- Allowed Methods: GET, HEAD, OPTIONS
- Cached Methods: GET, HEAD
- Cache Policy: CachingOptimized
- Origin Request Policy: CORS-S3Origin
- TTL: Min=0, Default=86400 (24h), Max=31536000 (1y)

**API Behavior** (if API is behind CloudFront):
- Path Pattern: `/api/*`
- Viewer Protocol: HTTPS only
- Allowed Methods: ALL
- Cache Policy: CachingDisabled
- Origin Request Policy: AllViewer

### Origin Access Identity (OAI)

CloudFront uses OAI to access S3 bucket privately:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity E1234567890ABC"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::satyamool-prod-frontend/*"
    }
  ]
}
```

### Deployment

```bash
# Deploy via CDK
cdk deploy

# Get CloudFront distribution ID
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text

# Invalidate cache after deployment
aws cloudfront create-invalidation \
  --distribution-id E1234567890ABC \
  --paths "/*"
```

## Cognito Deployment (Task 28.7)

### User Pool Configuration

**User Pool Name**: satyamool-prod-users
**Sign-in Options**: Email, Phone Number
**MFA**: Optional (prod), Off (dev)
**Password Policy**:
- Min Length: 12 (prod), 8 (dev)
- Require: Lowercase, Uppercase, Numbers, Symbols

### Attributes

**Standard Attributes**:
- email (required, mutable)
- phone_number (required, mutable)

**Custom Attributes**:
- custom:role (String) - User role
- custom:status (String) - Account status

### Email/SMS Configuration

**Email Provider**: Amazon SES
**From Email**: noreply@satyamool.com
**Reply-To Email**: support@satyamool.com

**SMS Provider**: Amazon SNS
**SMS Role**: Cognito SMS role with SNS permissions

### App Client

**Client Name**: satyamool-web-client
**Auth Flows**: USER_PASSWORD_AUTH, REFRESH_TOKEN_AUTH
**Token Validity**:
- Access Token: 1 hour
- ID Token: 1 hour
- Refresh Token: 30 days

### Deployment

```bash
# Deploy via CDK
cdk deploy

# Get User Pool ID
aws cloudformation describe-stacks \
  --stack-name SatyaMoolStack \
  --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
  --output text

# Configure SMS settings
aws cognito-idp update-user-pool \
  --user-pool-id us-east-1_ABC123 \
  --sms-configuration SnsCallerArn=arn:aws:iam::123456789012:role/CognitoSMSRole
```

## Monitoring and Alarms (Task 28.8)

### CloudWatch Dashboards

1. **API Metrics Dashboard**: Request count, latency, errors
2. **Processing Pipeline Dashboard**: Queue depth, Lambda duration, failures
3. **Cost Metrics Dashboard**: Lambda invocations, AI service usage

### CloudWatch Alarms

1. **Queue Depth High**: SQS > 10,000 messages
2. **Lambda Error Rate High**: Error rate > 1%
3. **API Error Rate High**: 5xx errors > 5%

### SNS Topic

**Topic Name**: SatyaMool-Alarm-Notifications
**Subscriptions**: ops@satyamool.com (email)

### Log Retention

- **Dev**: 7 days
- **Staging**: 30 days
- **Prod**: 90 days

### Deployment

```bash
# Deploy monitoring (included in CDK stack)
cdk deploy

# Subscribe to SNS topic
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:123456789012:SatyaMool-Alarm-Notifications \
  --protocol email \
  --notification-endpoint ops@satyamool.com
```

## Post-Deployment Checklist

- [ ] Verify API Gateway endpoints are accessible
- [ ] Test Lambda authorizer with valid/invalid tokens
- [ ] Verify CloudFront distribution serves frontend
- [ ] Test Cognito user registration and login
- [ ] Verify email notifications are sent (SES)
- [ ] Verify SMS OTP is sent (SNS)
- [ ] Subscribe to SNS alarm topic
- [ ] Test CloudWatch alarms trigger correctly
- [ ] Verify X-Ray traces are captured
- [ ] Test presigned URL generation and upload
- [ ] Verify document processing pipeline end-to-end
