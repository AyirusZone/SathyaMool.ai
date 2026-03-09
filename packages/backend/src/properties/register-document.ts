import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import {
  createAuditLog,
  AuditAction,
  ResourceType,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
} from '../audit';
import {
  executeIdempotent,
  generateIdempotencyKey,
  conditionalPut,
} from '../utils/idempotency';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';

interface RegisterDocumentRequest {
  documentId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  s3Key: string;
  documentType?: string;
}

interface RegisterDocumentResponse {
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
  message: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for registering uploaded documents with idempotency
 * Validates property exists, user has access, document was uploaded to S3
 * Stores document metadata in DynamoDB with initial status "pending"
 * Uses idempotency to prevent duplicate document registration
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Register document request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    // The authorizer puts userId in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;

    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract propertyId from path parameters
    const propertyId = event.pathParameters?.propertyId;

    if (!propertyId) {
      return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
    }

    // Parse request body
    if (!event.body) {
      return createErrorResponse(400, 'MISSING_BODY', 'Request body is required');
    }

    const body: RegisterDocumentRequest = JSON.parse(event.body);

    // Validate input
    const validationError = validateRegisterRequest(body);
    if (validationError) {
      return createErrorResponse(400, 'VALIDATION_ERROR', validationError);
    }

    // Verify property exists and user has access
    const property = await getProperty(propertyId);

    if (!property) {
      return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }

    // Check if user owns the property or is an admin
    const userRole = event.requestContext.authorizer?.claims?.['custom:role'];
    if (property.userId !== userId && userRole !== 'Admin_User') {
      return createErrorResponse(
        403,
        'FORBIDDEN',
        'You do not have permission to register documents for this property'
      );
    }

    // Verify document was successfully uploaded to S3
    const documentExists = await verifyS3Document(body.s3Key);

    if (!documentExists) {
      return createErrorResponse(
        404,
        'DOCUMENT_NOT_FOUND',
        'Document not found in S3. Please upload the document first using the presigned URL.'
      );
    }

    // Generate idempotency key from document ID and property ID
    // This ensures duplicate registrations of the same document are handled gracefully
    const idempotencyKey = `document:register:${body.documentId}:${propertyId}`;

    console.log(`Registering document with idempotency key: ${idempotencyKey}`);

    // Execute idempotent document registration
    const result = await executeIdempotent(
      async () => {
        const now = new Date().toISOString();
        const documentRecord = {
          documentId: body.documentId,
          propertyId: propertyId,
          userId: userId,
          fileName: body.fileName,
          fileSize: body.fileSize,
          contentType: body.contentType,
          s3Key: body.s3Key,
          documentType: body.documentType || 'unknown',
          processingStatus: 'pending',
          uploadedAt: now,
          updatedAt: now,
          ocrText: null,
          translatedText: null,
          extractedData: null,
        };

        // Store in DynamoDB with conditional write to prevent duplicates
        const success = await conditionalPut({
          TableName: DOCUMENTS_TABLE_NAME,
          Item: documentRecord,
          ConditionExpression: 'attribute_not_exists(documentId) AND attribute_not_exists(propertyId)',
        });

        if (!success) {
          // Document already registered, fetch and return it
          console.log(`Document ${body.documentId} already registered, fetching existing record`);
          const getCommand = new GetCommand({
            TableName: DOCUMENTS_TABLE_NAME,
            Key: {
              documentId: body.documentId,
              propertyId: propertyId,
            },
          });
          const existingResult = await docClient.send(getCommand);
          return existingResult.Item;
        }

        console.log('Document registered:', {
          documentId: body.documentId,
          propertyId: propertyId,
          userId: userId,
          s3Key: body.s3Key,
        });

        // Log document upload event
        await createAuditLog({
          userId: userId,
          action: AuditAction.DOCUMENT_UPLOADED,
          resourceType: ResourceType.DOCUMENT,
          resourceId: body.documentId,
          requestId: extractRequestId(event),
          ipAddress: extractIpAddress(event),
          userAgent: extractUserAgent(event),
          metadata: {
            propertyId: propertyId,
            fileName: body.fileName,
            fileSize: body.fileSize,
            documentType: body.documentType || 'unknown',
          },
        });

        return documentRecord;
      },
      { documentId: body.documentId, propertyId },
      { idempotencyKey }
    );

    // Prepare response
    if (!result) {
      throw new Error('Failed to register document');
    }

    const response: RegisterDocumentResponse = {
      documentId: result.documentId,
      propertyId: result.propertyId,
      userId: result.userId,
      fileName: result.fileName,
      fileSize: result.fileSize,
      contentType: result.contentType,
      s3Key: result.s3Key,
      documentType: result.documentType,
      processingStatus: result.processingStatus,
      uploadedAt: result.uploadedAt,
      message: 'Document registered successfully. Processing will begin shortly.',
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
    console.error('Register document error:', error);

    // Handle idempotency errors
    if (error.message === 'Operation already in progress') {
      return createErrorResponse(
        409,
        'OPERATION_IN_PROGRESS',
        'Document registration is already in progress. Please wait.'
      );
    }

    // Handle DynamoDB-specific errors
    if (error.name === 'ConditionalCheckFailedException') {
      return createErrorResponse(
        409,
        'DOCUMENT_EXISTS',
        'A document with this ID is already registered'
      );
    }

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while registering the document. Please try again.'
    );
  }
};

/**
 * Get property from DynamoDB
 */
async function getProperty(propertyId: string): Promise<any | null> {
  const getCommand = new GetCommand({
    TableName: PROPERTIES_TABLE_NAME,
    Key: { propertyId },
  });

  const result = await docClient.send(getCommand);
  return result.Item || null;
}

/**
 * Verify document exists in S3
 */
async function verifyS3Document(s3Key: string): Promise<boolean> {
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: DOCUMENT_BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(headCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Re-throw other errors
    throw error;
  }
}

/**
 * Validate register document request
 */
function validateRegisterRequest(body: RegisterDocumentRequest): string | null {
  // Validate documentId
  if (!body.documentId || typeof body.documentId !== 'string') {
    return 'Document ID is required and must be a string';
  }

  // Validate fileName
  if (!body.fileName || typeof body.fileName !== 'string') {
    return 'File name is required and must be a string';
  }

  if (body.fileName.length > 255) {
    return 'File name must not exceed 255 characters';
  }

  // Validate fileSize
  if (body.fileSize === undefined || body.fileSize === null || typeof body.fileSize !== 'number') {
    return 'File size is required and must be a number';
  }

  if (body.fileSize <= 0) {
    return 'File size must be greater than 0';
  }

  // Validate contentType
  if (!body.contentType || typeof body.contentType !== 'string') {
    return 'Content type is required and must be a string';
  }

  // Validate s3Key
  if (!body.s3Key || typeof body.s3Key !== 'string') {
    return 'S3 key is required and must be a string';
  }

  // Validate documentType if provided
  if (body.documentType && typeof body.documentType !== 'string') {
    return 'Document type must be a string';
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
