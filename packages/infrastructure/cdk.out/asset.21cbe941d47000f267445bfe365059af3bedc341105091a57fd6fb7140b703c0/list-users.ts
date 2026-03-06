import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { logAuditEvent } from '../audit/logger';

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID || '';

/**
 * List all users in the system (Admin only)
 * GET /v1/admin/users
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    // Extract user info from authorizer context
    const userId = event.requestContext.authorizer?.principalId || 'unknown';
    const userRole = event.requestContext.authorizer?.role || '';

    // Verify admin role (should be enforced by authorizer, but double-check)
    if (userRole !== 'Admin_User') {
      await logAuditEvent({
        userId,
        action: 'LIST_USERS_DENIED',
        resourceType: 'USER',
        resourceId: 'all',
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

    // Parse query parameters
    const limit = event.queryStringParameters?.limit ? parseInt(event.queryStringParameters.limit) : 60;
    const paginationToken = event.queryStringParameters?.nextToken;

    // List users from Cognito
    const command = new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: Math.min(limit, 60), // Cognito max is 60
      PaginationToken: paginationToken,
    });

    const response = await cognitoClient.send(command);

    // Transform Cognito users to our format
    const users = response.Users?.map(user => {
      const attributes = user.Attributes?.reduce((acc, attr) => {
        if (attr.Name && attr.Value) {
          acc[attr.Name] = attr.Value;
        }
        return acc;
      }, {} as Record<string, string>) || {};

      return {
        userId: user.Username,
        email: attributes['email'],
        phoneNumber: attributes['phone_number'],
        role: attributes['custom:role'] || 'Standard_User',
        status: user.UserStatus,
        enabled: user.Enabled,
        createdAt: user.UserCreateDate?.toISOString(),
        lastModified: user.UserLastModifiedDate?.toISOString(),
      };
    }) || [];

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'LIST_USERS',
      resourceType: 'USER',
      resourceId: 'all',
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent || '',
      outcome: 'SUCCESS',
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        users,
        nextToken: response.PaginationToken,
        count: users.length,
      }),
    };
  } catch (error) {
    console.error('Error listing users:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to list users',
      }),
    };
  }
};
