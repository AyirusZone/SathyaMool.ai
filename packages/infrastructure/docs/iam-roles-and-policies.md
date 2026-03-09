# IAM Roles and Policies - SatyaMool

This document describes the IAM roles and policies used in the SatyaMool platform, following the principle of least privilege.

## Overview

SatyaMool uses separate IAM roles for each Lambda function and service, ensuring that each component has only the permissions it needs to perform its specific tasks.

## Lambda Execution Roles

### 1. OCR Lambda Role

**Purpose**: Process documents using Amazon Textract

**Permissions**:
- **S3**: Read documents from document bucket
- **DynamoDB**: Read/write to Documents table
- **SQS**: Consume messages from processing queue
- **Textract**: Invoke document analysis APIs
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::satyamool-documents-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "arn:aws:sqs:*:*:satyamool-document-processing"
    },
    {
      "Effect": "Allow",
      "Action": [
        "textract:AnalyzeDocument",
        "textract:StartDocumentAnalysis",
        "textract:GetDocumentAnalysis"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": [
            "s3.us-east-1.amazonaws.com",
            "dynamodb.us-east-1.amazonaws.com",
            "sqs.us-east-1.amazonaws.com"
          ]
        }
      }
    }
  ]
}
```

### 2. Translation Lambda Role

**Purpose**: Translate documents using Amazon Translate

**Permissions**:
- **DynamoDB**: Read/write to Documents table, read from DynamoDB Streams
- **Translate**: Invoke translation APIs
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "translate:TranslateText"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 3. Analysis Lambda Role

**Purpose**: Analyze documents using Amazon Bedrock

**Permissions**:
- **DynamoDB**: Read/write to Documents table, read from DynamoDB Streams
- **Bedrock**: Invoke model APIs
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel"
      ],
      "Resource": "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 4. Lineage Lambda Role

**Purpose**: Construct ownership lineage graphs

**Permissions**:
- **DynamoDB**: Read from Documents table, write to Lineage table, read from DynamoDB Streams
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-Lineage"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 5. Scoring Lambda Role

**Purpose**: Calculate Trust Scores

**Permissions**:
- **DynamoDB**: Read from Lineage and Documents tables, write to TrustScores table
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Lineage",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-TrustScores"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 6. Notification Lambda Role

**Purpose**: Send email and in-app notifications

**Permissions**:
- **DynamoDB**: Read from Users and Properties tables, write to Notifications table, read from DynamoDB Streams
- **SES**: Send emails
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:GetRecords",
        "dynamodb:GetShardIterator",
        "dynamodb:DescribeStream",
        "dynamodb:ListStreams"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Users",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Properties",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Properties/stream/*",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/stream/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-Notifications"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "ses:FromAddress": [
            "noreply@satyamool.com",
            "noreply-dev@satyamool.com"
          ]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 7. Cleanup Lambda Role

**Purpose**: Clean up deactivated user accounts

**Permissions**:
- **DynamoDB**: Read/write to all tables
- **S3**: Delete objects from document bucket
- **Cognito**: Delete users
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Users",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Properties",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Lineage",
        "arn:aws:dynamodb:*:*:table/SatyaMool-TrustScores",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Notifications",
        "arn:aws:dynamodb:*:*:table/SatyaMool-*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-AuditLogs"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:DeleteObjectVersion",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::satyamool-documents-*",
        "arn:aws:s3:::satyamool-documents-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminDeleteUser"
      ],
      "Resource": "arn:aws:cognito-idp:*:*:userpool/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

### 8. API Lambda Roles

**Purpose**: Handle API Gateway requests

**Permissions**:
- **DynamoDB**: Read/write to relevant tables based on endpoint
- **S3**: Generate presigned URLs, read/write objects
- **Cognito**: Manage users (admin endpoints only)
- **KMS**: Decrypt encrypted data
- **CloudWatch Logs**: Write logs
- **X-Ray**: Write trace data

**Policy** (varies by endpoint, example for property management):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:DeleteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:*:*:table/SatyaMool-Properties",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Properties/index/*",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents",
        "arn:aws:dynamodb:*:*:table/SatyaMool-Documents/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::satyamool-documents-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/SatyaMool-AuditLogs"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "arn:aws:kms:*:*:key/*"
    }
  ]
}
```

## Service Roles

### API Gateway CloudWatch Logs Role

**Purpose**: Allow API Gateway to write logs to CloudWatch

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams",
        "logs:PutLogEvents",
        "logs:GetLogEvents",
        "logs:FilterLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### EventBridge Role for Lambda Invocation

**Purpose**: Allow EventBridge to invoke cleanup Lambda

**Policy**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:*:*:function:SatyaMool-Cleanup-Deactivated-Accounts"
    }
  ]
}
```

## Best Practices

### 1. Least Privilege Principle

- Grant only the minimum permissions required for each function
- Use resource-level permissions where possible (avoid `Resource: "*"`)
- Use condition keys to further restrict access

### 2. Separation of Concerns

- Each Lambda function has its own execution role
- Roles are scoped to specific tables and operations
- No cross-function permission sharing

### 3. Encryption

- All roles have KMS decrypt permissions for encrypted data
- KMS permissions are scoped to specific services via conditions
- Encryption keys are rotated annually

### 4. Audit and Monitoring

- All IAM role assumptions are logged in CloudTrail
- Regular review of IAM policies and permissions
- Use AWS IAM Access Analyzer to identify overly permissive policies

### 5. Temporary Credentials

- Lambda functions use temporary credentials from execution roles
- No long-lived access keys stored in code or environment variables
- Credentials automatically rotated by AWS

## Security Considerations

### Resource-Level Permissions

Where possible, use resource-level permissions instead of wildcard (`*`):

**Good**:
```json
{
  "Resource": "arn:aws:s3:::satyamool-documents-123456789012/*"
}
```

**Avoid**:
```json
{
  "Resource": "*"
}
```

### Condition Keys

Use condition keys to further restrict access:

```json
{
  "Condition": {
    "StringEquals": {
      "kms:ViaService": "s3.us-east-1.amazonaws.com"
    }
  }
}
```

### Cross-Account Access

For cross-account scenarios (e.g., separate AWS accounts for dev/staging/prod):

1. Use IAM roles with trust relationships
2. Require external ID for additional security
3. Use AWS Organizations for centralized management

## Compliance

### GDPR Considerations

- Audit logs track all data access operations
- User data deletion is comprehensive (cleanup Lambda)
- Encryption at rest and in transit

### SOC 2 Considerations

- Least-privilege access controls
- Comprehensive audit logging
- Regular access reviews

## Troubleshooting

### Common Permission Issues

**Issue**: Lambda function cannot read from S3
```
Solution: Verify S3 bucket policy allows Lambda execution role
Check KMS key policy allows Lambda role to decrypt
```

**Issue**: Lambda function cannot write to DynamoDB
```
Solution: Verify DynamoDB table policy (if any)
Check IAM role has PutItem/UpdateItem permissions
Verify table name matches in policy and code
```

**Issue**: API Gateway returns 403 Forbidden
```
Solution: Check Lambda authorizer is correctly configured
Verify JWT token contains required claims
Check API Gateway resource policy
```

## References

- [AWS IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [AWS Lambda Execution Role](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html)
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
