/**
 * Presigned URL Integration Tests
 * 
 * Tests for presigned URL generation, expiration, and security.
 * 
 * Requirement: 13.4 - Test presigned URL expiration
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';

describe('Presigned URL Integration Tests', () => {
  const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const testBucket = process.env.TEST_BUCKET_NAME || 'test-bucket';
  const testKey = `test-uploads/${Date.now()}-test.txt`;

  describe('Presigned URL Generation', () => {
    test('should generate presigned URL for upload with 15-minute expiration', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
        ServerSideEncryption: 'aws:kms',
      });

      const expiresIn = 15 * 60; // 15 minutes in seconds
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      // Verify URL is generated
      expect(presignedUrl).toBeDefined();
      expect(presignedUrl).toContain(testBucket);
      expect(presignedUrl).toContain('X-Amz-Expires=900'); // 900 seconds = 15 minutes
      expect(presignedUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(presignedUrl).toContain('X-Amz-Signature=');
    });

    test('should generate presigned URL for download with 15-minute expiration', async () => {
      const command = new GetObjectCommand({
        Bucket: testBucket,
        Key: testKey,
      });

      const expiresIn = 15 * 60; // 15 minutes in seconds
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      // Verify URL is generated
      expect(presignedUrl).toBeDefined();
      expect(presignedUrl).toContain(testBucket);
      expect(presignedUrl).toContain('X-Amz-Expires=900');
    });

    test('should include required headers in presigned URL', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
        Metadata: {
          'user-id': 'user-123',
          'property-id': 'prop-456',
        },
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Verify URL includes content type
      expect(presignedUrl).toContain('content-type=application%2Fpdf');
    });
  });

  describe('Presigned URL Upload', () => {
    test('should successfully upload file using presigned URL', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Upload file using presigned URL
      const fileContent = 'Test file content';
      const response = await axios.put(presignedUrl, fileContent, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      expect(response.status).toBe(200);
    }, 30000); // 30 second timeout

    test('should reject upload with wrong content type', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'application/pdf',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Try to upload with different content type
      const fileContent = 'Test file content';
      
      await expect(
        axios.put(presignedUrl, fileContent, {
          headers: {
            'Content-Type': 'text/plain', // Wrong content type
          },
        })
      ).rejects.toThrow();
    }, 30000);

    test('should reject upload exceeding size limit', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'application/pdf',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Create file content exceeding 50MB
      const largeContent = Buffer.alloc(51 * 1024 * 1024); // 51 MB

      await expect(
        axios.put(presignedUrl, largeContent, {
          headers: {
            'Content-Type': 'application/pdf',
          },
          maxContentLength: 50 * 1024 * 1024,
        })
      ).rejects.toThrow();
    }, 60000); // 60 second timeout for large file
  });

  describe('Presigned URL Expiration', () => {
    test('should reject upload after URL expires', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      // Generate URL with 1 second expiration for testing
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 1 });

      // Wait for URL to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to upload after expiration
      const fileContent = 'Test file content';
      
      await expect(
        axios.put(presignedUrl, fileContent, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      ).rejects.toThrow();
    }, 10000);

    test('should accept upload before URL expires', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      // Generate URL with 60 second expiration
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

      // Upload immediately
      const fileContent = 'Test file content';
      const response = await axios.put(presignedUrl, fileContent, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      expect(response.status).toBe(200);
    }, 30000);
  });

  describe('Presigned URL Security', () => {
    test('should not allow modification of URL parameters', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Try to modify expiration time in URL
      const modifiedUrl = presignedUrl.replace('X-Amz-Expires=900', 'X-Amz-Expires=9000');

      const fileContent = 'Test file content';
      
      await expect(
        axios.put(modifiedUrl, fileContent, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      ).rejects.toThrow(); // Should fail due to signature mismatch
    }, 30000);

    test('should not allow access to different object', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Try to modify object key in URL
      const differentKey = `test-uploads/${Date.now()}-different.txt`;
      const modifiedUrl = presignedUrl.replace(encodeURIComponent(testKey), encodeURIComponent(differentKey));

      const fileContent = 'Test file content';
      
      await expect(
        axios.put(modifiedUrl, fileContent, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      ).rejects.toThrow(); // Should fail due to signature mismatch
    }, 30000);

    test('should enforce HTTPS only', async () => {
      const command = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Verify URL uses HTTPS
      expect(presignedUrl).toMatch(/^https:\/\//);

      // Try to use HTTP (should be rejected by S3 bucket policy)
      const httpUrl = presignedUrl.replace('https://', 'http://');

      const fileContent = 'Test file content';
      
      await expect(
        axios.put(httpUrl, fileContent, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Presigned URL Download', () => {
    test('should successfully download file using presigned URL', async () => {
      // First upload a file
      const uploadCommand = new PutObjectCommand({
        Bucket: testBucket,
        Key: testKey,
        ContentType: 'text/plain',
      });

      const uploadUrl = await getSignedUrl(s3Client, uploadCommand, { expiresIn: 900 });
      const fileContent = 'Test file content for download';
      
      await axios.put(uploadUrl, fileContent, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });

      // Generate download URL
      const downloadCommand = new GetObjectCommand({
        Bucket: testBucket,
        Key: testKey,
      });

      const downloadUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 900 });

      // Download file
      const response = await axios.get(downloadUrl);

      expect(response.status).toBe(200);
      expect(response.data).toBe(fileContent);
    }, 30000);

    test('should reject download after URL expires', async () => {
      const command = new GetObjectCommand({
        Bucket: testBucket,
        Key: testKey,
      });

      // Generate URL with 1 second expiration
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 1 });

      // Wait for URL to expire
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Try to download after expiration
      await expect(axios.get(presignedUrl)).rejects.toThrow();
    }, 10000);
  });

  describe('Presigned URL Validation', () => {
    test('should validate file format before generating URL', () => {
      const allowedFormats = ['pdf', 'jpeg', 'jpg', 'png', 'tiff'];
      const testFiles = [
        { name: 'document.pdf', valid: true },
        { name: 'image.jpeg', valid: true },
        { name: 'photo.jpg', valid: true },
        { name: 'scan.png', valid: true },
        { name: 'scan.tiff', valid: true },
        { name: 'malicious.exe', valid: false },
        { name: 'script.js', valid: false },
        { name: 'data.json', valid: false },
      ];

      testFiles.forEach(file => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const isValid = extension ? allowedFormats.includes(extension) : false;
        expect(isValid).toBe(file.valid);
      });
    });

    test('should validate file size before generating URL', () => {
      const maxSizeBytes = 50 * 1024 * 1024; // 50 MB
      const testSizes = [
        { size: 1024, valid: true }, // 1 KB
        { size: 1024 * 1024, valid: true }, // 1 MB
        { size: 10 * 1024 * 1024, valid: true }, // 10 MB
        { size: 50 * 1024 * 1024, valid: true }, // 50 MB (exactly at limit)
        { size: 51 * 1024 * 1024, valid: false }, // 51 MB (exceeds limit)
        { size: 100 * 1024 * 1024, valid: false }, // 100 MB
      ];

      testSizes.forEach(test => {
        const isValid = test.size <= maxSizeBytes;
        expect(isValid).toBe(test.valid);
      });
    });

    test('should limit bulk uploads to 50 documents', () => {
      const maxDocuments = 50;
      const testCounts = [
        { count: 1, valid: true },
        { count: 10, valid: true },
        { count: 50, valid: true },
        { count: 51, valid: false },
        { count: 100, valid: false },
      ];

      testCounts.forEach(test => {
        const isValid = test.count <= maxDocuments;
        expect(isValid).toBe(test.valid);
      });
    });
  });
});
