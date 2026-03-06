# API Gateway Configuration

This document describes the API Gateway configuration for the SatyaMool platform.

## Overview

The API Gateway is configured as a REST API with the following features:
- **API Versioning**: All endpoints use `/v1/` prefix
- **Rate Limiting**: 100 requests per minute per user
- **CORS**: Configured for cross-origin requests
- **Authentication**: JWT-based authentication with Lambda authorizer
- **Error Handling**: Standardized error response format
- **Logging**: CloudWatch access logs and X-Ray tracing
- **Monitoring**: CloudWatch metrics enabled

## Architecture

```
Client → API Gateway (v1) → Lambda Authorizer → Lambda Functions
                ↓
         CloudWatch Logs
                ↓
            X-Ray Traces
```

## Endpoints

### Authentication Endpoints (Public)

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/v1/auth/register` | Register new user | No |
| POST | `/v1/auth/login` | Login user | No |
| POST | `/v1/auth/verify-otp` | Verify OTP | No |
| POST | `/v1/auth/refresh` | Refresh JWT token | No |

### Property Endpoints (Protected)

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/v1/properties` | Create property | Yes |
| GET | `/v1/properties` | List properties | Yes |
| GET | `/v1/properties/{id}` | Get property details | Yes |
| DELETE | `/v1/properties/{id}` | Delete property | Yes |
| POST | `/v1/properties/{id}/upload-url` | Generate upload URL | Yes |
| POST | `/v1/properties/{id}/documents` | Register document | Yes |
| GET | `/v1/properties/{id}/lineage` | Get ownership lineage | Yes |
| GET | `/v1/properties/{id}/trust-score` | Get trust score | Yes |
| GET | `/v1/properties/{id}/report` | Generate PDF report | Yes |

### Admin Endpoints (Admin Only)

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/v1/admin/users` | List all users | Yes (Admin) |
| PUT | `/v1/admin/users/{id}/role` | Update user role | Yes (Admin) |
| PUT | `/v1/admin/users/{id}/deactivate` | Deactivate user | Yes (Admin) |
| GET | `/v1/admin/audit-logs` | Search audit logs | Yes (Admin) |
| GET | `/v1/admin/audit-logs/export` | Export audit logs | Yes (Admin) |

### User Endpoints (Protected)

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/v1/users/export` | Export user data | Yes |
| GET | `/v1/users/notifications` | Get notifications | Yes |

## Rate Limiting

The API implements rate limiting using API Gateway Usage Plans:

- **Rate Limit**: 100 requests per second
- **Burst Limit**: 200 requests
- **Quota**: 100,000 requests per month

