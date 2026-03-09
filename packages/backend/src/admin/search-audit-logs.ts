/**
 * Lambda handler for searching and filtering audit logs
 * Admin-only endpoint with pagination support
 * 
 * Requirements: 17.8
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  createAuditLog,
  AuditAction,
  ResourceType,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
} from '../audit';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'AuditLogs';

interface SearchAuditLogsResponse {
  logs: any[];
  pagination: {
    nextToken?: string;
    hasMore: boolean;
    count: number;
  };
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for searching audit logs
 * Supports filtering by user, action, resource type, and date range
 * Implements pagination for large result sets
 * Requires Admin_User role
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Search audit logs request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId and role from authorizer context
    // The authorizer puts userId and role in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    const userRole = event.requestContext.authorizer?.role || event.requestContext.authorizer?.claims?.['custom:role'];

    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Check if user is admin
    if (userRole !== 'Admin_User') {
      return createErrorResponse(
        403,
        'FORBIDDEN',
        'Only administrators can access audit logs'
      );
    }

    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const filterUserId = queryParams.userId;
    const filterAction = queryParams.action;
    const filterResourceType = queryParams.resourceType;
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const limit = parseInt(queryParams.limit || '50', 10);
    const nextToken = queryParams.nextToken;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return createErrorResponse(
        400,
        'INVALID_LIMIT',
        'Limit must be between 1 and 100'
      );
    }

    // Build filter expression
    const filterExpressions: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    if (filterUserId) {
      filterExpressions.push('#userId = :userId');
      expressionAttributeNames['#userId'] = 'userId';
      expressionAttributeValues[':userId'] = filterUserId;
    }

    if (filterAction) {
      filterExpressions.push('#action = :action');
      expressionAttributeNames['#action'] = 'action';
      expressionAttributeValues[':action'] = filterAction;
    }

    if (filterResourceType) {
      filterExpressions.push('#resourceType = :resourceType');
      expressionAttributeNames['#resourceType'] = 'resourceType';
      expressionAttributeValues[':resourceType'] = filterResourceType;
    }

    if (startDate) {
      filterExpressions.push('#timestamp >= :startDate');
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':startDate'] = startDate;
    }

    if (endDate) {
      filterExpressions.push('#timestamp <= :endDate');
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':endDate'] = endDate;
    }

    // If userId filter is provided, use GSI query for better performance
    let result;
    if (filterUserId) {
      const queryCommand = new QueryCommand({
        TableName: AUDIT_LOGS_TABLE,
        IndexName: 'userId-timestamp-index',
        KeyConditionExpression: '#userId = :userId' + 
          (startDate && endDate ? ' AND #timestamp BETWEEN :startDate AND :endDate' : 
           startDate ? ' AND #timestamp >= :startDate' :
           endDate ? ' AND #timestamp <= :endDate' : ''),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        FilterExpression: filterExpressions.length > 1 ? 
          filterExpressions.slice(1).join(' AND ') : undefined,
        Limit: limit,
        ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
        ScanIndexForward: false, // Sort by timestamp descending (newest first)
      });

      result = await docClient.send(queryCommand);
    } else {
      // Use scan for other filters
      const scanCommand = new ScanCommand({
        TableName: AUDIT_LOGS_TABLE,
        FilterExpression: filterExpressions.length > 0 ? 
          filterExpressions.join(' AND ') : undefined,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? 
          expressionAttributeNames : undefined,
        ExpressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? 
          expressionAttributeValues : undefined,
        Limit: limit,
        ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
      });

      result = await docClient.send(scanCommand);
    }

    const logs = result.Items || [];

    // Sort by timestamp descending if using scan
    if (!filterUserId) {
      logs.sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
    }

    // Prepare pagination token
    const paginationNextToken = result.LastEvaluatedKey ?
      Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : undefined;

    // Log audit log access event
    await createAuditLog({
      userId: userId,
      action: AuditAction.AUDIT_LOGS_ACCESSED,
      resourceType: ResourceType.AUDIT_LOG,
      resourceId: 'search',
      requestId: extractRequestId(event),
      ipAddress: extractIpAddress(event),
      userAgent: extractUserAgent(event),
      metadata: {
        filters: {
          userId: filterUserId,
          action: filterAction,
          resourceType: filterResourceType,
          startDate: startDate,
          endDate: endDate,
        },
        resultCount: logs.length,
      },
    });

    // Prepare response
    const response: SearchAuditLogsResponse = {
      logs: logs,
      pagination: {
        nextToken: paginationNextToken,
        hasMore: !!result.LastEvaluatedKey,
        count: logs.length,
      },
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
  } catch (error: any) {
    console.error('Search audit logs error:', error);

    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while searching audit logs. Please try again.'
    );
  }
};

/**
 * Create error response
 */
function createErrorResponse(
  statusCode: number,
  errorCode: string,
  message: string
): APIGatewayProxyResult {
  const errorResponse: ErrorResponse = {
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
