# KMS Key Rotation Configuration

## Overview

SatyaMool uses AWS KMS (Key Management Service) for encrypting sensitive data at rest. This document describes the KMS key rotation configuration and key policies.

## Key Rotation

### Automatic Rotation

- **Rotation Frequency**: Annual (every 365 days)
- **Rotation Type**: Automatic key rotation managed by AWS
- **Configuration**: `enableKeyRotation: true` in CDK stack
- **Impact**: Transparent to applications - AWS automatically uses the new key material for encryption while maintaining access to old key material for decryption

### Key Alias

- **Alias**: `alias/satyamool/document-encryption`
- **Purpose**: Provides a friendly name for the key and allows key rotation without changing application code

## Key Policies

The KMS key is configured with least-privilege access policies:

### 1. Root Account Management

```typescript
{
  sid: 'Enable IAM User Permissions',
  effect: 'Allow',
  principals: [AccountRootPrincipal],
  actions: ['kms:*'],
  resources: ['*']
}
```

- Allows AWS account root to manage the key
- Required for key administration and policy updates

### 2. CloudWatch Logs Encryption

```typescript
{
  sid: 'Allow CloudWatch Logs',
  effect: 'Allow',
  principals: [logs.region.amazonaws.com],
  actions: [
    'kms:Encrypt',
    'kms:Decrypt',
    'kms:ReEncrypt*',
    'kms:GenerateDataKey*',
    'kms:CreateGrant',
    'kms:DescribeKey'
  ],
  resources: ['*'],
  conditions: {
    ArnLike: {
      'kms:EncryptionContext:aws:logs:arn': 'arn:aws:logs:region:account:*'
    }
  }
}
```

- Allows CloudWatch Logs to encrypt log data
- Scoped to logs in the same region and account

### 3. S3 Service Encryption

```typescript
{
  sid: 'Allow S3 Service',
  effect: 'Allow',
  principals: [s3.amazonaws.com],
  actions: [
    'kms:Decrypt',
    'kms:GenerateDataKey'
  ],
  resources: ['*']
}
```

- Allows S3 to encrypt/decrypt objects using the key
- Required for server-side encryption with customer-managed keys (SSE-KMS)

### 4. SQS Service Encryption

```typescript
{
  sid: 'Allow SQS Service',
  effect: 'Allow',
  principals: [sqs.amazonaws.com],
  actions: [
    'kms:Decrypt',
    'kms:GenerateDataKey'
  ],
  resources: ['*']
}
```

- Allows SQS to encrypt/decrypt messages using the key
- Required for queue encryption

## Lambda Function Access

Lambda functions are granted decrypt permissions through IAM roles:

```typescript
encryptionKey.grantDecrypt(lambdaFunction);
```

This grants the following permissions:
- `kms:Decrypt`
- `kms:DescribeKey`

## Encrypted Resources

The following resources use this KMS key:

1. **S3 Buckets**
   - Document storage bucket
   - Audit log bucket

2. **SQS Queues**
   - Document processing queue
   - Dead-letter queue

3. **DynamoDB Tables** (using AWS-managed keys)
   - Users table
   - Properties table
   - Documents table
   - Lineage table
   - TrustScores table
   - AuditLogs table
   - Notifications table

## Monitoring

### CloudWatch Metrics

Monitor KMS key usage with CloudWatch metrics:

- `NumberOfDecryptCalls`: Number of decrypt operations
- `NumberOfEncryptCalls`: Number of encrypt operations
- `NumberOfGenerateDataKeyCalls`: Number of data key generation calls

### CloudTrail Logging

All KMS API calls are logged to CloudTrail:

- Key creation and deletion
- Key policy changes
- Key rotation events
- Encrypt/decrypt operations (if data events enabled)

## Key Rotation Verification

To verify key rotation is enabled:

```bash
aws kms get-key-rotation-status --key-id <key-id>
```

Expected output:
```json
{
  "KeyRotationEnabled": true
}
```

## Security Best Practices

1. **Least Privilege**: Only grant necessary KMS permissions to IAM roles
2. **Key Policies**: Use key policies to control access at the key level
3. **Monitoring**: Enable CloudTrail logging for all KMS operations
4. **Rotation**: Keep automatic key rotation enabled
5. **Backup**: KMS keys with `RETAIN` removal policy are preserved on stack deletion

## Compliance

- **Requirement 13.1**: Encryption at rest using AWS KMS with customer-managed keys
- **Requirement 13.7**: Annual key rotation for S3 encryption keys
- **Requirement 13.6**: Key policies with least-privilege access

## References

- [AWS KMS Key Rotation](https://docs.aws.amazon.com/kms/latest/developerguide/rotate-keys.html)
- [AWS KMS Key Policies](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [AWS KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
