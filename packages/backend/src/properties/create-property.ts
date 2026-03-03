import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';

interface CreatePropertyRequest {
  address?: string;
  surveyNumber?: string;
  description?: string;
}

interface CreatePropertyResponse {
  propertyId: string;
  userId: string;
  address?: string;
  surveyNumber?: string;
  description?: string;
  status: string;
  trustScore: null;
  createdAt: string;
  message: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for property creation
 * Creates a new property verification record in DynamoDB
 * Associates property with authenticated user from JWT claims
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Create property request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.claims?.sub;
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    const body: CreatePropertyRequest = JSON.parse(event.body);

    // Validate input
    const validationError = validatePropertyInput(body);
    if (validationError) {
      return createErrorResponse(400, 'VALIDATION_ERROR', validationError);
    }

    // Generate unique propertyId
    const propertyId = uuidv4();
    const now = new Date().toISOString();

    // Create property record
    const propertyRecord = {
      propertyId: propertyId,
      userId: userId,
      address: body.address || null,
      surveyNumber: body.surveyNumber || null,
      description: body.description || null,
      status: 'pending',
      trustScore: null,
      documentCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store in DynamoDB
    const putCommand = new PutCommand({
      TableName: PROPERTIES_TABLE_NAME,
      Item: propertyRecord,
      ConditionExpression: 'attribute_not_exists(propertyId)',
    });

    await docClient.send(putCommand);

    console.log('Property record created:', propertyRecord);

    // Prepare response
    const response: CreatePropertyResponse = {
      propertyId: propertyId,
      userId: userId,
      address: body.address,
      surveyNumber: body.surveyNumber,
      description: body.description,
      status: 'pending',
      trustScore: null,
      createdAt: now,
      message: 'Property verification created successfully',
    };

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error('Create property error:', error);

    // Handle DynamoDB-specific errors
    if (error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(
        409,
        'PROPERTY_EXISTS',
        'A property with this ID already exists'
      );
    }

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while creating the property. Please try again.'
    );
  }
};

/**
 * Validate property input
 */
function validatePropertyInput(body: CreatePropertyRequest): string | null {
  // At least one of address or surveyNumber should be provided
  if (!body.address && !body.surveyNumber) {
    return 'Either address or survey number is required';
  }

  // Validate address length if provided
  if (body.address && body.address.length > 500) {
    return 'Address must not exceed 500 characters';
  }

  // Validate survey number format if provided
  if (body.surveyNumber && body.surveyNumber.length > 100) {
    return 'Survey number must not exceed 100 characters';
  }

  // Validate description length if provided
  if (body.description && body.description.length > 1000) {
    return 'Description must not exceed 1000 characters';
  }

  return null;
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