When rate limit is exceeded, the API returns:
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Rate limit exceeded. Please retry after 60 seconds."
}
```

HTTP Status: `429 Too Many Requests`
Header: `Retry-After: 60`

## CORS Configuration

CORS is enabled for all endpoints with the following configuration:

- **Allowed Origins**: `*` (TODO: Restrict to specific domains in production)
- **Allowed Methods**: All methods
- **Allowed Headers**: 
  - `Content-Type`
  - `X-Amz-Date`
  - `Authorization`
  - `X-Api-Key`
  - `X-Amz-Security-Token`
- **Allow Credentials**: `true`
- **Max Age**: 1 hour

## Authentication

### JWT Token Authentication

Protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

The Lambda authorizer validates the token and extracts user information:
- `principalId`: User ID
- `role`: User role (Standard_User, Professional_User, Admin_User)

### Authorization Flow

1. Client sends request with JWT token
2. API Gateway invokes Lambda authorizer
3. Authorizer validates token and returns IAM policy
4. API Gateway caches authorization result for 5 minutes
5. Request is forwarded to Lambda function

## Error Responses

All errors follow a standardized format:

```json
{
  "error": "ERROR_CODE",
  "message": "User-friendly error message",
  "details": {
    // Optional additional details
  }
}
```

### Standard Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `INVALID_REQUEST` | Invalid request body or parameters |
| 401 | `UNAUTHORIZED` | Authentication required |
| 403 | `FORBIDDEN` | Access denied |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| 500 | `INTERNAL_SERVER_ERROR` | Internal server error |

## Logging and Monitoring

### CloudWatch Access Logs

Access logs are written to CloudWatch Logs with the following fields:
- Caller identity
- HTTP method
- IP address
- Protocol
- Request time
- Resource path
- Response length
- Status code
- User agent

Log Group: `/aws/apigateway/satyamool-api-access`
Retention: 30 days

### X-Ray Tracing

X-Ray tracing is enabled for distributed tracing across:
- API Gateway
- Lambda functions
- DynamoDB
- S3
- External API calls (Textract, Translate, Bedrock)

### CloudWatch Metrics

The following metrics are automatically collected:
- Request count
- Latency (P50, P90, P99)
- Error rate (4XX, 5XX)
- Cache hit/miss rate

## Request Validation

### Body Validator

Validates request body for POST/PUT endpoints:
- Content-Type must be `application/json`
- Body must be valid JSON
- Required fields must be present

### Params Validator

Validates request parameters for GET/DELETE endpoints:
- Path parameters must be present
- Query parameters must match expected format

## API Versioning

All endpoints use the `/v1/` prefix for versioning. This allows for:
- Backward compatibility when introducing breaking changes
- Gradual migration to new API versions
- Support for multiple API versions simultaneously

Future versions can be deployed to `/v2/`, `/v3/`, etc.

## Stage Variables

Stage variables can be used for environment-specific configuration:
- `ENVIRONMENT`: dev, staging, production
- `LOG_LEVEL`: DEBUG, INFO, WARN, ERROR
- `FEATURE_FLAGS`: JSON object with feature flags

## Deployment

The API Gateway is deployed using AWS CDK:

```bash
cd packages/infrastructure
npm run build
cdk deploy
```

The deployment creates:
- REST API
- Lambda authorizer
- Usage plan and API key
- CloudWatch log group
- Gateway responses
- Request validators
- Resource policies

## Testing

### Unit Tests

Run CDK unit tests:

```bash
cd packages/infrastructure
npm test
```

### Integration Tests

Integration tests verify:
- Rate limiting enforcement
- CORS configuration
- Error response formats
- Authentication flow

### E2E Tests

End-to-end tests should verify:
- Complete request/response flow
- Rate limiting behavior
- Error handling
- Authentication and authorization

## Security Considerations

1. **API Keys**: API keys should be rotated regularly
2. **CORS**: Restrict allowed origins in production
3. **Rate Limiting**: Monitor for abuse and adjust limits
4. **Logging**: Ensure sensitive data is not logged
5. **Encryption**: All traffic uses TLS 1.2+

## Troubleshooting

### Common Issues

**Issue**: 401 Unauthorized
- **Cause**: Invalid or expired JWT token
- **Solution**: Refresh token or re-authenticate

**Issue**: 403 Forbidden
- **Cause**: Insufficient permissions
- **Solution**: Verify user role and endpoint requirements

**Issue**: 429 Rate Limit Exceeded
- **Cause**: Too many requests
- **Solution**: Implement exponential backoff and retry logic

**Issue**: 500 Internal Server Error
- **Cause**: Lambda function error
- **Solution**: Check CloudWatch Logs for Lambda errors

### Debugging

1. Check CloudWatch Logs for access logs
2. Use X-Ray traces to identify bottlenecks
3. Review Lambda function logs
4. Verify IAM permissions
5. Test with API Gateway test console

## Future Enhancements

1. **Custom Domain**: Configure custom domain with SSL certificate
2. **API Documentation**: Deploy Swagger UI for API documentation
3. **Request Throttling**: Implement per-endpoint throttling
4. **Response Caching**: Enable caching for read-heavy endpoints
5. **WebSocket Support**: Add WebSocket API for real-time notifications
6. **GraphQL**: Consider GraphQL API for flexible queries

## References

- [AWS API Gateway Documentation](https://docs.aws.amazon.com/apigateway/)
- [AWS CDK API Gateway Construct](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway-readme.html)
- [API Gateway Best Practices](https://docs.aws.amazon.com/apigateway/latest/developerguide/best-practices.html)
