import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminDisableUserCommand, AdminGetUserCommand, AdminUserGlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { logAuditEvent } from '../audit/logger';

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const USER_POOL_ID = process.env.USER_POOL_ID || '';
const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || '';

/**
 * Deactivate user account (Admin only)
 * PUT /v1/admin/users/{id}/deactivate
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
        action: 'DEACTIVATE_USER_DENIED',
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

    // Prevent admin from deactivating their own account
    if (targetUserId === adminUserId) {
      await logAuditEvent({
        userId: adminUserId,
        action: 'DEACTIVATE_USER_DENIED',
        resourceType: 'USER',
        resourceId: targetUserId,
        ipAddress: event.requestContext.identity.sourceIp,
        userAgent: event.requestContext.identity.userAgent || '',
        outcome: 'FAILURE',
        reason: 'Cannot deactivate own account',
      });

      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'INVALID_REQUEST',
          message: 'Cannot deactivate your own account',
        }),
      };
    }

    // Verify user exists
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

    // Revoke all active sessions
    await cognitoClient.send(new AdminUserGlobalSignOutCommand({
      UserPoolId: USER_POOL_ID,
      Username: targetUserId,
    }));

    // Disable user account in Cognito
    await cognitoClient.send(new AdminDisableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: targetUserId,
    }));

    // Update user status in DynamoDB
    const deactivationDate = new Date().toISOString();
    await dynamoClient.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId: targetUserId },
      UpdateExpression: 'SET #status = :status, deactivatedAt = :deactivatedAt, scheduledDeletionAt = :scheduledDeletionAt',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'DEACTIVATED',
        ':deactivatedAt': deactivationDate,
        ':scheduledDeletionAt': new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      },
    }));

    // Log audit event
    await logAuditEvent({
      userId: adminUserId,
      action: 'DEACTIVATE_USER',
      resourceType: 'USER',
      resourceId: targetUserId,
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent || '',
      outcome: 'SUCCESS',
      details: {
        deactivatedAt: deactivationDate,
      },
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'User account deactivated successfully',
        userId: targetUserId,
        deactivatedAt: deactivationDate,
        scheduledDeletionAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    };
  } catch (error) {
    console.error('Error deactivating user:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to deactivate user',
      }),
    };
  }
};
