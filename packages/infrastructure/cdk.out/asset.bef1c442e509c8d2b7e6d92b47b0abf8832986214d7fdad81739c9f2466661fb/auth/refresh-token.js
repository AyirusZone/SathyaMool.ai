"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const AUDIT_LOGS_TABLE_NAME = process.env.AUDIT_LOGS_TABLE_NAME || 'SatyaMool-AuditLogs';
/**
 * Lambda handler for token refresh
 * Validates refresh tokens and issues new access tokens
 * Requirement 1.8: Automatically refresh JWT tokens before expiration during active sessions
 */
const handler = async (event) => {
    console.log('Token refresh request received:', JSON.stringify(event, null, 2));
    const requestId = event.requestContext.requestId;
    const ipAddress = event.requestContext.identity.sourceIp;
    const userAgent = event.requestContext.identity.userAgent || 'unknown';
    try {
        // Parse request body
        if (!event.body) {
            await logTokenRefreshEvent(null, 'token_refresh_failed', 'missing_body', requestId, ipAddress, userAgent);
            return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
        }
        const body = JSON.parse(event.body);
        // Validate input
        if (!body.refreshToken) {
            await logTokenRefreshEvent(null, 'token_refresh_failed', 'missing_refresh_token', requestId, ipAddress, userAgent);
            return createErrorResponse(400, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
        }
        // Refresh tokens using Cognito REFRESH_TOKEN_AUTH flow
        const authCommand = new client_cognito_identity_provider_1.InitiateAuthCommand({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                REFRESH_TOKEN: body.refreshToken,
            },
        });
        const authResponse = await cognitoClient.send(authCommand);
        if (!authResponse.AuthenticationResult) {
            await logTokenRefreshEvent(null, 'token_refresh_failed', 'invalid_refresh_token', requestId, ipAddress, userAgent);
            return createErrorResponse(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
        }
        // Extract new tokens
        const accessToken = authResponse.AuthenticationResult.AccessToken;
        const idToken = authResponse.AuthenticationResult.IdToken;
        const expiresIn = authResponse.AuthenticationResult.ExpiresIn;
        // Get user details from Cognito to extract userId and role
        const getUserCommand = new client_cognito_identity_provider_1.GetUserCommand({
            AccessToken: accessToken,
        });
        const userResponse = await cognitoClient.send(getUserCommand);
        // Extract user attributes
        const userAttributes = userResponse.UserAttributes || [];
        const userId = userAttributes.find((attr) => attr.Name === 'sub')?.Value || '';
        const role = userAttributes.find((attr) => attr.Name === 'custom:role')?.Value ||
            'Standard_User';
        // Log successful token refresh event
        await logTokenRefreshEvent(userId, 'token_refresh_success', 'tokens_refreshed', requestId, ipAddress, userAgent);
        // Prepare response
        const response = {
            accessToken: accessToken,
            idToken: idToken,
            expiresIn: expiresIn,
            tokenType: 'Bearer',
            userId: userId,
            role: role,
        };
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        console.error('Token refresh error:', error);
        // Log failed token refresh event
        await logTokenRefreshEvent(null, 'token_refresh_failed', error.name || 'unknown_error', requestId, ipAddress, userAgent);
        // Handle Cognito-specific errors
        if (error.name === 'NotAuthorizedException') {
            return createErrorResponse(401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
        }
        if (error.name === 'UserNotFoundException') {
            return createErrorResponse(401, 'USER_NOT_FOUND', 'User not found');
        }
        if (error.name === 'TooManyRequestsException') {
            return createErrorResponse(429, 'TOO_MANY_REQUESTS', 'Too many refresh attempts. Please try again later.');
        }
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred during token refresh. Please try again.');
    }
};
exports.handler = handler;
/**
 * Log token refresh event to AuditLogs table
 * Requirement 17.1: Log all authentication events with timestamp, IP address, and outcome
 */
async function logTokenRefreshEvent(userId, action, outcome, requestId, ipAddress, userAgent) {
    try {
        const logId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        const auditLog = {
            logId: logId,
            timestamp: timestamp,
            userId: userId,
            action: action,
            outcome: outcome,
            resourceType: 'authentication',
            resourceId: null,
            ipAddress: ipAddress,
            userAgent: userAgent,
            requestId: requestId,
        };
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: AUDIT_LOGS_TABLE_NAME,
            Item: auditLog,
        });
        await docClient.send(putCommand);
        console.log('Token refresh event logged:', auditLog);
    }
    catch (error) {
        console.error('Failed to log token refresh event:', error);
        // Don't throw error - logging failure should not prevent token refresh
    }
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
//# sourceMappingURL=refresh-token.js.map