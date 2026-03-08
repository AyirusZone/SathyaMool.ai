/**
 * Idempotency Utility for SatyaMool Lambda Functions
 * 
 * Provides idempotency key management and conditional write operations
 * to prevent duplicate processing and race conditions.
 * 
 * Requirements: 3.1, 3.3 - Handle duplicate messages and prevent race conditions
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  PutCommandInput,
  UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || 'SatyaMool-Idempotency';
const IDEMPOTENCY_TTL_HOURS = 24; // Keep idempotency records for 24 hours

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
export function generateIdempotencyKey(data: any): string {
  const dataString = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Check if an operation with the given idempotency key has already been processed
 * 
 * @param idempotencyKey - Unique key for the operation
 * @returns IdempotencyRecord if exists, null otherwise
 */
export async function checkIdempotency(
  idempotencyKey: string
): Promise<IdempotencyRecord | null> {
  try {
    const getCommand = new GetCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: { idempotencyKey },
    });

    const result = await docClient.send(getCommand);
    
    if (result.Item) {
      return result.Item as IdempotencyRecord;
    }
    
    return null;
  } catch (error) {
    console.error('Error checking idempotency:', error);
    throw error;
  }
}

/**
 * Mark operation as in progress
 * Uses conditional write to prevent race conditions
 * 
 * @param idempotencyKey - Unique key for the operation
 * @param ttlHours - TTL in hours (default: 24)
 * @returns true if successfully marked, false if already exists
 */
export async function markInProgress(
  idempotencyKey: string,
  ttlHours: number = IDEMPOTENCY_TTL_HOURS
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (ttlHours * 3600);

    const putCommand = new PutCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Item: {
        idempotencyKey,
        status: 'IN_PROGRESS',
        createdAt: now,
        updatedAt: now,
        ttl,
      },
      // Conditional write: only create if doesn't exist
      ConditionExpression: 'attribute_not_exists(idempotencyKey)',
    });

    await docClient.send(putCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      // Record already exists
      return false;
    }
    console.error('Error marking operation in progress:', error);
    throw error;
  }
}

/**
 * Mark operation as completed and store result
 * 
 * @param idempotencyKey - Unique key for the operation
 * @param result - Result to store
 */
export async function markCompleted(
  idempotencyKey: string,
  result?: any
): Promise<void> {
  try {
    const now = new Date().toISOString();

    const updateCommand = new UpdateCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: { idempotencyKey },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, #result = :result',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#result': 'result',
      },
      ExpressionAttributeValues: {
        ':status': 'COMPLETED',
        ':updatedAt': now,
        ':result': result || null,
      },
    });

    await docClient.send(updateCommand);
  } catch (error) {
    console.error('Error marking operation completed:', error);
    throw error;
  }
}

/**
 * Mark operation as failed and store error
 * 
 * @param idempotencyKey - Unique key for the operation
 * @param error - Error message
 */
export async function markFailed(
  idempotencyKey: string,
  error: string
): Promise<void> {
  try {
    const now = new Date().toISOString();

    const updateCommand = new UpdateCommand({
      TableName: IDEMPOTENCY_TABLE_NAME,
      Key: { idempotencyKey },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt, #error = :error',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#error': 'error',
      },
      ExpressionAttributeValues: {
        ':status': 'FAILED',
        ':updatedAt': now,
        ':error': error,
      },
    });

    await docClient.send(updateCommand);
  } catch (error) {
    console.error('Error marking operation failed:', error);
    throw error;
  }
}

/**
 * Execute an idempotent operation
 * Handles checking, marking in progress, executing, and marking completed/failed
 * 
 * @param operation - Async function to execute
 * @param data - Data to generate idempotency key from
 * @param options - Idempotency options
 * @returns Result of the operation
 */
