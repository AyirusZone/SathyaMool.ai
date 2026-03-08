import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';

// Allowed file formats
const ALLOWED_FORMATS = ['pdf', 'jpeg', 'jpg', 'png', 'tiff', 'tif'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
];

// File size limit: 50MB in bytes
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Presigned URL expiration: 15 minutes in seconds
const PRESIGNED_URL_EXPIRATION = 15 * 60;

interface GenerateUploadUrlRequest {
  fileName: string;
  fileSize: number;
  contentType: string;
}

interface GenerateUploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  s3Key: string;
  expiresIn: number;
  metadata: {
    fileName: string;
    fileSize: number;
    contentType: string;
    s3Key: string;
  };
  message: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for generating S3 presigned URLs for document upload
 * Validates property exists, user has access, file format, and file size
 * Returns presigned URL with 15-minute expiration
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Generate upload URL request received:', JSON.stringify(event, null, 2));

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

    const body: GenerateUploadUrlRequest = JSON.parse(event.body);

    // Validate input
    const validationError = validateUploadRequest(body);
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
        'You do not have permission to upload documents to this property'
      );
    }

    // Generate unique document ID and S3 key
    const documentId = uuidv4();
    const fileExtension = getFileExtension(body.fileName);
    const s3Key = `properties/${propertyId}/documents/${documentId}.${fileExtension}`;

    // Create S3 PutObject command
    const putObjectCommand = new PutObjectCommand({
      Bucket: DOCUMENT_BUCKET_NAME,
      Key: s3Key,
      ContentType: body.contentType,
      ContentLength: body.fileSize,
      Metadata: {
        propertyId: propertyId,
        userId: userId,
        documentId: documentId,
        originalFileName: body.fileName,
      },
    });

    // Generate presigned URL
    const uploadUrl = await getSignedUrl(s3Client, putObjectCommand, {
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    console.log('Presigned URL generated:', {
      documentId,
      s3Key,
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    // Prepare response
    const response: GenerateUploadUrlResponse = {
      uploadUrl: uploadUrl,
      documentId: documentId,
      s3Key: s3Key,
      expiresIn: PRESIGNED_URL_EXPIRATION,
      metadata: {
        fileName: body.fileName,
        fileSize: body.fileSize,
        contentType: body.contentType,
        s3Key: s3Key,
      },
      message: 'Presigned URL generated successfully. Upload your document to the provided URL.',
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
    console.error('Generate upload URL error:', error);

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while generating the upload URL. Please try again.'
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
 * Validate upload request
 */
function validateUploadRequest(body: GenerateUploadUrlRequest): string | null {
  // Validate fileName
  if (!body.fileName || typeof body.fileName !== 'string') {
    return 'File name is required and must be a string';
  }

  if (body.fileName.length > 255) {
    return 'File name must not exceed 255 characters';
  }

  // Validate file format
  const fileExtension = getFileExtension(body.fileName);
  if (!ALLOWED_FORMATS.includes(fileExtension.toLowerCase())) {
    return `Invalid file format. Allowed formats: ${ALLOWED_FORMATS.join(', ').toUpperCase()}`;
  }

  // Validate fileSize
  if (body.fileSize === undefined || body.fileSize === null || typeof body.fileSize !== 'number') {
    return 'File size is required and must be a number';
  }

  if (body.fileSize <= 0) {
    return 'File size must be greater than 0';
  }

  if (body.fileSize > MAX_FILE_SIZE) {
    return `File size exceeds the maximum limit of 50MB. Your file size: ${(body.fileSize / (1024 * 1024)).toFixed(2)}MB`;
  }

  // Validate contentType
  if (!body.contentType || typeof body.contentType !== 'string') {
    return 'Content type is required and must be a string';
  }

  if (!ALLOWED_MIME_TYPES.includes(body.contentType.toLowerCase())) {
    return `Invalid content type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`;
  }

  return null;
}

/**
 * Extract file extension from filename
 */
function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
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
