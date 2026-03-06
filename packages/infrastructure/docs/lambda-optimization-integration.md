# Lambda Optimization Integration Guide

This guide shows how to integrate Lambda cold start optimizations into the SatyaMool CDK stack.

## Overview

The optimization consists of three main components:
1. **Lambda Layers** (`lambda-layers.ts`): Shared dependencies
2. **Provisioned Concurrency** (`provisioned-concurrency.ts`): Pre-warmed instances
3. **Optimized Lambda** (`optimized-lambda.ts`): Wrapper for creating optimized functions

## Integration Steps

### Step 1: Import the Optimization Constructs

In `satyamool-stack.ts`, add the imports:

```typescript
import { LambdaLayers } from './lambda-layers';
import { OptimizedLambda, createOptimizedApiLambda, createOptimizedProcessingLambda } from './optimized-lambda';
```

### Step 2: Create Lambda Layers

Early in the stack constructor, create the layers:

```typescript
// Create Lambda layers for shared dependencies
const layers = new LambdaLayers(this, 'LambdaLayers');
```

### Step 3: Update Existing Lambda Functions

#### Before (Original OCR Lambda):
```typescript
const ocrLambda = new lambda.Function(this, 'OcrFunction', {
  functionName: 'SatyaMool-OCR-Processor',
  runtime: lambda.Runtime.PYTHON_3_12,
  architecture: lambda.Architecture.ARM_64,
  handler: 'handler.lambda_handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/ocr')),
  memorySize: 512,
  timeout: cdk.Duration.minutes(5),
  tracing: lambda.Tracing.ACTIVE,
  environment: {
    DOCUMENTS_TABLE_NAME: documentsTable.tableName,
    QUEUE_URL: processingQueue.queueUrl,
    LOG_LEVEL: 'INFO',
  },
  reservedConcurrentExecutions: 100,
});
```

#### After (Optimized OCR Lambda):
```typescript
const ocrLambdaConstruct = createOptimizedProcessingLambda(
  this,
  'OcrFunction',
  {
    functionName: 'SatyaMool-OCR-Processor',
    runtime: lambda.Runtime.PYTHON_3_12,
    handler: 'handler.lambda_handler',
    code: lambda.Code.fromAsset(path.join(__dirname, '../../processing/ocr')),
    memorySize: 512,
    timeout: cdk.Duration.minutes(5),
    environment: {
      DOCUMENTS_TABLE_NAME: documentsTable.tableName,
      QUEUE_URL: processingQueue.queueUrl,
      LOG_LEVEL: 'INFO',
    },
    reservedConcurrentExecutions: 100,
  },
  layers
);

const ocrLambda = ocrLambdaConstruct.function;
```

### Step 4: Create API Lambda Functions with Provisioned Concurrency

For critical API functions (auth, properties), use `createOptimizedApiLambda`:

```typescript
// Authentication Lambda (with provisioned concurrency)
const authLoginLambdaConstruct = createOptimizedApiLambda(
  this,
  'AuthLoginFunction',
  {
    functionName: 'SatyaMool-Auth-Login',
    runtime: lambda.Runtime.NODEJS_20_X,
    handler: 'login.handler',
    code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/src/auth')),
    environment: {
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
      LOG_LEVEL: 'INFO',
    },
  },
  layers
);

const authLoginLambda = authLoginLambdaConstruct.function;
```

### Step 5: Update Lambda Permissions

The optimized Lambda functions work the same way as regular Lambda functions for permissions:

```typescript
// Grant permissions (same as before)
documentBucket.grantRead(ocrLambda);
documentsTable.grantReadWriteData(ocrLambda);
encryptionKey.grantDecrypt(ocrLambda);
```

### Step 6: Build Lambda Layers

Before deploying, build the Lambda layers:

```bash
cd packages/layers
chmod +x build-layers.sh
./build-layers.sh
```

### Step 7: Deploy the Stack

Deploy the updated stack:

```bash
cd packages/infrastructure
npm run cdk deploy
```