export async function executeIdempotent<T>(
  operation: () => Promise<T>,
  data: any,
  options: IdempotencyOptions = {}
): Promise<T> {
  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey(data);
  const ttlHours = options.ttlHours || IDEMPOTENCY_TTL_HOURS;
  const throwOnInProgress = options.throwOnInProgress !== false;

  console.log(`Executing idempotent operation with key: ${idempotencyKey}`);

  // Check if operation already processed
  const existingRecord = await checkIdempotency(idempotencyKey);

  if (existingRecord) {
    console.log(`Idempotency record found with status: ${existingRecord.status}`);

    if (existingRecord.status === 'COMPLETED') {
      console.log('Operation already completed, returning cached result');
      return existingRecord.result as T;
    }

    if (existingRecord.status === 'IN_PROGRESS') {
      if (throwOnInProgress) {
        throw new Error('Operation already in progress');
      }
      console.log('Operation already in progress, skipping');
      return existingRecord.result as T;
    }

    if (existingRecord.status === 'FAILED') {
      console.log('Previous operation failed, retrying');
      // Allow retry for failed operations
    }
  }

  // Mark as in progress
  const marked = await markInProgress(idempotencyKey, ttlHours);

  if (!marked) {
    // Another process marked it first (race condition)
    console.log('Another process started this operation, checking again');
    const record = await checkIdempotency(idempotencyKey);
    
    if (record && record.status === 'COMPLETED') {
      return record.result as T;
    }
    
    if (throwOnInProgress) {
      throw new Error('Operation already in progress (race condition detected)');
    }
    
    // Return undefined or throw based on configuration
    return undefined as T;
  }

  // Execute the operation
  try {
    const result = await operation();
    await markCompleted(idempotencyKey, result);
    console.log('Operation completed successfully');
    return result;
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    await markFailed(idempotencyKey, errorMessage);
    console.error('Operation failed:', errorMessage);
    throw error;
  }
}

/**
 * Conditional put operation for DynamoDB
 * Prevents duplicate records with the same key
 * 
 * @param params - PutCommand parameters
 * @returns true if successful, false if item already exists
 */
export async function conditionalPut(
  params: PutCommandInput
): Promise<boolean> {
  try {
    // If no condition expression provided, add default one
    if (!params.ConditionExpression) {
      const partitionKey = Object.keys(params.Item || {})[0];
      params.ConditionExpression = `attribute_not_exists(${partitionKey})`;
    }

    const putCommand = new PutCommand(params);
    await docClient.send(putCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log('Conditional put failed: item already exists');
      return false;
    }
    throw error;
  }
}

/**
 * Conditional update operation for DynamoDB
 * Only updates if the item exists and meets the condition
 * 
 * @param params - UpdateCommand parameters
 * @returns true if successful, false if condition not met
 */
export async function conditionalUpdate(
  params: UpdateCommandInput
): Promise<boolean> {
  try {
    const updateCommand = new UpdateCommand(params);
    await docClient.send(updateCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log('Conditional update failed: condition not met');
      return false;
    }
    throw error;
  }
}

/**
 * Generate SQS message deduplication ID
 * Used for FIFO queues to prevent duplicate message processing
 * 
 * @param messageBody - SQS message body
 * @returns Deduplication ID
 */
export function generateSQSDeduplicationId(messageBody: any): string {
  return generateIdempotencyKey(messageBody);
}

/**
 * Extract idempotency key from SQS message
 * Checks message attributes and generates from body if not present
 * 
 * @param sqsRecord - SQS record from Lambda event
 * @returns Idempotency key
 */
export function extractSQSIdempotencyKey(sqsRecord: any): string {
  // Check for explicit idempotency key in message attributes
  const messageAttributes = sqsRecord.messageAttributes || {};
  
  if (messageAttributes.idempotencyKey) {
    return messageAttributes.idempotencyKey.stringValue;
  }

  // For FIFO queues, use message deduplication ID
  if (sqsRecord.attributes?.MessageDeduplicationId) {
    return sqsRecord.attributes.MessageDeduplicationId;
  }

  // Generate from message body
  const messageBody = JSON.parse(sqsRecord.body);
  return generateIdempotencyKey(messageBody);
}
