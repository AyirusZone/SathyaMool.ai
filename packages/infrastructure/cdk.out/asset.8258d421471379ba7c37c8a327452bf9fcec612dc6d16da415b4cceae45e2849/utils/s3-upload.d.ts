/**
 * S3 Upload Utilities
 *
 * Provides helper functions for optimized S3 uploads with:
 * - Transfer Acceleration for faster uploads
 * - Multipart upload support for large files
 * - Presigned URL generation
 *
 * Task 31.3: Optimize S3 operations
 * Requirements: 16.8
 */
/**
 * Configuration for presigned URL generation
 */
export interface PresignedUrlConfig {
    bucketName: string;
    key: string;
    expiresIn?: number;
    contentType?: string;
    metadata?: Record<string, string>;
}
/**
 * Configuration for multipart upload
 */
export interface MultipartUploadConfig {
    bucketName: string;
    key: string;
    fileSize: number;
    partSize?: number;
    expiresIn?: number;
    contentType?: string;
    metadata?: Record<string, string>;
}
/**
 * Result of multipart upload initialization
 */
export interface MultipartUploadResult {
    uploadId: string;
    urls: string[];
    partSize: number;
    numParts: number;
}
/**
 * Generate a presigned URL for direct S3 upload
 * Uses Transfer Acceleration endpoint for better performance
 *
 * @param config - Configuration for presigned URL generation
 * @returns Presigned URL for upload
 */
export declare function generatePresignedUploadUrl(config: PresignedUrlConfig): Promise<string>;
/**
 * Initialize multipart upload and generate presigned URLs for each part
 * Uses Transfer Acceleration endpoint for better performance
 *
 * @param config - Configuration for multipart upload
 * @returns Upload ID and presigned URLs for each part
 */
export declare function initializeMultipartUpload(config: MultipartUploadConfig): Promise<MultipartUploadResult>;
/**
 * Complete multipart upload
 *
 * @param bucketName - S3 bucket name
 * @param key - Object key
 * @param uploadId - Upload ID from initializeMultipartUpload
 * @param parts - Array of completed parts with ETags
 */
export declare function completeMultipartUpload(bucketName: string, key: string, uploadId: string, parts: Array<{
    PartNumber: number;
    ETag: string;
}>): Promise<void>;
/**
 * Abort multipart upload
 * Should be called if upload fails or is cancelled
 *
 * @param bucketName - S3 bucket name
 * @param key - Object key
 * @param uploadId - Upload ID from initializeMultipartUpload
 */
export declare function abortMultipartUpload(bucketName: string, key: string, uploadId: string): Promise<void>;
/**
 * Determine if file should use multipart upload
 * Files larger than 5MB should use multipart upload for better performance
 *
 * @param fileSize - File size in bytes
 * @returns True if multipart upload should be used
 */
export declare function shouldUseMultipartUpload(fileSize: number): boolean;
/**
 * Get S3 Transfer Acceleration endpoint for a bucket
 *
 * @param bucketName - S3 bucket name
 * @returns Transfer Acceleration endpoint URL
 */
export declare function getTransferAccelerationEndpoint(bucketName: string): string;
/**
 * Calculate optimal part size for multipart upload
 * AWS recommends 5-10MB per part for optimal performance
 *
 * @param fileSize - File size in bytes
 * @returns Optimal part size in bytes
 */
export declare function calculateOptimalPartSize(fileSize: number): number;
