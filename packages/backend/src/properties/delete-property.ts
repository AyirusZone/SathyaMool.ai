import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const AUDIT_LOGS_TABLE_NAME = process.env.AUDIT_LOGS_TABLE_NAME || 'SatyaMool-AuditLogs';
const DOCUMENT_BUCKET_NAME = process.env.DOCUMENT_BUCKET_NAME || 'satyamool-documents';

interface DeletePropertyResponse {
  message: string;
  propertyId: string;
  deletedDocuments: number;
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for deleting property
 * Marks documents for deletion in S3 (lifecycle policy handles actual deletion)
 * Removes metadata from DynamoDB tables
 * Logs deletion event to AuditLogs
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Delete property request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from authorizer context
    const userId = event.requestContext.authorizer?.claims?.sub;
    const userRole = event.requestContext.authorizer?.claims?.['custom:role'];
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract propertyId from path parameters
    const propertyId = event.pathParameters?.id;
    
    if (!propertyId) {
      return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
    }

    // Query property to verify ownership
    const queryCommand = new QueryCommand({
      TableName: PROPERTIES_TABLE_NAME,
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
      Limit: 1,
    });

    const result = await docClient.send(queryCommand);

    if (!result.Items || result.Items.length === 0) {
      return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }

    const property = result.Items[0];

    // Authorization check: user owns property or is admin
    const isOwner = property.userId === userId;
    const isAdmin = userRole === 'Admin_User';

    if (!isOwner && !isAdmin) {
      return createErrorResponse(
        403,
        'FORBIDDEN',
        'You do not have permission to delete this property'
      );
    }

    // Get all documents for this property
    const documentsQuery = new QueryCommand({
      TableName: DOCUMENTS_TABLE_NAME,
      IndexName: 'propertyId-uploadedAt-index',
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
    });

    const documentsResult = await docClient.send(documentsQuery);
    const documents = documentsResult.Items || [];

    // Delete documents from S3
    if (documents.length > 0) {
      const s3Keys = documents
        .filter(doc => doc.s3Key)
        .map(doc => ({ Key: doc.s3Key }));

      if (s3Keys.length > 0) {
        // List objects to verify they exist
        const listCommand = new ListObjectsV2Command({
          Bucket: DOCUMENT_BUCKET_NAME,
          Prefix: `properties/${propertyId}/`,
        });

        const listResult = await s3Client.send(listCommand);
        
        if (listResult.Contents && listResult.Contents.length > 0) {
          const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key! }));
          
          // Delete objects in batches of 1000 (S3 limit)
          for (let i = 0; i < objectsToDelete.length; i += 1000) {
            const batch = objectsToDelete.slice(i, i + 1000);
            const deleteCommand = new DeleteObjectsCommand({
              Bucket: DOCUMENT_BUCKET_NAME,
              Delete: {
                Objects: batch,
                Quiet: true,
              },
            });
            await s3Client.send(deleteCommand);
          }
        }
      }

      // Delete document metadata from DynamoDB
      const deleteRequests = documents.map(doc => ({
        DeleteRequest: {
          Key: {
            documentId: doc.documentId,
            propertyId: doc.propertyId,
          },
        },
      }));

      // Batch delete in chunks of 25 (DynamoDB limit)
      for (let i = 0; i < deleteRequests.length; i += 25) {
        const batch = deleteRequests.slice(i, i + 25);
        const batchWriteCommand = new BatchWriteCommand({
          RequestItems: {
            [DOCUMENTS_TABLE_NAME]: batch,
          },
        });
        await docClient.send(batchWriteCommand);
      }
    }

    // Delete lineage data
    const deleteLineageCommand = new DeleteCommand({
      TableName: LINEAGE_TABLE_NAME,
      Key: {
        propertyId: propertyId,
      },
    });
    await docClient.send(deleteLineageCommand);

    // Delete trust score data
    const deleteTrustScoreCommand = new DeleteCommand({
      TableName: TRUST_SCORES_TABLE_NAME,
      Key: {
        propertyId: propertyId,
      },
    });
    await docClient.send(deleteTrustScoreCommand);

    // Delete property record
    const deletePropertyCommand = new DeleteCommand({
      TableName: PROPERTIES_TABLE_NAME,
      Key: {
        propertyId: propertyId,
        userId: property.userId,
      },
    });
    await docClient.send(deletePropertyCommand);

    // Log deletion event to AuditLogs
    const logId = uuidv4();
    const timestamp = new Date().toISOString();
    const auditLog = {
      logId: logId,
      timestamp: timestamp,
      userId: userId,
      action: 'DELETE_PROPERTY',
      resourceType: 'Property',
      resourceId: propertyId,
      ipAddress: event.requestContext.identity.sourceIp,
      userAgent: event.requestContext.identity.userAgent || 'unknown',
      requestId: event.requestContext.requestId,
      details: {
        propertyAddress: property.address,
        surveNumber: property.surveyNumber,
        documentsDeleted: documents.length,
      },
    };

    const putAuditLogCommand = new BatchWriteCommand({
      RequestItems: {
        [AUDIT_LOGS_TABLE_NAME]: [
          {
            PutRequest: {
              Item: auditLog,
            },
          },
        ],
      },
    });
    await docClient.send(putAuditLogCommand);

    console.log(`Property ${propertyId} deleted by user ${userId}`);

    // Prepare response
    const response: DeletePropertyResponse = {
      message: 'Property verification deleted successfully',
      propertyId: propertyId,
      deletedDocuments: documents.length,
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
    console.error('Delete property error:', error);

    // Generic error response
    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while deleting the property. Please try again.'
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
