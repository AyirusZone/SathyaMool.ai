"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const audit_1 = require("../audit");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
/**
 * Lambda handler for user login
 * Authenticates users via Cognito and issues JWT tokens with role claims
 * Logs authentication events to AuditLogs table
 */
const handler = async (event) => {
    console.log('Login request received:', JSON.stringify(event, null, 2));
    const requestId = (0, audit_1.extractRequestId)(event);
    const ipAddress = (0, audit_1.extractIpAddress)(event);
    const userAgent = (0, audit_1.extractUserAgent)(event);
    try {
        // Parse request body
        if (!event.body) {
            return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
        }
        const body = JSON.parse(event.body);
        // Determine username from email, phoneNumber, or username field
        const username = body.username || body.email || body.phoneNumber;
        // Validate input
        if (!username || !body.password) {
            return createErrorResponse(400, 'MISSING_CREDENTIALS', 'Username and password are required');
        }
        // Authenticate with Cognito using USER_PASSWORD_AUTH flow
        const authCommand = new client_cognito_identity_provider_1.InitiateAuthCommand({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: USER_POOL_CLIENT_ID,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: body.password,
            },
        });
        const authResponse = await cognitoClient.send(authCommand);
        if (!authResponse.AuthenticationResult) {
            return createErrorResponse(401, 'AUTHENTICATION_FAILED', 'Invalid username or password');
        }
        // Extract tokens
        const accessToken = authResponse.AuthenticationResult.AccessToken;
        const idToken = authResponse.AuthenticationResult.IdToken;
        const refreshToken = authResponse.AuthenticationResult.RefreshToken;
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
        // Update last login timestamp in DynamoDB Users table
        const now = new Date().toISOString();
        const updateCommand = new lib_dynamodb_1.UpdateCommand({
            TableName: USERS_TABLE_NAME,
            Key: { userId: userId },
            UpdateExpression: 'SET lastLogin = :lastLogin',
            ExpressionAttributeValues: {
                ':lastLogin': now,
            },
        });
        await docClient.send(updateCommand);
        // Log successful authentication event using audit module
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.USER_LOGIN,
            resourceType: audit_1.ResourceType.USER,
            resourceId: userId,
            requestId: requestId,
            ipAddress: ipAddress,
            userAgent: userAgent,
            metadata: {
                username: username,
                role: role,
            },
        });
        // Prepare response
        const response = {
            accessToken: accessToken,
            idToken: idToken,
            refreshToken: refreshToken,
            expiresIn: expiresIn,
            tokenType: 'Bearer',
            userId: userId,
            role: role,
        };
        console.log('Login successful, returning response with userId:', userId, 'role:', role);
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
        console.error('Login error:', error);
        // Handle Cognito-specific errors
        if (error.name === 'NotAuthorizedException') {
            return createErrorResponse(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
        }
        if (error.name === 'UserNotConfirmedException') {
            return createErrorResponse(403, 'USER_NOT_CONFIRMED', 'User account is not confirmed. Please verify your account.');
        }
        if (error.name === 'UserNotFoundException') {
            return createErrorResponse(401, 'INVALID_CREDENTIALS', 'Invalid username or password');
        }
        if (error.name === 'PasswordResetRequiredException') {
            return createErrorResponse(403, 'PASSWORD_RESET_REQUIRED', 'Password reset is required for this account');
        }
        if (error.name === 'TooManyRequestsException') {
            return createErrorResponse(429, 'TOO_MANY_REQUESTS', 'Too many login attempts. Please try again later.');
        }
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred during login. Please try again.');
    }
};
exports.handler = handler;
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
//# sourceMappingURL=login.js.map