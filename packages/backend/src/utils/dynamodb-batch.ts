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

import { DynamoDBDocumentClient, BatchGetCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

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

export class DynamoDBBatchOperations {
  private docClient: DynamoDBDocumentClient;
  private maxRetries: number;
  private retryDelay: number;

  constructor(
    docClient: DynamoDBDocumentClient,
    maxRetries: number = 3,
    retryDelay: number = 100
  ) {
    this.docClient = docClient;
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  /**
   * Batch get items from DynamoDB
   * Automatically splits into batches of 100 items
   */
  async batchGet<T = any>(request: BatchGetRequest): Promise<BatchOperationResult<T>> {
    const { tableName, keys } = request;
    const batchSize = 100; // DynamoDB limit for BatchGetItem
    const batches: any[][] = [];

    // Split keys into batches
    for (let i = 0; i < keys.length; i += batchSize) {
      batches.push(keys.slice(i, i + batchSize));
    }

    console.log(`Batch get: ${keys.length} items from ${tableName} in ${batches.length} batches`);

    const results: T[] = [];
    const errors: Error[] = [];
    let unprocessedKeys: any[] = [];

    // Execute batches in parallel
    const batchPromises = batches.map(async (batch) => {
      return this.executeBatchGet<T>(tableName, batch);
    });

    const batchResults = await Promise.allSettled(batchPromises);

    // Collect results
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(...result.value.items);
        if (result.value.unprocessedKeys) {
          unprocessedKeys.push(...result.value.unprocessedKeys);
        }
      } else {
        errors.push(result.reason);
      }
    }

    // Retry unprocessed keys
    if (unprocessedKeys.length > 0) {
      console.log(`Retrying ${unprocessedKeys.length} unprocessed keys`);
      const retryResult = await this.retryBatchGet<T>(tableName, unprocessedKeys);
      results.push(...retryResult.items);
      if (retryResult.unprocessedKeys) {
        unprocessedKeys = retryResult.unprocessedKeys;
      }
    }

    return {
      items: results,
      unprocessedKeys: unprocessedKeys.length > 0 ? unprocessedKeys : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute a single batch get operation
   */
  private async executeBatchGet<T>(
    tableName: string,
    keys: any[]
  ): Promise<BatchOperationResult<T>> {
    const command = new BatchGetCommand({
      RequestItems: {
        [tableName]: {
          Keys: keys,
        },
      },
    });

    const response = await this.docClient.send(command);
    const items = (response.Responses?.[tableName] || []) as T[];
    const unprocessedKeys = response.UnprocessedKeys?.[tableName]?.Keys;

    return {
      items,
      unprocessedKeys,
    };
  }

  /**
   * Retry batch get with exponential backoff
   */
  private async retryBatchGet<T>(
    tableName: string,
    keys: any[]
  ): Promise<BatchOperationResult<T>> {
    let attempt = 0;
    let remainingKeys = keys;
    const results: T[] = [];

    while (attempt < this.maxRetries && remainingKeys.length > 0) {
      attempt++;
      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      
      console.log(`Retry attempt ${attempt} for ${remainingKeys.length} keys after ${delay}ms`);
      await this.sleep(delay);

      const result = await this.executeBatchGet<T>(tableName, remainingKeys);
      results.push(...result.items);
      remainingKeys = result.unprocessedKeys || [];
    }

    return {
      items: results,
      unprocessedKeys: remainingKeys.length > 0 ? remainingKeys : undefined,
    };
  }

  /**
   * Batch write items to DynamoDB (put or delete)
   * Automatically splits into batches of 25 items
   */
  async batchWrite(request: BatchWriteRequest): Promise<BatchOperationResult> {
    const { tableName, items, operation } = request;
    const batchSize = 25; // DynamoDB limit for BatchWriteItem
    const batches: any[][] = [];

    // Split items into batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    console.log(`Batch write: ${items.length} items to ${tableName} in ${batches.length} batches`);

    const errors: Error[] = [];
    let unprocessedItems: any[] = [];

    // Execute batches in parallel (with concurrency limit)
    const concurrencyLimit = 5; // Limit parallel writes to avoid throttling
    for (let i = 0; i < batches.length; i += concurrencyLimit) {
      const batchGroup = batches.slice(i, i + concurrencyLimit);
      const batchPromises = batchGroup.map(async (batch) => {
        return this.executeBatchWrite(tableName, batch, operation);
      });

      const batchResults = await Promise.allSettled(batchPromises);

      // Collect results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.unprocessedKeys) {
            unprocessedItems.push(...result.value.unprocessedKeys);
          }
        } else {
          errors.push(result.reason);
        }
      }
    }

    // Retry unprocessed items
    if (unprocessedItems.length > 0) {
      console.log(`Retrying ${unprocessedItems.length} unprocessed items`);
      const retryResult = await this.retryBatchWrite(tableName, unprocessedItems, operation);
      if (retryResult.unprocessedKeys) {
        unprocessedItems = retryResult.unprocessedKeys;
      }
    }

    return {
      items: [],
      unprocessedKeys: unprocessedItems.length > 0 ? unprocessedItems : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Execute a single batch write operation
   */
  private async executeBatchWrite(
    tableName: string,
    items: any[],
    operation: 'put' | 'delete'
  ): Promise<BatchOperationResult> {
    const requests = items.map((item) => {
      if (operation === 'put') {
        return { PutRequest: { Item: item } };
      } else {
        return { DeleteRequest: { Key: item } };
      }
    });

    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: requests,
      },
    });

    const response = await this.docClient.send(command);
    const unprocessedItems = response.UnprocessedItems?.[tableName];

    return {
      items: [],
      unprocessedKeys: unprocessedItems?.map((req: any) => 
        req.PutRequest?.Item || req.DeleteRequest?.Key
      ),
    };
  }

  /**
   * Retry batch write with exponential backoff
   */
  private async retryBatchWrite(
    tableName: string,
    items: any[],
    operation: 'put' | 'delete'
  ): Promise<BatchOperationResult> {
    let attempt = 0;
    let remainingItems = items;

    while (attempt < this.maxRetries && remainingItems.length > 0) {
      attempt++;
      const delay = this.retryDelay * Math.pow(2, attempt - 1);
      
      console.log(`Retry attempt ${attempt} for ${remainingItems.length} items after ${delay}ms`);
      await this.sleep(delay);

      const result = await this.executeBatchWrite(tableName, remainingItems, operation);
      remainingItems = result.unprocessedKeys || [];
    }

    return {
      items: [],
      unprocessedKeys: remainingItems.length > 0 ? remainingItems : undefined,
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Helper function to create batch operations instance
 */
export function createBatchOperations(docClient: DynamoDBDocumentClient): DynamoDBBatchOperations {
  return new DynamoDBBatchOperations(docClient);
}
