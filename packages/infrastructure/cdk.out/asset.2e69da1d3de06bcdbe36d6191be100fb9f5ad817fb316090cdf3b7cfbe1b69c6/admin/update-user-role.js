"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const logger_1 = require("../audit/logger");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';
/**
 * Update user role (Admin only)
 * PUT /v1/admin/users/{id}/role
 */
const handler = async (event) => {
    try {
        // Extract user info from authorizer context
        const adminUserId = event.requestContext.authorizer?.principalId || 'unknown';
        const adminRole = event.requestContext.authorizer?.role || '';
        // Verify admin role
        if (adminRole !== 'Admin_User') {
            await (0, logger_1.logAuditEvent)({
                userId: adminUserId,
                action: 'UPDATE_USER_ROLE_DENIED',
                resourceType: 'USER',
                resourceId: event.pathParameters?.id || 'unknown',
                ipAddress: event.requestContext.identity.sourceIp,
                userAgent: event.requestContext.identity.userAgent || '',
                outcome: 'FAILURE',
                reason: 'Insufficient permissions',
            });
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'FORBIDDEN',
                    message: 'Admin access required',
                }),
            };
        }
        // Get target user ID from path
        const targetUserId = event.pathParameters?.id;
        if (!targetUserId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'User ID is required',
                }),
            };
        }
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const newRole = body.role;
        // Validate role
        const validRoles = ['Standard_User', 'Professional_User', 'Admin_User'];
        if (!newRole || !validRoles.includes(newRole)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'Invalid role. Must be one of: Standard_User, Professional_User, Admin_User',
                }),
            };
        }
        // Prevent admin from removing their own admin role
        if (targetUserId === adminUserId && newRole !== 'Admin_User') {
            await (0, logger_1.logAuditEvent)({
                userId: adminUserId,
                action: 'UPDATE_USER_ROLE_DENIED',
                resourceType: 'USER',
                resourceId: targetUserId,
                ipAddress: event.requestContext.identity.sourceIp,
                userAgent: event.requestContext.identity.userAgent || '',
                outcome: 'FAILURE',
                reason: 'Cannot remove own admin role',
            });
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'INVALID_REQUEST',
                    message: 'Cannot remove your own admin role',
                }),
            };
        }
        // Get current user to verify existence
        try {
            await cognitoClient.send(new client_cognito_identity_provider_1.AdminGetUserCommand({
                UserPoolId: USER_POOL_ID,
                Username: targetUserId,
            }));
        }
        catch (error) {
            if (error.name === 'UserNotFoundException') {
                return {
                    statusCode: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    body: JSON.stringify({
                        error: 'NOT_FOUND',
                        message: 'User not found',
                    }),
                };
            }
            throw error;
        }
        // Update user role in Cognito
        await cognitoClient.send(new client_cognito_identity_provider_1.AdminUpdateUserAttributesCommand({
            UserPoolId: USER_POOL_ID,
            Username: targetUserId,
            UserAttributes: [
                {
                    Name: 'custom:role',
                    Value: newRole,
                },
            ],
        }));
        // Log audit event
        await (0, logger_1.logAuditEvent)({
            userId: adminUserId,
            action: 'UPDATE_USER_ROLE',
            resourceType: 'USER',
            resourceId: targetUserId,
            ipAddress: event.requestContext.identity.sourceIp,
            userAgent: event.requestContext.identity.userAgent || '',
            outcome: 'SUCCESS',
            details: {
                newRole,
            },
        });
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: 'User role updated successfully',
                userId: targetUserId,
                newRole,
            }),
        };
    }
    catch (error) {
        console.error('Error updating user role:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update user role',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=update-user-role.js.map