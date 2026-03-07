/**
 * DynamoDB Batch Operations Utility
 *
 * Provides optimized batch read and write operations for DynamoDB
 * to reduce latency and costs per Requirement 16.5
 *
 * Features:
 * - Automatic batching (25 items per batch for writes, 100 for reads)
 * - Retry logic for unprocessed items
 * - Parallel batch execution
 * - Error handling and logging
 */
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
interface BatchGetRequest {
    tableName: string;
    keys: any[];
}
interface BatchWriteRequest {
    tableName: string;
    items: any[];
    operation: 'put' | 'delete';
}
interface BatchOperationResult<T = any> {
    items: T[];
    unprocessedKeys?: any[];
    errors?: Error[];
}
export declare class DynamoDBBatchOperations {
    private docClient;
    private maxRetries;
    private retryDelay;
    constructor(docClient: DynamoDBDocumentClient, maxRetries?: number, retryDelay?: number);
    /**
     * Batch get items from DynamoDB
     * Automatically splits into batches of 100 items
     */
    batchGet<T = any>(request: BatchGetRequest): Promise<BatchOperationResult<T>>;
    /**
     * Execute a single batch get operation
     */
    private executeBatchGet;
    /**
     * Retry batch get with exponential backoff
     */
    private retryBatchGet;
    /**
     * Batch write items to DynamoDB (put or delete)
     * Automatically splits into batches of 25 items
     */
    batchWrite(request: BatchWriteRequest): Promise<BatchOperationResult>;
    /**
     * Execute a single batch write operation
     */
    private executeBatchWrite;
    /**
     * Retry batch write with exponential backoff
     */
    private retryBatchWrite;
    /**
     * Sleep utility for retry delays
     */
    private sleep;
}
/**
 * Helper function to create batch operations instance
 */
export declare function createBatchOperations(docClient: DynamoDBDocumentClient): DynamoDBBatchOperations;
export {};
