# Lambda Layers

This directory contains Lambda layers for shared dependencies across SatyaMool Lambda functions.

## Purpose

Lambda layers reduce cold start times by:
1. **Reducing package sizes**: Shared dependencies are extracted to layers
2. **Enabling code reuse**: Common libraries are shared across functions
3. **Faster deployments**: Only function code needs to be updated, not dependencies

## Layers

### 1. Node.js Common Layer (`nodejs-common`)
Contains common Node.js dependencies:
- `uuid`: UUID generation
- `date-fns`: Date manipulation utilities

**Path**: `/opt/nodejs/node_modules`

### 2. AWS SDK Layer (`aws-sdk`)
Contains AWS SDK v3 clients:
- DynamoDB client
- S3 client
- SQS client
- Cognito client
- SES client

**Path**: `/opt/nodejs/node_modules`

### 3. Python Common Layer (`python-common`)
Contains common Python dependencies:
- `boto3`: AWS SDK for Python
- `botocore`: Low-level AWS SDK
- `python-dateutil`: Date utilities

**Path**: `/opt/python`

## Building Layers

To build all layers:

```bash
cd packages/layers
chmod +x build-layers.sh
./build-layers.sh
```

## Layer Structure

Lambda layers must follow specific directory structures:

**Node.js layers**:
```
nodejs/
  node_modules/
    <package-name>/
```

**Python layers**:
```
python/
  <package-name>/
```

## Usage in Lambda Functions

Layers are automatically attached to Lambda functions in the CDK stack:

```typescript
const myFunction = new lambda.Function(this, 'MyFunction', {
  // ... other config
  layers: [
    layers.nodejsCommonLayer,
    layers.awsSdkLayer,
  ],
});
```

## Cold Start Optimization

By using layers:
- **Before**: Each Lambda package includes all dependencies (~50MB)
- **After**: Lambda package only includes function code (~1MB), layers provide dependencies

This reduces cold start time by:
- Faster package download
- Faster code extraction
- Smaller memory footprint

## Maintenance

When updating dependencies:
1. Update `package.json` or `requirements.txt` in the layer directory
2. Run `./build-layers.sh`
3. Deploy the CDK stack (new layer version will be created)
4. Lambda functions will automatically use the new layer version

## Best Practices

1. **Keep layers small**: Only include commonly used dependencies
2. **Version layers**: Use semantic versioning for layer names
3. **Test compatibility**: Ensure layer dependencies don't conflict with function code
4. **Monitor size**: Keep total layer size under 250MB (AWS limit)
