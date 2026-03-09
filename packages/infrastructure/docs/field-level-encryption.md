# Field-Level Encryption

## Overview

SatyaMool implements field-level encryption for sensitive data stored in DynamoDB using the AWS Encryption SDK. This provides an additional layer of security beyond DynamoDB's encryption at rest.

## Architecture

### Encryption Flow

```
Plaintext Data → AWS Encryption SDK → KMS Key → Encrypted Data → DynamoDB
```

### Decryption Flow

```
DynamoDB → Encrypted Data → AWS Encryption SDK → KMS Key → Plaintext Data
```

## Encrypted Fields

### User Table

The following fields in the Users table are encrypted:

- `email`: User's email address
- `phoneNumber`: User's phone number
- `fullName`: User's full name

### Properties Table

The following fields in the Properties table are encrypted:

- `address`: Property address
- `ownerName`: Current owner name

### Documents Table

The following fields in the extracted data are encrypted:

- `extractedData.buyerName`: Buyer name from document
- `extractedData.sellerName`: Seller name from document
- `extractedData.ownerName`: Owner name from document

## Implementation

### AWS Encryption SDK

The implementation uses the AWS Encryption SDK for Node.js:

```typescript
import {
  KmsKeyringNode,
  buildClient,
  CommitmentPolicy,
} from '@aws-crypto/client-node';

const { encrypt, decrypt } = buildClient(
  CommitmentPolicy.REQUIRE_ENCRYPT_REQUIRE_DECRYPT
);
```

### Encryption Context

Each encrypted field includes an encryption context for additional security:

```typescript
const context = {
  tableName: 'Users',
  userId: user.userId,
};
```

The encryption context:
- Provides additional authenticated data (AAD)
- Must match during decryption
- Prevents ciphertext from being used in wrong context
- Logged in CloudTrail for audit purposes

### Key Management

- **KMS Key**: Uses the same customer-managed KMS key as S3 and SQS
- **Key Rotation**: Automatic annual rotation enabled
- **Key Policy**: Least-privilege access for Lambda functions

## Usage

### Encrypting User Data

```typescript
import { encryptUserFields } from './utils/field-encryption';

const user = {
  userId: 'user-123',
  email: 'user@example.com',
  phoneNumber: '+919876543210',
  fullName: 'John Doe',
  role: 'Standard_User',
};

const encryptedUser = await encryptUserFields(user);
// Store encryptedUser in DynamoDB
```

### Decrypting User Data

```typescript
import { decryptUserFields } from './utils/field-encryption';

// Retrieve encryptedUser from DynamoDB
const decryptedUser = await decryptUserFields(encryptedUser);
// Use decryptedUser in application
```

### Encrypting Property Data

```typescript
import { encryptPropertyFields } from './utils/field-encryption';

const property = {
  propertyId: 'prop-123',
  address: '123 Main St, Bangalore',
  ownerName: 'Jane Smith',
  surveyNumber: 'SY-456',
};

const encryptedProperty = await encryptPropertyFields(property);
// Store encryptedProperty in DynamoDB
```

### Encrypting Document Data

```typescript
import { encryptDocumentFields } from './utils/field-encryption';

const extractedData = {
  buyerName: 'John Doe',
  sellerName: 'Jane Smith',
  transactionDate: '2023-01-15',
  surveyNumber: 'SY-456',
};

const encryptedData = await encryptDocumentFields('doc-123', extractedData);
// Store encryptedData in DynamoDB
```

## Performance Considerations

### Encryption Overhead

- **Latency**: ~10-20ms per field encryption/decryption
- **Throughput**: Suitable for individual record operations
- **Batch Operations**: Use `encryptFieldsBatch` and `decryptFieldsBatch` for better performance

### Optimization Strategies

1. **Selective Encryption**: Only encrypt truly sensitive fields
2. **Caching**: Cache decrypted values in Lambda memory for duration of execution
3. **Batch Operations**: Encrypt/decrypt multiple fields in parallel
4. **Lazy Decryption**: Only decrypt fields when needed for display

## Security Benefits

### Defense in Depth

Field-level encryption provides multiple layers of security:

1. **Transport Layer**: TLS 1.2+ for data in transit
2. **Storage Layer**: DynamoDB encryption at rest (AWS-managed keys)
3. **Field Layer**: Client-side encryption with customer-managed KMS key
4. **Access Layer**: IAM policies and key policies

