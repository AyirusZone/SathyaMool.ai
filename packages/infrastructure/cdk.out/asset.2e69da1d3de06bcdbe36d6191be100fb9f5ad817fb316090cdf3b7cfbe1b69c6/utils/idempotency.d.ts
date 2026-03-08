/**
 * Idempotency Utility for SatyaMool Lambda Functions
 *
 * Provides idempotency key management and conditional write operations
 * to prevent duplicate processing and race conditions.
 *
 * Requirements: 3.1, 3.3 - Handle duplicate messages and prevent race conditions
 */
import { PutCommandInput, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
export interface IdempotencyRecord {
    idempotencyKey: string;
    status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    result?: any;
    error?: string;
    createdAt: string;
    updatedAt: string;
    ttl: number;
}
export interface IdempotencyOptions {
    /**
     * Custom idempotency key. If not provided, will be generated from the data.
     */
    idempotencyKey?: string;
    /**
     * TTL in hours for the idempotency record (default: 24 hours)
     */
    ttlHours?: number;
    /**
     * Whether to throw an error if operation is already in progress
     */
    throwOnInProgress?: boolean;
}
/**
 * Generate idempotency key from data
 * Uses SHA-256 hash of the stringified data
 */
export declare function generateIdempotencyKey(data: any): string;
/**
 * Check if an operation with the given idempotency key has already been processed
 *
 * @param idempotencyKey - Unique key for the operation
 * @returns IdempotencyRecord if exists, null otherwise
 */
export declare function checkIdempotency(idempotencyKey: string): Promise<IdempotencyRecord | null>;
/**
 * Mark operation as in progress
 * Uses conditional write to prevent race conditions
 *
 * @param idempotencyKey - Unique key for the operation
 * @param ttlHours - TTL in hours (default: 24)
 * @returns true if successfully marked, false if already exists
 */
export declare function markInProgress(idempotencyKey: string, ttlHours?: number): Promise<boolean>;
/**
 * Mark operation as completed and store result
 *
 * @param idempotencyKey - Unique key for the operation
 * @param result - Result to store
 */
export declare function markCompleted(idempotencyKey: string, result?: any): Promise<void>;
/**
 * Mark operation as failed and store error
 *
 * @param idempotencyKey - Unique key for the operation
 * @param error - Error message
 */
export declare function markFailed(idempotencyKey: string, error: string): Promise<void>;
/**
 * Execute an idempotent operation
 * Handles checking, marking in progress, executing, and marking completed/failed
 *
 * @param operation - Async function to execute
 * @param data - Data to generate idempotency key from
 * @param options - Idempotency options
 * @returns Result of the operation
 */
export declare function executeIdempotent<T>(operation: () => Promise<T>, data: any, options?: IdempotencyOptions): Promise<T>;
/**
 * Conditional put operation for DynamoDB
 * Prevents duplicate records with the same key
 *
 * @param params - PutCommand parameters
 * @returns true if successful, false if item already exists
 */
export declare function conditionalPut(params: PutCommandInput): Promise<boolean>;
/**
 * Conditional update operation for DynamoDB
 * Only updates if the item exists and meets the condition
 *
 * @param params - UpdateCommand parameters
 * @returns true if successful, false if condition not met
 */
export declare function conditionalUpdate(params: UpdateCommandInput): Promise<boolean>;
/**
 * Generate SQS message deduplication ID
 * Used for FIFO queues to prevent duplicate message processing
 *
 * @param messageBody - SQS message body
 * @returns Deduplication ID
 */
export declare function generateSQSDeduplicationId(messageBody: any): string;
/**
 * Extract idempotency key from SQS message
 * Checks message attributes and generates from body if not present
 *
 * @param sqsRecord - SQS record from Lambda event
 * @returns Idempotency key
 */
export declare function extractSQSIdempotencyKey(sqsRecord: any): string;
