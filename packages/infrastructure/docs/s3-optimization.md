# S3 and CloudFront Optimization Guide

This document describes the S3 and CloudFront optimizations implemented for the SatyaMool platform to improve upload performance, reduce latency, and optimize costs.

## Overview

The following optimizations have been implemented:

1. **S3 Transfer Acceleration** - Faster uploads from distant locations
2. **Multipart Upload Management** - Automatic cleanup of incomplete uploads
3. **CloudFront CDN** - Global content delivery with caching for static assets

## S3 Transfer Acceleration

### What is it?

S3 Transfer Acceleration uses Amazon CloudFront's globally distributed edge locations to accelerate uploads to S3. Data is routed to S3 over an optimized network path, which can be significantly faster than standard internet routing, especially for users far from the S3 bucket region.

### When to use it?

- Uploading large files (>5MB)
- Users located far from the S3 bucket region
- Users with poor network connectivity

### Performance Benefits

- Up to 50-500% faster uploads depending on distance and network conditions
- Particularly beneficial for international users
- No changes required to application code (just use the accelerate endpoint)

### Implementation

The document bucket has Transfer Acceleration enabled:

```typescript
const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
  transferAcceleration: true,
  // ... other configuration
});
```

### Usage in Application Code

When generating presigned URLs for document uploads, use the Transfer Acceleration endpoint:

```typescript
// Standard endpoint
const standardEndpoint = `${bucketName}.s3.${region}.amazonaws.com`;

// Transfer Acceleration endpoint (use this for better performance)
const accelerateEndpoint = `${bucketName}.s3-accelerate.amazonaws.com`;
```

**Example: Generating Presigned URL with Transfer Acceleration**

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  useAccelerateEndpoint: true, // Enable Transfer Acceleration
});

async function generatePresignedUrl(
  bucketName: string,
  key: string,
  expiresIn: number = 900 // 15 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, {
    expiresIn,
  });

  return presignedUrl;
}
```

### Cost Considerations

- Transfer Acceleration incurs additional charges: $0.04 per GB for uploads
- Only charged when Transfer Acceleration provides a performance benefit
- If standard transfer is faster, no additional charge is applied
- Cost is justified by improved user experience for large file uploads

## Multipart Upload for Large Files

### What is it?

Multipart upload allows you to upload large files in parts, which provides:
- Better performance through parallel uploads
- Ability to resume failed uploads
- Improved reliability for large files

### When to use it?

- Files larger than 5MB (recommended by AWS)
- Required for files larger than 5GB
- Any file where upload reliability is critical

### Implementation

The infrastructure automatically cleans up incomplete multipart uploads after 7 days:

```typescript
lifecycleRules: [
  {
    id: 'DeleteIncompleteMultipartUploads',
    enabled: true,
    abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
  },
]
```

### Usage in Application Code

**Frontend (Browser) - Using AWS SDK v3:**

```typescript
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

async function uploadLargeFile(
  file: File,
  bucketName: string,
  key: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const s3Client = new S3Client({
    region: process.env.REACT_APP_AWS_REGION,
    credentials: {
      // Use temporary credentials from Cognito
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    useAccelerateEndpoint: true, // Use Transfer Acceleration
  });

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: bucketName,
      Key: key,
      Body: file,
      ContentType: file.type,
    },
    // Multipart upload configuration
    queueSize: 4, // Number of concurrent parts
    partSize: 5 * 1024 * 1024, // 5MB per part (minimum allowed)
    leavePartsOnError: false, // Clean up parts on error
  });

  // Track upload progress
  upload.on('httpUploadProgress', (progress) => {
    if (progress.loaded && progress.total) {
      const percentage = (progress.loaded / progress.total) * 100;
      onProgress?.(percentage);
    }
  });

  await upload.done();
}
```

**Backend (Lambda) - Using Presigned URLs:**

```typescript
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