### Threat Protection

Protects against:

- **Database Compromise**: Even if DynamoDB is compromised, sensitive fields remain encrypted
- **Insider Threats**: Database administrators cannot read sensitive data without KMS access
- **Backup Exposure**: Backups contain encrypted data
- **Log Exposure**: Sensitive data not logged in plaintext

## Compliance

### Requirements

- **Requirement 13.3**: Encrypt sensitive fields in DynamoDB using field-level encryption
- **Requirement 13.1**: Use AWS KMS with customer-managed keys
- **Requirement 13.2**: Encrypt all data in transit using TLS 1.2+

### Audit Trail

All encryption/decryption operations are logged:

- **CloudTrail**: KMS API calls (Encrypt, Decrypt, GenerateDataKey)
- **CloudWatch Logs**: Lambda function logs with encryption context
- **X-Ray**: Distributed tracing of encryption operations

## Migration Strategy

### Existing Data

For existing unencrypted data:

1. Create migration Lambda function
2. Read records from DynamoDB
3. Encrypt sensitive fields
4. Update records with encrypted values
5. Verify encryption with sample reads

### Gradual Rollout

1. **Phase 1**: Encrypt new records only
2. **Phase 2**: Migrate existing records in batches
3. **Phase 3**: Verify all records encrypted
4. **Phase 4**: Remove plaintext field support

## Monitoring

### CloudWatch Metrics

Monitor encryption operations:

- **Custom Metric**: `SatyaMool/Encryption/FieldsEncrypted`
- **Custom Metric**: `SatyaMool/Encryption/FieldsDecrypted`
- **Custom Metric**: `SatyaMool/Encryption/Errors`

### Alarms

Set up alarms for:

- High encryption error rate (> 1%)
- Unusual encryption volume (> 10,000/hour)
- KMS throttling errors

## Error Handling

### Encryption Failures

```typescript
try {
  const encrypted = await encryptField(plaintext, context);
} catch (error) {
  console.error('Encryption failed:', error);
  // Log error, alert operations team
  // Return error to client
  throw new Error('Failed to encrypt sensitive data');
}
```

### Decryption Failures

```typescript
try {
  const decrypted = await decryptField(ciphertext, context);
} catch (error) {
  console.error('Decryption failed:', error);
  // Log error with context
  // Check if key rotation caused issue
  // Return masked value or error
  return '[ENCRYPTED]';
}
```

## Testing

### Unit Tests

```typescript
describe('Field Encryption', () => {
  it('should encrypt and decrypt user email', async () => {
    const email = 'user@example.com';
    const context = { tableName: 'Users', userId: 'user-123' };
    
    const encrypted = await encryptField(email, context);
    expect(encrypted).not.toBe(email);
    
    const decrypted = await decryptField(encrypted, context);
    expect(decrypted).toBe(email);
  });

  it('should fail decryption with wrong context', async () => {
    const email = 'user@example.com';
    const context1 = { tableName: 'Users', userId: 'user-123' };
    const context2 = { tableName: 'Users', userId: 'user-456' };
    
    const encrypted = await encryptField(email, context1);
    
    await expect(decryptField(encrypted, context2)).rejects.toThrow();
  });
});
```

## Best Practices

1. **Encryption Context**: Always include table name and record ID
2. **Error Handling**: Gracefully handle encryption/decryption failures
3. **Logging**: Log encryption operations without logging plaintext
4. **Testing**: Test encryption/decryption in all code paths
5. **Monitoring**: Monitor encryption metrics and errors
6. **Key Rotation**: Verify encryption works after key rotation
7. **Performance**: Profile encryption overhead in production

## References

- [AWS Encryption SDK](https://docs.aws.amazon.com/encryption-sdk/latest/developer-guide/introduction.html)
- [AWS Encryption SDK for JavaScript](https://github.com/aws/aws-encryption-sdk-javascript)
- [KMS Best Practices](https://docs.aws.amazon.com/kms/latest/developerguide/best-practices.html)
- [DynamoDB Encryption Client](https://docs.aws.amazon.com/database-encryption-sdk/latest/devguide/what-is-database-encryption-sdk.html)
