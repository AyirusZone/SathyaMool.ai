"use strict";
/**
 * Idempotency Utility for SatyaMool Lambda Functions
 *
 * Provides idempotency key management and conditional write operations
 * to prevent duplicate processing and race conditions.
 *
 * Requirements: 3.1, 3.3 - Handle duplicate messages and prevent race conditions
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIdempotencyKey = generateIdempotencyKey;
exports.checkIdempotency = checkIdempotency;
exports.markInProgress = markInProgress;
exports.markCompleted = markCompleted;
exports.markFailed = markFailed;
exports.executeIdempotent = executeIdempotent;
exports.conditionalPut = conditionalPut;
exports.conditionalUpdate = conditionalUpdate;
exports.generateSQSDeduplicationId = generateSQSDeduplicationId;
exports.extractSQSIdempotencyKey = extractSQSIdempotencyKey;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const crypto_1 = __importDefault(require("crypto"));
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const IDEMPOTENCY_TABLE_NAME = process.env.IDEMPOTENCY_TABLE_NAME || 'SatyaMool-Idempotency';
const IDEMPOTENCY_TTL_HOURS = 24; // Keep idempotency records for 24 hours
/**
 * Generate idempotency key from data
 * Uses SHA-256 hash of the stringified data
 */
function generateIdempotencyKey(data) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto_1.default.createHash('sha256').update(dataString).digest('hex');
}
/**
 * Check if an operation with the given idempotency key has already been processed
 *
 * @param idempotencyKey - Unique key for the operation
 * @returns IdempotencyRecord if exists, null otherwise
 */
async function checkIdempotency(idempotencyKey) {
    try {
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: IDEMPOTENCY_TABLE_NAME,
            Key: { idempotencyKey },
        });
        const result = await docClient.send(getCommand);
        if (result.Item) {
            return result.Item;
        }
        return null;
    }
    catch (error) {
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
async function markInProgress(idempotencyKey, ttlHours = IDEMPOTENCY_TTL_HOURS) {
    try {
        const now = new Date().toISOString();
        const ttl = Math.floor(Date.now() / 1000) + (ttlHours * 3600);
        const putCommand = new lib_dynamodb_1.PutCommand({
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
    }
    catch (error) {
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
async function markCompleted(idempotencyKey, result) {
    try {
        const now = new Date().toISOString();
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
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
    }
    catch (error) {
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
async function markFailed(idempotencyKey, error) {
    try {
        const now = new Date().toISOString();
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
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
    }
    catch (error) {
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
async function executeIdempotent(operation, data, options = {}) {
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
            return existingRecord.result;
        }
        if (existingRecord.status === 'IN_PROGRESS') {
            if (throwOnInProgress) {
                throw new Error('Operation already in progress');
            }
            console.log('Operation already in progress, skipping');
            return existingRecord.result;
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
            return record.result;
        }
        if (throwOnInProgress) {
            throw new Error('Operation already in progress (race condition detected)');
        }
        // Return undefined or throw based on configuration
        return undefined;
    }
    // Execute the operation
    try {
        const result = await operation();
        await markCompleted(idempotencyKey, result);
        console.log('Operation completed successfully');
        return result;
    }
    catch (error) {
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
async function conditionalPut(params) {
    try {
        // Add condition to prevent overwriting existing items
        const enhancedParams = {
            ...params,
            ConditionExpression: params.ConditionExpression || 'attribute_not_exists(#pk)',
            ExpressionAttributeNames: {
                ...params.ExpressionAttributeNames,
                '#pk': Object.keys(params.Item || {})[0], // First attribute is usually the partition key
            },
        };
        const putCommand = new lib_dynamodb_1.PutCommand(enhancedParams);
        await docClient.send(putCommand);
        return true;
    }
    catch (error) {
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
async function conditionalUpdate(params) {
    try {
        const updateCommand = new lib_dynamodb_1.UpdateCommand(params);
        await docClient.send(updateCommand);
        return true;
    }
    catch (error) {
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
function generateSQSDeduplicationId(messageBody) {
    return generateIdempotencyKey(messageBody);
}
/**
 * Extract idempotency key from SQS message
 * Checks message attributes and generates from body if not present
 *
 * @param sqsRecord - SQS record from Lambda event
 * @returns Idempotency key
 */
function extractSQSIdempotencyKey(sqsRecord) {
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
//# sourceMappingURL=idempotency.js.map