async function generateMultipartUploadUrls(
  bucketName: string,
  key: string,
  fileSize: number,
  partSize: number = 5 * 1024 * 1024 // 5MB
): Promise<{
  uploadId: string;
  urls: string[];
}> {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    useAccelerateEndpoint: true,
  });

  // Initiate multipart upload
  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucketName,
    Key: key,
  });

  const { UploadId } = await s3Client.send(createCommand);

  // Calculate number of parts
  const numParts = Math.ceil(fileSize / partSize);

  // Generate presigned URLs for each part
  const urls: string[] = [];
  for (let partNumber = 1; partNumber <= numParts; partNumber++) {
    const uploadPartCommand = new UploadPartCommand({
      Bucket: bucketName,
      Key: key,
      UploadId,
      PartNumber: partNumber,
    });

    const url = await getSignedUrl(s3Client, uploadPartCommand, {
      expiresIn: 900, // 15 minutes
    });

    urls.push(url);
  }

  return {
    uploadId: UploadId!,
    urls,
  };
}
```

### Best Practices

1. **Part Size**: Use 5-10MB per part for optimal performance
2. **Concurrency**: Upload 3-5 parts concurrently to maximize throughput
3. **Error Handling**: Implement retry logic for failed parts
4. **Cleanup**: Always complete or abort multipart uploads to avoid storage charges
5. **Progress Tracking**: Show upload progress to users for better UX

## CloudFront CDN for Static Assets

### What is it?

CloudFront is a Content Delivery Network (CDN) that caches static assets at edge locations worldwide, reducing latency and improving load times for users globally.

### Benefits

- **Reduced Latency**: Content served from edge locations close to users
- **Lower Costs**: Reduced data transfer costs from S3
- **Better Performance**: Cached content loads faster
- **HTTPS by Default**: Secure content delivery
- **Compression**: Automatic gzip/brotli compression

### Implementation

CloudFront distribution is configured with:

```typescript
const frontendDistribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
  defaultBehavior: {
    cachePolicy: new cloudfront.CachePolicy(this, 'FrontendCachePolicy', {
      defaultTtl: cdk.Duration.hours(24), // 24 hours cache
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    }),
    compress: true,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
  // ... other configuration
});
```

### Cache Behavior

**Static Assets (HTML, CSS, JS, Images):**
- Default TTL: 24 hours
- Max TTL: 365 days
- Compression: Enabled (gzip/brotli)
- Cache Key: URL path only (no query strings or cookies)

**API Calls (/api/*):**
- Caching: Disabled
- All headers, query strings, and cookies forwarded
- HTTPS only

### Cache Invalidation

When deploying new frontend code, invalidate the CloudFront cache:

```bash
# Invalidate all files
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/*"

# Invalidate specific files
aws cloudfront create-invalidation \
  --distribution-id <DISTRIBUTION_ID> \
  --paths "/index.html" "/static/js/*"
```

**Note**: First 1,000 invalidation paths per month are free, then $0.005 per path.

### Deployment Workflow

1. Build frontend application
2. Upload to S3 frontend bucket
3. Invalidate CloudFront cache
4. Verify deployment

```bash
# Example deployment script
npm run build
aws s3 sync build/ s3://satyamool-frontend-${ACCOUNT_ID}/ --delete
aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*"
```

### Monitoring

CloudFront metrics available in CloudWatch:
- **Requests**: Total number of requests
- **BytesDownloaded**: Total bytes served
- **ErrorRate**: 4xx and 5xx error rates
- **CacheHitRate**: Percentage of requests served from cache

Access logs are stored in the audit log bucket under `cloudfront-logs/` prefix.

## Performance Recommendations

### For Document Uploads

1. **Use Transfer Acceleration** for all document uploads
2. **Implement multipart upload** for files >5MB
3. **Show progress indicators** to users during upload
4. **Implement retry logic** for failed uploads
5. **Validate file size** before upload (max 50MB per requirement)

### For Frontend Assets

1. **Use CloudFront URL** for all static assets
2. **Implement cache-busting** for versioned assets (e.g., `app.v1.2.3.js`)
3. **Optimize images** before upload (compress, resize)
4. **Use lazy loading** for images and components
5. **Implement code splitting** to reduce initial bundle size

## Cost Optimization

### S3 Transfer Acceleration

- Only use for files >5MB or users far from bucket region
- Consider implementing client-side logic to choose between standard and accelerate endpoints based on file size

### CloudFront

- Use appropriate cache TTLs to maximize cache hit rate
- Monitor cache hit rate and adjust TTLs if needed
- Use CloudFront compression to reduce data transfer costs
- Consider using CloudFront Functions for simple request/response transformations

### Multipart Upload Cleanup

- Lifecycle policy automatically deletes incomplete uploads after 7 days
- Implement proper error handling to complete or abort uploads
- Monitor S3 storage metrics to ensure cleanup is working

## Troubleshooting

### Transfer Acceleration Not Working

1. Verify Transfer Acceleration is enabled on the bucket
2. Check that you're using the correct endpoint: `bucket-name.s3-accelerate.amazonaws.com`
3. Ensure IAM permissions allow `s3:PutObject` on the bucket
4. Test with AWS CLI: `aws s3 cp file.pdf s3://bucket-name/file.pdf --endpoint-url https://s3-accelerate.amazonaws.com`

### Multipart Upload Failures

1. Check part size is at least 5MB (except last part)
2. Verify all parts are uploaded before completing
3. Ensure ETags are collected and sent with CompleteMultipartUpload
4. Check IAM permissions for multipart upload operations

### CloudFront Cache Issues

1. Verify cache policy configuration
2. Check if cache-control headers are set correctly
3. Use CloudFront invalidation to clear stale content
4. Monitor cache hit rate in CloudWatch

## References

- [S3 Transfer Acceleration](https://docs.aws.amazon.com/AmazonS3/latest/userguide/transfer-acceleration.html)
- [S3 Multipart Upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [CloudFront Developer Guide](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
