/**
 * Unit tests for S3 Upload Utilities
 * 
 * Task 31.3: Optimize S3 operations
 * Requirements: 16.8
 */

import {
  generatePresignedUploadUrl,
  initializeMultipartUpload,
  shouldUseMultipartUpload,
  getTransferAccelerationEndpoint,
  calculateOptimalPartSize,
} from '../s3-upload';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

describe('S3 Upload Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePresignedUploadUrl', () => {
    it('should generate presigned URL for simple upload', async () => {
      const mockUrl = 'https://bucket.s3-accelerate.amazonaws.com/key?signature=xyz';
      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const url = await generatePresignedUploadUrl({
        bucketName: 'test-bucket',
        key: 'test-key',
        contentType: 'application/pdf',
      });

      expect(url).toBe(mockUrl);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(Object),
        expect.objectContaining({ expiresIn: 900 })
      );
    });

    it('should use custom expiration time', async () => {
      const mockUrl = 'https://bucket.s3-accelerate.amazonaws.com/key?signature=xyz';
      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      await generatePresignedUploadUrl({
        bucketName: 'test-bucket',
        key: 'test-key',
        expiresIn: 1800, // 30 minutes
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.any(S3Client),
        expect.any(Object),
        expect.objectContaining({ expiresIn: 1800 })
      );
    });

    it('should include metadata in presigned URL', async () => {
      const mockUrl = 'https://bucket.s3-accelerate.amazonaws.com/key?signature=xyz';
      (getSignedUrl as jest.Mock).mockResolvedValue(mockUrl);

      const metadata = {
        userId: 'user-123',
        propertyId: 'property-456',
      };

      await generatePresignedUploadUrl({
        bucketName: 'test-bucket',
        key: 'test-key',
        metadata,
      });

      expect(getSignedUrl).toHaveBeenCalled();
    });
  });

  describe('initializeMultipartUpload', () => {
    it('should initialize multipart upload and generate part URLs', async () => {
      const mockUploadId = 'upload-123';
      const mockPartUrl = 'https://bucket.s3-accelerate.amazonaws.com/key?partNumber=1&uploadId=upload-123';

      (S3Client.prototype.send as jest.Mock).mockResolvedValue({
        UploadId: mockUploadId,
      });
      (getSignedUrl as jest.Mock).mockResolvedValue(mockPartUrl);

      const fileSize = 25 * 1024 * 1024; // 25MB
      const result = await initializeMultipartUpload({
        bucketName: 'test-bucket',
        key: 'test-key',
        fileSize,
      });

      expect(result.uploadId).toBe(mockUploadId);
      expect(result.numParts).toBe(3); // 25MB / 10MB = 3 parts
      expect(result.urls).toHaveLength(3);
      expect(result.partSize).toBe(10 * 1024 * 1024); // 10MB default
    });

    it('should reject files larger than 50MB', async () => {
      const fileSize = 51 * 1024 * 1024; // 51MB

      await expect(
        initializeMultipartUpload({
          bucketName: 'test-bucket',
          key: 'test-key',
          fileSize,
        })
      ).rejects.toThrow('exceeds maximum allowed size');
    });

    it('should reject part size smaller than 5MB', async () => {
      const fileSize = 25 * 1024 * 1024; // 25MB
      const partSize = 4 * 1024 * 1024; // 4MB (too small)

      await expect(
        initializeMultipartUpload({
          bucketName: 'test-bucket',
          key: 'test-key',
          fileSize,
          partSize,
        })
      ).rejects.toThrow('below minimum');
    });

    it('should use custom part size', async () => {
      const mockUploadId = 'upload-123';
      const mockPartUrl = 'https://bucket.s3-accelerate.amazonaws.com/key?partNumber=1';

      (S3Client.prototype.send as jest.Mock).mockResolvedValue({
        UploadId: mockUploadId,
      });
      (getSignedUrl as jest.Mock).mockResolvedValue(mockPartUrl);

      const fileSize = 25 * 1024 * 1024; // 25MB
      const partSize = 5 * 1024 * 1024; // 5MB

      const result = await initializeMultipartUpload({
        bucketName: 'test-bucket',
        key: 'test-key',
        fileSize,
        partSize,
      });

      expect(result.numParts).toBe(5); // 25MB / 5MB = 5 parts
      expect(result.partSize).toBe(partSize);
    });

    it('should throw error if upload ID is not returned', async () => {
      (S3Client.prototype.send as jest.Mock).mockResolvedValue({
        UploadId: undefined,
      });

      await expect(
        initializeMultipartUpload({
          bucketName: 'test-bucket',
          key: 'test-key',
          fileSize: 10 * 1024 * 1024,
        })
      ).rejects.toThrow('Failed to initiate multipart upload');
    });
  });

  describe('shouldUseMultipartUpload', () => {
    it('should return true for files >= 5MB', () => {
      expect(shouldUseMultipartUpload(5 * 1024 * 1024)).toBe(true);
      expect(shouldUseMultipartUpload(10 * 1024 * 1024)).toBe(true);
      expect(shouldUseMultipartUpload(50 * 1024 * 1024)).toBe(true);
    });

    it('should return false for files < 5MB', () => {
      expect(shouldUseMultipartUpload(1 * 1024 * 1024)).toBe(false);
      expect(shouldUseMultipartUpload(4.9 * 1024 * 1024)).toBe(false);
      expect(shouldUseMultipartUpload(100 * 1024)).toBe(false);
    });
  });

  describe('getTransferAccelerationEndpoint', () => {
    it('should return correct Transfer Acceleration endpoint', () => {
      const endpoint = getTransferAccelerationEndpoint('my-bucket');
      expect(endpoint).toBe('https://my-bucket.s3-accelerate.amazonaws.com');
    });

    it('should handle bucket names with special characters', () => {
      const endpoint = getTransferAccelerationEndpoint('my-bucket-123');
      expect(endpoint).toBe('https://my-bucket-123.s3-accelerate.amazonaws.com');
    });
  });

  describe('calculateOptimalPartSize', () => {
    it('should return 10MB for files < 100MB', () => {
      const partSize = calculateOptimalPartSize(50 * 1024 * 1024); // 50MB
      expect(partSize).toBe(10 * 1024 * 1024); // 10MB
    });

    it('should calculate part size for files >= 100MB', () => {
      const fileSize = 100 * 1024 * 1024; // 100MB
      const partSize = calculateOptimalPartSize(fileSize);

      // Should be at least 5MB
      expect(partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);

      // Should result in <= 10,000 parts
      const numParts = Math.ceil(fileSize / partSize);
      expect(numParts).toBeLessThanOrEqual(10000);
    });

    it('should calculate larger part size for files > 100MB', () => {
      const fileSize = 500 * 1024 * 1024; // 500MB
      const partSize = calculateOptimalPartSize(fileSize);

      // Should be at least 5MB
      expect(partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);

      // Should result in <= 10,000 parts
      const numParts = Math.ceil(fileSize / partSize);
      expect(numParts).toBeLessThanOrEqual(10000);
    });

    it('should ensure minimum part size of 5MB', () => {
      const fileSize = 10 * 1024 * 1024; // 10MB
      const partSize = calculateOptimalPartSize(fileSize);

      expect(partSize).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    });
  });
});
