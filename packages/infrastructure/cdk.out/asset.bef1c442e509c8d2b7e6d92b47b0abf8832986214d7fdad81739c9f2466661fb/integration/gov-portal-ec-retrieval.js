"use strict";
/**
 * Government Portal EC Retrieval Lambda
 *
 * Placeholder API for future integration with state government portals
 * to automatically retrieve Encumbrance Certificates.
 *
 * Requirements: 19.1, 19.4, 19.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ec_retrieval_fallback_1 = require("./ec-retrieval-fallback");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'StatePortalConfigurations';
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'AuditLogs';
/**
 * Log integration attempt to audit logs
 */
async function logIntegrationAttempt(requestId, propertyId, state, status, userId) {
    try {
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: AUDIT_LOGS_TABLE,
            Item: {
                logId: requestId,
                timestamp: new Date().toISOString(),
                userId: userId || 'system',
                action: 'gov_portal_ec_retrieval',
                resourceType: 'property',
                resourceId: propertyId,
                metadata: {
                    state,
                    status,
                    integrationAvailable: false
                }
            }
        }));
    }
    catch (error) {
        console.error('Failed to log integration attempt:', error);
    }
}
/**
 * Check if state portal integration is available
 */
async function checkStatePortalAvailability(state) {
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: STATE_CONFIG_TABLE,
            Key: { state }
        }));
        return result.Item?.enabled === true && result.Item?.status === 'active';
    }
    catch (error) {
        console.error('Failed to check state portal availability:', error);
        return false;
    }
}
/**
 * Lambda handler for EC retrieval from government portals
 */
const handler = async (event) => {
    console.log('EC Retrieval Request:', JSON.stringify(event, null, 2));
    try {
        // Parse request body
        if (!event.body) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Missing request body',
                    message: 'Request body is required'
                })
            };
        }
        const request = JSON.parse(event.body);
        // Validate required fields
        if (!request.propertyId || !request.state || !request.surveyNumber) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    error: 'Invalid request',
                    message: 'propertyId, state, and surveyNumber are required'
                })
            };
        }
        // Generate request ID
        const requestId = `ec-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        // Extract user ID from authorizer context
        const userId = event.requestContext?.authorizer?.claims?.sub;
        // Determine EC retrieval strategy (Requirement 19.3)
        const retrievalStrategy = await (0, ec_retrieval_fallback_1.determineECRetrievalStrategy)(request.state);
        // Log integration attempt (Requirement 19.7)
        await logIntegrationAttempt(requestId, request.propertyId, request.state, retrievalStrategy.available ? 'initiated' : 'unavailable', userId);
        // Build response based on strategy
        const response = {
            requestId,
            status: retrievalStrategy.available ? 'pending' : 'unavailable',
            message: retrievalStrategy.message,
            webhookUrl: `${process.env.API_GATEWAY_URL}/v1/integration/webhook/${requestId}`
        };
        // Add manual upload instructions if fallback is needed
        if (retrievalStrategy.strategy === 'manual') {
            response.manualUploadInstructions = (0, ec_retrieval_fallback_1.getManualUploadInstructions)(request.state);
            response.fallbackReason = retrievalStrategy.fallbackReason;
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify(response)
        };
    }
    catch (error) {
        console.error('Error processing EC retrieval request:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                error: 'Internal server error',
                message: 'Failed to process EC retrieval request'
            })
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=gov-portal-ec-retrieval.js.map