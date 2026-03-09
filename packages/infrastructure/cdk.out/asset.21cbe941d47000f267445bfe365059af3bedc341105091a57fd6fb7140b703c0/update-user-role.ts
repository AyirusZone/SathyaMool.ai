import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { logAuditEvent } from '../audit/logger';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

/**
 * Update user role (Admin only)
 * PUT /v1/admin/users/{id}/role
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user info from authorizer context
    const adminUserId = event.requestContext.authorizer?.principalId || 'unknown';
    const adminRole = event.requestContext.authorizer?.role || '';

    // Verify admin role
    if (adminRole !== 'Admin_User') {
      await logAuditEvent({
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
      await logAuditEvent({
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
      await cognitoClient.send(new AdminGetUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: targetUserId,
      }));
    } catch (error: any) {
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
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
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
    await logAuditEvent({
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
  } catch (error) {
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
