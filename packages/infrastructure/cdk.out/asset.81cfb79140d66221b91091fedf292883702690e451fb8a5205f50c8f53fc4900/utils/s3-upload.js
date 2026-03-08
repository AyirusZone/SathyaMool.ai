"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePresignedUploadUrl = generatePresignedUploadUrl;
exports.initializeMultipartUpload = initializeMultipartUpload;
exports.completeMultipartUpload = completeMultipartUpload;
exports.abortMultipartUpload = abortMultipartUpload;
exports.shouldUseMultipartUpload = shouldUseMultipartUpload;
exports.getTransferAccelerationEndpoint = getTransferAccelerationEndpoint;
exports.calculateOptimalPartSize = calculateOptimalPartSize;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
// Constants
const MULTIPART_THRESHOLD = 5 * 1024 * 1024; // 5MB - minimum part size for multipart upload
const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10MB - optimal part size
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB - maximum file size per requirements
const PRESIGNED_URL_EXPIRATION = 900; // 15 minutes
// Initialize S3 client with Transfer Acceleration
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    useAccelerateEndpoint: true, // Enable S3 Transfer Acceleration
});
/**
 * Generate a presigned URL for direct S3 upload
 * Uses Transfer Acceleration endpoint for better performance
 *
 * @param config - Configuration for presigned URL generation
 * @returns Presigned URL for upload
 */
async function generatePresignedUploadUrl(config) {
    const { bucketName, key, expiresIn = PRESIGNED_URL_EXPIRATION, contentType, metadata, } = config;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
    });
    const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, command, {
        expiresIn,
    });
    return presignedUrl;
}
/**
 * Initialize multipart upload and generate presigned URLs for each part
 * Uses Transfer Acceleration endpoint for better performance
 *
 * @param config - Configuration for multipart upload
 * @returns Upload ID and presigned URLs for each part
 */
async function initializeMultipartUpload(config) {
    const { bucketName, key, fileSize, partSize = DEFAULT_PART_SIZE, expiresIn = PRESIGNED_URL_EXPIRATION, contentType, metadata, } = config;
    // Validate file size
    if (fileSize > MAX_FILE_SIZE) {
        throw new Error(`File size ${fileSize} bytes exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes (50MB)`);
    }
    // Validate part size
    if (partSize < MULTIPART_THRESHOLD) {
        throw new Error(`Part size ${partSize} bytes is below minimum of ${MULTIPART_THRESHOLD} bytes (5MB)`);
    }
    // Initiate multipart upload
    const createCommand = new client_s3_1.CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: contentType,
        Metadata: metadata,
    });
    const { UploadId } = await s3Client.send(createCommand);
    if (!UploadId) {
        throw new Error('Failed to initiate multipart upload');
    }
    // Calculate number of parts
    const numParts = Math.ceil(fileSize / partSize);
    // Generate presigned URLs for each part
    const urls = [];
    for (let partNumber = 1; partNumber <= numParts; partNumber++) {
        const uploadPartCommand = new client_s3_1.UploadPartCommand({
            Bucket: bucketName,
            Key: key,
            UploadId,
            PartNumber: partNumber,
        });
        const url = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, uploadPartCommand, {
            expiresIn,
        });
        urls.push(url);
    }
    return {
        uploadId: UploadId,
        urls,
        partSize,
        numParts,
    };
}
/**
 * Complete multipart upload
 *
 * @param bucketName - S3 bucket name
 * @param key - Object key
 * @param uploadId - Upload ID from initializeMultipartUpload
 * @param parts - Array of completed parts with ETags
 */
async function completeMultipartUpload(bucketName, key, uploadId, parts) {
    const command = new client_s3_1.CompleteMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: parts,
        },
    });
    await s3Client.send(command);
}
/**
 * Abort multipart upload
 * Should be called if upload fails or is cancelled
 *
 * @param bucketName - S3 bucket name
 * @param key - Object key
 * @param uploadId - Upload ID from initializeMultipartUpload
 */
async function abortMultipartUpload(bucketName, key, uploadId) {
    const command = new client_s3_1.AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: key,
        UploadId: uploadId,
    });
    await s3Client.send(command);
}
/**
 * Determine if file should use multipart upload
 * Files larger than 5MB should use multipart upload for better performance
 *
 * @param fileSize - File size in bytes
 * @returns True if multipart upload should be used
 */
function shouldUseMultipartUpload(fileSize) {
    return fileSize >= MULTIPART_THRESHOLD;
}
/**
 * Get S3 Transfer Acceleration endpoint for a bucket
 *
 * @param bucketName - S3 bucket name
 * @returns Transfer Acceleration endpoint URL
 */
function getTransferAccelerationEndpoint(bucketName) {
    return `https://${bucketName}.s3-accelerate.amazonaws.com`;
}
/**
 * Calculate optimal part size for multipart upload
 * AWS recommends 5-10MB per part for optimal performance
 *
 * @param fileSize - File size in bytes
 * @returns Optimal part size in bytes
 */
function calculateOptimalPartSize(fileSize) {
    // For files < 100MB, use 10MB parts
    if (fileSize < 100 * 1024 * 1024) {
        return DEFAULT_PART_SIZE;
    }
    // For larger files, calculate part size to keep number of parts reasonable
    // AWS allows max 10,000 parts per upload
    const maxParts = 10000;
    const calculatedPartSize = Math.ceil(fileSize / maxParts);
    // Ensure part size is at least 5MB
    return Math.max(calculatedPartSize, MULTIPART_THRESHOLD);
}
//# sourceMappingURL=s3-upload.js.map