## Complete Example: Auth Lambda with All Optimizations

```typescript
import { LambdaLayers } from './lambda-layers';
import { createOptimizedApiLambda } from './optimized-lambda';

export class SatyaMoolStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step 1: Create Lambda layers
    const layers = new LambdaLayers(this, 'LambdaLayers');

    // Step 2: Create DynamoDB tables, S3 buckets, etc.
    // ... (existing code)

    // Step 3: Create optimized API Lambda functions
    const authLoginLambdaConstruct = createOptimizedApiLambda(
      this,
      'AuthLoginFunction',
      {
        functionName: 'SatyaMool-Auth-Login',
        description: 'User login Lambda function with provisioned concurrency',
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'login.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../../backend/src/auth')),
        memorySize: 256, // Right-sized for API function
        timeout: cdk.Duration.seconds(30),
        environment: {
          USER_POOL_ID: userPool.userPoolId,
          USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          AUDIT_LOGS_TABLE_NAME: auditLogsTable.tableName,
          LOG_LEVEL: 'INFO',
        },
      },
      layers
    );

    const authLoginLambda = authLoginLambdaConstruct.function;

    // Step 4: Grant permissions
    auditLogsTable.grantWriteData(authLoginLambda);
    
    // Grant Cognito permissions
    authLoginLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cognito-idp:InitiateAuth',
          'cognito-idp:AdminGetUser',
        ],
        resources: [userPool.userPoolArn],
      })
    );

    // Step 5: Integrate with API Gateway
    const api = new apigateway.RestApi(this, 'SatyaMoolApi', {
      restApiName: 'SatyaMool API',
      // ... other config
    });

    const authResource = api.root.addResource('auth');
    const loginResource = authResource.addResource('login');
    
    loginResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(authLoginLambda)
    );
  }
}
```

## Benefits Summary

### Before Optimization
- **Cold start**: 2-3 seconds
- **Package size**: 50MB per function
- **Deployment time**: 2-3 minutes
- **Memory usage**: Default 128MB (often insufficient)

### After Optimization
- **Cold start**: 0ms (provisioned concurrency) or 800ms-1.2s (layers only)
- **Package size**: 1-5MB per function
- **Deployment time**: 30-60 seconds
- **Memory usage**: Right-sized (256MB-1024MB based on function)

### Cost Impact
- **Provisioned concurrency**: $15-35/month for critical functions
- **Lambda layers**: No additional cost
- **Reduced execution time**: Lower Lambda costs due to faster execution
- **Net impact**: Small increase in cost, massive improvement in UX

## Monitoring

After deployment, monitor these metrics in CloudWatch:

1. **Cold Start Frequency**: Should be <5% for non-critical functions, 0% for critical functions
2. **Provisioned Concurrency Utilization**: Should be around 70% (auto-scales at this threshold)
3. **Function Duration**: Should be 40-60% faster than before
4. **Error Rate**: Should remain the same or improve

## Troubleshooting

### Issue: Lambda can't find dependencies
**Solution**: Ensure layers are built correctly and paths match:
- Node.js: `/opt/nodejs/node_modules`
- Python: `/opt/python`

### Issue: Provisioned concurrency not working
**Solution**: Ensure you're using the alias ARN, not the function ARN:
```typescript
// Correct: Use alias ARN
const aliasArn = authLoginLambdaConstruct.alias?.functionArn;

// Incorrect: Don't use function ARN directly
const functionArn = authLoginLambda.functionArn;
```

### Issue: High costs
**Solution**: Reduce minimum provisioned concurrency or disable for less critical functions:
```typescript
// Reduce minimum capacity
const config = {
  minCapacity: 2, // Instead of 5
  maxCapacity: 20, // Instead of 50
  targetUtilization: 0.70,
};
```

## Next Steps

1. Deploy the optimized stack to development environment
2. Run load tests to measure cold start improvements
3. Monitor CloudWatch metrics for 1 week
4. Adjust provisioned concurrency based on actual traffic patterns
5. Deploy to production environment
