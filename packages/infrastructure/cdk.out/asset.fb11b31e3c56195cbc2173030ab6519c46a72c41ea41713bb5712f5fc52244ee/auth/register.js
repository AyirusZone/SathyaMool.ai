"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const audit_1 = require("../audit");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID;
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
/**
 * Lambda handler for user registration
 * Supports both email and phone number registration
 * Integrates with Cognito User Pool and DynamoDB Users table
 */
const handler = async (event) => {
    console.log('Registration request received:', JSON.stringify(event, null, 2));
    try {
        // Parse request body
        if (!event.body) {
            return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
        }
        const body = JSON.parse(event.body);
        // Validate input
        const validationError = validateRegistrationInput(body);
        if (validationError) {
            return createErrorResponse(400, 'VALIDATION_ERROR', validationError);
        }
        // Determine username (email or phone number)
        const username = body.email || body.phoneNumber;
        const userId = (0, uuid_1.v4)();
        // Prepare user attributes for Cognito
        const userAttributes = [];
        if (body.email) {
            userAttributes.push({
                Name: 'email',
                Value: body.email,
            });
        }
        if (body.phoneNumber) {
            // Ensure phone number is in E.164 format
            const formattedPhone = formatPhoneNumber(body.phoneNumber);
            userAttributes.push({
                Name: 'phone_number',
                Value: formattedPhone,
            });
        }
        if (body.givenName) {
            userAttributes.push({
                Name: 'given_name',
                Value: body.givenName,
            });
        }
        if (body.familyName) {
            userAttributes.push({
                Name: 'family_name',
                Value: body.familyName,
            });
        }
        // Add custom role attribute (default to Standard_User)
        const role = body.role || 'Standard_User';
        userAttributes.push({
            Name: 'custom:role',
            Value: role,
        });
        // Add userId as custom attribute
        userAttributes.push({
            Name: 'sub',
            Value: userId,
        });
        // Register user in Cognito
        const signUpCommand = new client_cognito_identity_provider_1.SignUpCommand({
            ClientId: USER_POOL_CLIENT_ID,
            Username: username,
            Password: body.password,
            UserAttributes: userAttributes,
        });
        const signUpResponse = await cognitoClient.send(signUpCommand);
        console.log('Cognito SignUp successful:', signUpResponse);
        // Store user metadata in DynamoDB
        const now = new Date().toISOString();
        const userRecord = {
            userId: userId,
            email: body.email || null,
            phoneNumber: body.phoneNumber || null,
            givenName: body.givenName || null,
            familyName: body.familyName || null,
            role: role,
            status: signUpResponse.UserConfirmed ? 'active' : 'pending_verification',
            createdAt: now,
            lastLogin: null,
            cognitoUsername: signUpResponse.UserSub,
        };
        const putCommand = new lib_dynamodb_1.PutCommand({
            TableName: USERS_TABLE_NAME,
            Item: userRecord,
        });
        await docClient.send(putCommand);
        console.log('User record created in DynamoDB:', userRecord);
        // Log user registration event
        await (0, audit_1.createAuditLog)({
            userId: userId,
            action: audit_1.AuditAction.USER_REGISTERED,
            resourceType: audit_1.ResourceType.USER,
            resourceId: userId,
            requestId: (0, audit_1.extractRequestId)(event),
            ipAddress: (0, audit_1.extractIpAddress)(event),
            userAgent: (0, audit_1.extractUserAgent)(event),
            metadata: {
                email: body.email,
                phoneNumber: body.phoneNumber,
                role: role,
                userConfirmed: signUpResponse.UserConfirmed,
            },
        });
        // Prepare response
        const response = {
            userId: userId,
            message: signUpResponse.UserConfirmed
                ? 'Registration successful. You can now log in.'
                : 'Registration successful. Please verify your account using the code sent to you.',
            userConfirmed: signUpResponse.UserConfirmed || false,
        };
        if (signUpResponse.CodeDeliveryDetails) {
            response.codeDeliveryDetails = {
                destination: signUpResponse.CodeDeliveryDetails.Destination || '',
                deliveryMedium: signUpResponse.CodeDeliveryDetails.DeliveryMedium || '',
                attributeName: signUpResponse.CodeDeliveryDetails.AttributeName || '',
            };
        }
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
        console.error('Registration error:', error);
        // Handle Cognito-specific errors
        if (error.name === 'UsernameExistsException') {
            return createErrorResponse(409, 'USER_EXISTS', 'A user with this email or phone number already exists');
        }
        if (error.name === 'InvalidPasswordException') {
            return createErrorResponse(400, 'INVALID_PASSWORD', 'Password does not meet requirements: minimum 8 characters, must include uppercase, lowercase, number, and special character');
        }
        if (error.name === 'InvalidParameterException') {
            return createErrorResponse(400, 'INVALID_PARAMETER', error.message || 'Invalid parameter provided');
        }
        if (error.name === 'CodeDeliveryFailureException') {
            return createErrorResponse(500, 'CODE_DELIVERY_FAILURE', 'Failed to send verification code. Please try again.');
        }
        // Generic error response
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred during registration. Please try again.');
    }
};
exports.handler = handler;
/**
 * Validate registration input
 */
function validateRegistrationInput(body) {
    // Must provide either email or phone number
    if (!body.email && !body.phoneNumber) {
        return 'Either email or phone number is required';
    }
    // Cannot provide both email and phone number for initial registration
    // (User can add the other later)
    if (body.email && body.phoneNumber) {
        return 'Please provide either email or phone number, not both';
    }
    // Validate email format
    if (body.email && !isValidEmail(body.email)) {
        return 'Invalid email format';
    }
    // Validate phone number format
    if (body.phoneNumber && !isValidPhoneNumber(body.phoneNumber)) {
        return 'Invalid phone number format. Please use E.164 format (e.g., +919876543210)';
    }
    // Password is required
    if (!body.password) {
        return 'Password is required';
    }
    // Validate password strength
    if (body.password.length < 8) {
        return 'Password must be at least 8 characters long';
    }
    // Validate role if provided
    if (body.role && !['Standard_User', 'Professional_User'].includes(body.role)) {
        return 'Invalid role. Must be Standard_User or Professional_User';
    }
    return null;
}
/**
 * Validate email format
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
/**
 * Validate phone number format (E.164)
 */
function isValidPhoneNumber(phoneNumber) {
    // E.164 format: +[country code][number]
    // Example: +919876543210 (India)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    // Also accept Indian 10-digit numbers without country code
    const indianPhoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phoneNumber) || indianPhoneRegex.test(phoneNumber);
}
/**
 * Format phone number to E.164 format
 */
function formatPhoneNumber(phoneNumber) {
    // Remove all non-digit characters except leading +
    let formatted = phoneNumber.trim();
    // If it doesn't start with +, assume it needs country code
    if (!formatted.startsWith('+')) {
        // For Indian numbers, add +91 if not present
        if (formatted.length === 10 && formatted.match(/^[6-9]\d{9}$/)) {
            formatted = '+91' + formatted;
        }
        else {
            // Return as-is and let validation catch it
            formatted = '+' + formatted.replace(/\D/g, '');
        }
    }
    return formatted;
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
//# sourceMappingURL=register.js.map