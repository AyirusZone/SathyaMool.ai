"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const idempotency_1 = require("../utils/idempotency");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
/**
 * Lambda handler for property creation with idempotency
 * Creates a new property verification record in DynamoDB
 * Associates property with authenticated user from JWT claims
 * Uses idempotency to prevent duplicate property creation
 */
const handler = async (event) => {
    console.log('Create property request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId from authorizer context
        const userId = event.requestContext.authorizer?.claims?.sub;
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Parse request body
        if (!event.body) {
            return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
        }
        const body = JSON.parse(event.body);
        // Validate input
        const validationError = validatePropertyInput(body);
        if (validationError) {
            return createErrorResponse(400, 'VALIDATION_ERROR', validationError);
        }
        // Generate idempotency key from user ID and property details
        // This ensures the same user creating the same property details gets the same result
        const idempotencyData = {
            userId,
            address: body.address,
            surveyNumber: body.surveyNumber,
            description: body.description,
        };
        const idempotencyKey = `property:create:${(0, idempotency_1.generateIdempotencyKey)(idempotencyData)}`;
        console.log(`Creating property with idempotency key: ${idempotencyKey}`);
        // Execute idempotent property creation
        const result = await (0, idempotency_1.executeIdempotent)(async () => {
            // Generate unique propertyId
            const propertyId = (0, uuid_1.v4)();
            const now = new Date().toISOString();
            // Create property record
            const propertyRecord = {
                propertyId: propertyId,
                userId: userId,
                address: body.address || null,
                surveyNumber: body.surveyNumber || null,
                description: body.description || null,
                status: 'pending',
                trustScore: null,
                documentCount: 0,
                createdAt: now,
                updatedAt: now,
            };
            // Store in DynamoDB with conditional write to prevent duplicates
            const success = await (0, idempotency_1.conditionalPut)({
                TableName: PROPERTIES_TABLE_NAME,
                Item: propertyRecord,
                ConditionExpression: 'attribute_not_exists(propertyId)',
            });
            if (!success) {
                // Property already exists, fetch and return it
                console.log(`Property ${propertyId} already exists, fetching existing record`);
                const getCommand = new lib_dynamodb_1.GetCommand({
                    TableName: PROPERTIES_TABLE_NAME,
                    Key: { propertyId },
                });
                const existingResult = await docClient.send(getCommand);
                return existingResult.Item;
            }
            console.log('Property record created:', propertyRecord);
            return propertyRecord;
        }, idempotencyData, { idempotencyKey });
        // Prepare response
        if (!result) {
            throw new Error('Failed to create property record');
        }
        const response = {
            propertyId: result.propertyId,
            userId: result.userId,
            address: result.address,
            surveyNumber: result.surveyNumber,
            description: result.description,
            status: result.status,
            trustScore: result.trustScore,
            createdAt: result.createdAt,
            message: 'Property verification created successfully',
        };
        return {
            statusCode: 201,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('Create property error:', error);
        // Handle idempotency errors
        if (error.message === 'Operation already in progress') {
            return createErrorResponse(409, 'OPERATION_IN_PROGRESS', 'Property creation is already in progress. Please wait.');
        }
        // Handle DynamoDB-specific errors
        if (error.name === 'ConditionalCheckFailedException') {
            return createErrorResponse(409, 'PROPERTY_EXISTS', 'A property with this ID already exists');
        }
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while creating the property. Please try again.');
    }
};
exports.handler = handler;
/**
 * Validate property input
 */
function validatePropertyInput(body) {
    // At least one of address or surveyNumber should be provided
    if (!body.address && !body.surveyNumber) {
        return 'Either address or survey number is required';
    }
    // Validate address length if provided
    if (body.address && body.address.length > 500) {
        return 'Address must not exceed 500 characters';
    }
    // Validate survey number format if provided
    if (body.surveyNumber && body.surveyNumber.length > 100) {
        return 'Survey number must not exceed 100 characters';
    }
    // Validate description length if provided
    if (body.description && body.description.length > 1000) {
        return 'Description must not exceed 1000 characters';
    }
    return null;
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
//# sourceMappingURL=create-property.js.map