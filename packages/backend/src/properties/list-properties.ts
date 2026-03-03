import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';

interface PropertySummary {
  propertyId: string;
  userId: string;
  address?: string;
  surveyNumber?: string;
  status: string;
  trustScore: number | null;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ListPropertiesResponse {
  properties: PropertySummary[];
  nextToken?: string;
  count: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for listing properties
 * Lists all properties for the authenticated user with filtering and pagination
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('List properties request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.claims?.sub;
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract query parameters
    const queryParams = event.queryStringParameters || {};
    const status = queryParams.status;
    const startDate = queryParams.startDate;
    const endDate = queryParams.endDate;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : 50;
    const nextToken = queryParams.nextToken;

    // Validate limit
    if (limit < 1 || limit > 100) {
      return createErrorResponse(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100');
    }

    // Validate date formats if provided
    if (startDate && !isValidISODate(startDate)) {
      return createErrorResponse(400, 'INVALID_DATE', 'startDate must be in ISO 8601 format');
    }
    if (endDate && !isValidISODate(endDate)) {
      return createErrorResponse(400, 'INVALID_DATE', 'endDate must be in ISO 8601 format');
    }

    // Query properties using GSI userId-createdAt-index
    const queryCommand = new QueryCommand({
      TableName: PROPERTIES_TABLE_NAME,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: limit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
      ScanIndexForward: false, // Sort by createdAt descending (newest first)
    });

    const result = await docClient.send(queryCommand);

    // Filter results based on query parameters
    let properties = (result.Items || []) as PropertySummary[];

    // Apply status filter
    if (status) {
      properties = properties.filter(p => p.status === status);
    }

    // Apply date range filter
    if (startDate) {
      properties = properties.filter(p => p.createdAt >= startDate);
    }
    if (endDate) {
      properties = properties.filter(p => p.createdAt <= endDate);
    }

    // Prepare response
    const response: ListPropertiesResponse = {
      properties: properties,
      count: properties.length,
    };

    // Add nextToken if there are more results
    if (result.LastEvaluatedKey) {
      response.nextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }

    console.log(`Retrieved ${properties.length} properties for user ${userId}`);

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
    console.error('List properties error:', error);

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while retrieving properties. Please try again.'
    );
  }
};

/**
 * Validate ISO 8601 date format
 */
function isValidISODate(dateString: string): boolean {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
  if (!isoDateRegex.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

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
