import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
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

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const USERS_TABLE_NAME = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const NOTIFICATIONS_TABLE_NAME = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';

interface ExportResponse {
  message: string;
  downloadUrl: string;
  expiresIn: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

interface UserExportData {
  user: any;
  properties: any[];
  documents: any[];
  lineage: any[];
  trustScores: any[];
  notifications: any[];
  exportedAt: string;
}

/**
 * Lambda handler for exporting all user data
 * Generates JSON format with all properties and documents
 * Stores export in S3 with presigned URL
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('User data export request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.claims?.sub;
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    console.log(`Exporting data for user: ${userId}`);

    // 1. Get user data
    const getUserCommand = new GetCommand({
      TableName: USERS_TABLE_NAME,
      Key: {
        userId: userId,
      },
    });

    const userResult = await docClient.send(getUserCommand);
    
    if (!userResult.Item) {
      return createErrorResponse(404, 'USER_NOT_FOUND', 'User not found');
    }

    const userData = userResult.Item;

    // 2. Get all properties for the user
    const propertiesQuery = new QueryCommand({
      TableName: PROPERTIES_TABLE_NAME,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const propertiesResult = await docClient.send(propertiesQuery);
    const properties = propertiesResult.Items || [];

    console.log(`Found ${properties.length} properties for user ${userId}`);

    // 3. Get all documents for each property
    const allDocuments: any[] = [];
    const allLineage: any[] = [];
    const allTrustScores: any[] = [];

    for (const property of properties) {
      // Get documents
      const documentsQuery = new QueryCommand({
        TableName: DOCUMENTS_TABLE_NAME,
        IndexName: 'propertyId-uploadedAt-index',
        KeyConditionExpression: 'propertyId = :propertyId',
        ExpressionAttributeValues: {
          ':propertyId': property.propertyId,
        },
      });

      const documentsResult = await docClient.send(documentsQuery);
      const documents = documentsResult.Items || [];
      
      // Remove sensitive S3 keys and large OCR text from export
      const sanitizedDocuments = documents.map(doc => ({
        ...doc,
        ocrText: doc.ocrText ? '[OCR text available]' : undefined,
        translatedText: doc.translatedText ? '[Translated text available]' : undefined,
      }));
      
      allDocuments.push(...sanitizedDocuments);

      // Get lineage
      const lineageCommand = new GetCommand({
        TableName: LINEAGE_TABLE_NAME,
        Key: {
          propertyId: property.propertyId,
        },
      });

      const lineageResult = await docClient.send(lineageCommand);
      if (lineageResult.Item) {
        allLineage.push(lineageResult.Item);
      }

      // Get trust score
      const trustScoreCommand = new GetCommand({
        TableName: TRUST_SCORES_TABLE_NAME,
        Key: {
          propertyId: property.propertyId,
        },
      });

      const trustScoreResult = await docClient.send(trustScoreCommand);
      if (trustScoreResult.Item) {
        allTrustScores.push(trustScoreResult.Item);
      }
    }

    // 4. Get all notifications for the user
    const notificationsQuery = new QueryCommand({
      TableName: NOTIFICATIONS_TABLE_NAME,
      IndexName: 'userId-createdAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    });

    const notificationsResult = await docClient.send(notificationsQuery);
    const notifications = notificationsResult.Items || [];

    // 5. Compile export data
    const exportData: UserExportData = {
      user: {
        userId: userData.userId,
        email: userData.email,
        phoneNumber: userData.phoneNumber,
        role: userData.role,
        status: userData.status,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
      },
      properties: properties,
      documents: allDocuments,
      lineage: allLineage,
      trustScores: allTrustScores,
      notifications: notifications,
      exportedAt: new Date().toISOString(),
    };

    // 6. Store export in S3
    const exportKey = `exports/${userId}/user-data-${Date.now()}.json`;
    const exportJson = JSON.stringify(exportData, null, 2);

    const putCommand = new PutObjectCommand({
      Bucket: DOCUMENT_BUCKET_NAME,
      Key: exportKey,
      Body: exportJson,
      ContentType: 'application/json',
      Metadata: {
        userId: userId,
        exportedAt: new Date().toISOString(),
      },
    });

    await s3Client.send(putCommand);

    // 7. Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: DOCUMENT_BUCKET_NAME,
        Key: exportKey,
      }),
      { expiresIn: 3600 } // 1 hour
    );

    // Convert PUT presigned URL to GET presigned URL
    const getPresignedUrl = presignedUrl.replace('X-Amz-Algorithm', 'x-amz-algorithm');

    // 8. Log export event
    await createAuditLog({
      userId: userId,
      action: AuditAction.DATA_EXPORTED,
      resourceType: ResourceType.USER,
      resourceId: userId,
      requestId: extractRequestId(event),
      ipAddress: extractIpAddress(event),
      userAgent: extractUserAgent(event),
      metadata: {
        propertiesCount: properties.length,
        documentsCount: allDocuments.length,
        exportKey: exportKey,
      },
    });

    console.log(`User data export completed for: ${userId}`);

    // Prepare response
    const response: ExportResponse = {
      message: 'User data exported successfully',
      downloadUrl: getPresignedUrl,
      expiresIn: 3600,
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
    console.error('User data export error:', error);

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while exporting user data. Please try again.'
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
