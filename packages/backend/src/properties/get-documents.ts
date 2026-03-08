import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';

interface Document {
  documentId: string;
  propertyId: string;
  userId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  s3Key: string;
  documentType: string;
  processingStatus: string;
  uploadedAt: string;
  updatedAt: string;
  ocrText?: string;
  translatedText?: string;
  extractedData?: any;
  ocrConfidence?: number;
}

interface GetDocumentsResponse {
  documents: Document[];
  count: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for retrieving documents for a property
 * Returns all documents associated with the property, ordered by upload date
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get documents request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract propertyId from path parameters
    const propertyId = event.pathParameters?.propertyId;
    
    if (!propertyId) {
      return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
    }

    // Query documents by propertyId using GSI
    const queryCommand = new QueryCommand({
      TableName: DOCUMENTS_TABLE_NAME,
      IndexName: 'propertyId-uploadedAt-index',
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
      ScanIndexForward: false, // Sort by uploadedAt descending (newest first)
    });

    const result = await docClient.send(queryCommand);
    const documents = result.Items as Document[] || [];

    console.log(`Found ${documents.length} documents for property ${propertyId}`);

    const response: GetDocumentsResponse = {
      documents: documents,
      count: documents.length,
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
    console.error('Get documents error:', error);

    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while retrieving documents. Please try again.'
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
