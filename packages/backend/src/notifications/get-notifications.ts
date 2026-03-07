import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';

interface Notification {
  notificationId: string;
  userId: string;
  propertyId: string;
  type: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: string;
}

/**
 * Get notification history for authenticated user
 * GET /v1/notifications
 * Query parameters:
 * - limit: number of notifications to return (default: 50, max: 100)
 * - unreadOnly: filter for unread notifications only (default: false)
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Get notifications request:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    // The authorizer puts userId in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'User ID not found in request context',
        }),
      };
    }

    // Parse query parameters
    const limit = Math.min(
      parseInt(event.queryStringParameters?.limit || '50'),
      100
    );
    const unreadOnly = event.queryStringParameters?.unreadOnly === 'true';

    // Query notifications for user
    const command = new QueryCommand({
      TableName: NOTIFICATIONS_TABLE,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false, // Sort by createdAt descending (newest first)
      Limit: limit,
    });

    const response = await docClient.send(command);
    let notifications = (response.Items || []) as Notification[];

    // Filter for unread only if requested
    if (unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    // Count unread notifications
    const unreadCount = notifications.filter(n => !n.read).length;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        notifications,
        unreadCount,
        total: notifications.length,
      }),
    };
  } catch (error) {
    console.error('Error getting notifications:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to retrieve notifications',
      }),
    };
  }
};

/**
 * Mark notification as read
 * PUT /v1/notifications/{notificationId}/read
 */
export const markAsReadHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  console.log('Mark notification as read request:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    // The authorizer puts userId in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Unauthorized',
          message: 'User ID not found in request context',
        }),
      };
    }

    // Extract notificationId from path parameters
    const notificationId = event.pathParameters?.notificationId;
    if (!notificationId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'BadRequest',
          message: 'Notification ID is required',
        }),
      };
    }

    // Update notification read status
    const command = new UpdateCommand({
      TableName: NOTIFICATIONS_TABLE,
      Key: {
        notificationId,
        userId,
      },
      UpdateExpression: 'SET #read = :read, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#read': 'read',
      },
      ExpressionAttributeValues: {
        ':read': true,
        ':updatedAt': new Date().toISOString(),
      },
      ConditionExpression: 'userId = :userId', // Ensure user owns the notification
      ReturnValues: 'ALL_NEW',
    });

    const response = await docClient.send(command);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        notification: response.Attributes,
      }),
    };
  } catch (error: any) {
    console.error('Error marking notification as read:', error);

    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'NotFound',
          message: 'Notification not found or access denied',
        }),
      };
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'InternalServerError',
        message: 'Failed to update notification',
      }),
    };
  }
};
