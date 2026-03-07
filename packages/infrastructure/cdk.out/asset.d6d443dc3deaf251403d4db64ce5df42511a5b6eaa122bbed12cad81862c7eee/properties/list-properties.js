"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamodb_cache_1 = require("../utils/dynamodb-cache");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
/**
 * Lambda handler for listing properties
 * Lists all properties for the authenticated user with filtering and pagination
 */
const handler = async (event) => {
    console.log('List properties request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Extract query parameters
        const queryParams = event.queryStringParameters || {};
        const status = queryParams.status;
        const startDate = queryParams.startDate;
        const endDate = queryParams.endDate;
        const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;
        const nextToken = queryParams.nextToken;
        // Validate limit
        if (limit < 1 || limit > 100) {
            return createErrorResponse(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100');
        }
        // Validate date formats if provided
        if (startDate && !isValidISODate(startDate)) {
            return createErrorResponse(400, 'INVALID_DATE', 'startDate must be in ISO 8601 format');
        }
        if (endDate && !isValidISODate(endDate)) {
            return createErrorResponse(400, 'INVALID_DATE', 'endDate must be in ISO 8601 format');
        }
        // Generate cache key for this query
        const cacheKey = dynamodb_cache_1.propertyCache.generateKey(PROPERTIES_TABLE_NAME, {
            userId,
            status,
            startDate,
            endDate,
            limit,
            nextToken,
        });
        // Try to get from cache
        const cachedResult = dynamodb_cache_1.propertyCache.get(cacheKey);
        if (cachedResult) {
            console.log(`Cache hit for user ${userId} properties list`);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                    'X-Cache': 'HIT',
                },
                body: JSON.stringify(cachedResult),
            };
        }
        // Optimize query based on filters
        // Use userId-status-index if status filter is provided for better performance
        let queryCommand;
        if (status) {
            // Use optimized GSI for status filtering
            queryCommand = new lib_dynamodb_1.QueryCommand({
                TableName: PROPERTIES_TABLE_NAME,
                IndexName: 'userId-status-index',
                KeyConditionExpression: 'userId = :userId AND #status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status',
                },
                ExpressionAttributeValues: {
                    ':userId': userId,
                    ':status': status,
                },
                Limit: limit,
                ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
            });
        }
        else {
            // Use default GSI for general queries
            queryCommand = new lib_dynamodb_1.QueryCommand({
                TableName: PROPERTIES_TABLE_NAME,
                IndexName: 'userId-createdAt-index',
                KeyConditionExpression: 'userId = :userId',
                ExpressionAttributeValues: {
                    ':userId': userId,
                },
                Limit: limit,
                ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
                ScanIndexForward: false, // Sort by createdAt descending (newest first)
            });
        }
        const result = await docClient.send(queryCommand);
        // Filter results based on date range (if not using status GSI)
        let properties = (result.Items || []);
        // Apply date range filter
        if (startDate) {
            properties = properties.filter(p => p.createdAt >= startDate);
        }
        if (endDate) {
            properties = properties.filter(p => p.createdAt <= endDate);
        }
        // Prepare response
        const response = {
            properties: properties,
            count: properties.length,
        };
        // Add nextToken if there are more results
        if (result.LastEvaluatedKey) {
            response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
        }
        // Cache the result (TTL: 5 minutes)
        dynamodb_cache_1.propertyCache.set(cacheKey, response);
        console.log(`Retrieved ${properties.length} properties for user ${userId}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
                'X-Cache': 'MISS',
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('List properties error:', error);
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving properties. Please try again.');
    }
};
exports.handler = handler;
/**
 * Validate ISO 8601 date format
 */
function isValidISODate(dateString) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
    if (!isoDateRegex.test(dateString)) {
        return false;
    }
    const date = new Date(dateString);
    return !isNaN(date.getTime());
}
/**
 * Create error response
 */
function createErrorResponse(statusCode, errorCode, message) {
    const errorResponse = {
        error: errorCode,
        message: message,
    };
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(errorResponse),
    };
}
//# sourceMappingURL=list-properties.js.map