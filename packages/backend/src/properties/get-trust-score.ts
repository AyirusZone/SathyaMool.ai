import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { trustScoreCache, documentCache } from '../utils/dynamodb-cache';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';

interface ScoreComponent {
  component: string;
  score: number;
  explanation: string;
  documentReferences?: string[];
}

interface TrustScoreResponse {
  propertyId: string;
  totalScore: number;
  calculatedAt: string;
  scoreBreakdown: {
    components: ScoreComponent[];
  };
  factors: string[];
  documentReferences: { [key: string]: any };
}

interface ErrorResponse {
  error: string;
  message: string;
}

/**
 * Lambda handler for getting Trust Score
 * Retrieves Trust Score and breakdown with explanations
 * Implements authorization check (user owns property or is admin)
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Get trust score request received:', JSON.stringify(event, null, 2));

  try {
    // Extract userId and role from authorizer context
    // The authorizer puts userId and role in the context, not in claims
    const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
    const userRole = event.requestContext.authorizer?.role || event.requestContext.authorizer?.claims?.['custom:role'];
    
    if (!userId) {
      return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
    }

    // Extract propertyId from path parameters
    const propertyId = event.pathParameters?.id;
    
    if (!propertyId) {
      return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
    }

    // Check property ownership
    const propertyQuery = new QueryCommand({
      TableName: PROPERTIES_TABLE_NAME,
      KeyConditionExpression: 'propertyId = :propertyId',
      ExpressionAttributeValues: {
        ':propertyId': propertyId,
      },
      Limit: 1,
    });

    const propertyResult = await docClient.send(propertyQuery);

    if (!propertyResult.Items || propertyResult.Items.length === 0) {
      return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
    }

    const property = propertyResult.Items[0];

    // Authorization check: user owns property or is admin
    const isOwner = property.userId === userId;
    const isAdmin = userRole === 'Admin_User';

    if (!isOwner && !isAdmin) {
      return createErrorResponse(
        403,
        'FORBIDDEN',
        'You do not have permission to access this property'
      );
    }

    // Get Trust Score data
    // Try cache first (trust scores are immutable after calculation)
    const trustScoreCacheKey = trustScoreCache.generateKey(TRUST_SCORES_TABLE_NAME, { propertyId });
    let trustScoreData = trustScoreCache.get(trustScoreCacheKey);

    if (!trustScoreData) {
      const trustScoreCommand = new GetCommand({
        TableName: TRUST_SCORES_TABLE_NAME,
        Key: {
          propertyId: propertyId,
        },
      });

      const trustScoreResult = await docClient.send(trustScoreCommand);

      if (!trustScoreResult.Item) {
        return createErrorResponse(
          404,
          'TRUST_SCORE_NOT_FOUND',
          'Trust Score not yet calculated. Please wait for processing to complete.'
        );
      }

      trustScoreData = trustScoreResult.Item;
      // Cache trust score with longer TTL (10 minutes) since it's immutable
      trustScoreCache.set(trustScoreCacheKey, trustScoreData, 600000);
    }

    // Get documents for references
    // Try cache first
    const documentsCacheKey = documentCache.generateKey(DOCUMENTS_TABLE_NAME, { propertyId });
    let documents = documentCache.get(documentsCacheKey);

    if (!documents) {
      const documentsQuery = new QueryCommand({
        TableName: DOCUMENTS_TABLE_NAME,
        IndexName: 'propertyId-uploadedAt-index',
        KeyConditionExpression: 'propertyId = :propertyId',
        ExpressionAttributeValues: {
          ':propertyId': propertyId,
        },
      });

      const documentsResult = await docClient.send(documentsQuery);
      documents = documentsResult.Items || [];
      // Cache documents with shorter TTL (3 minutes)
      documentCache.set(documentsCacheKey, documents, 180000);
    }

    // Create document lookup map
    const documentMap = new Map();
    documents.forEach((doc: any) => {
      documentMap.set(doc.documentId, {
        documentId: doc.documentId,
        documentType: doc.documentType,
        uploadedAt: doc.uploadedAt,
        s3Key: doc.s3Key,
        extractedData: doc.extractedData,
      });
    });

    // Format response with document references
    const response = formatTrustScoreResponse(trustScoreData, documentMap);

    console.log(`Retrieved Trust Score for property ${propertyId}: ${response.totalScore}`);

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
    console.error('Get trust score error:', error);

    return createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'An error occurred while retrieving Trust Score. Please try again.'
    );
  }
};

/**
 * Format Trust Score response with document references
 */
function formatTrustScoreResponse(
  trustScoreData: any,
  documentMap: Map<string, any>
): TrustScoreResponse {
  const scoreBreakdown = trustScoreData.scoreBreakdown || { components: [] };
  
  // Enhance components with document references
  const enhancedComponents = scoreBreakdown.components.map((component: ScoreComponent) => {
    const documentRefs: string[] = [];
    
    // Extract document IDs from component metadata if available
    if (component.documentReferences) {
      documentRefs.push(...component.documentReferences);
    }
    
    return {
      ...component,
      documentReferences: documentRefs,
    };
  });

  // Convert Map to plain object for JSON serialization
  const documentReferences: { [key: string]: any } = {};
  documentMap.forEach((value, key) => {
    documentReferences[key] = value;
  });

  return {
    propertyId: trustScoreData.propertyId,
    totalScore: trustScoreData.totalScore,
    calculatedAt: trustScoreData.calculatedAt,
    scoreBreakdown: {
      components: enhancedComponents,
    },
    factors: trustScoreData.factors || [],
    documentReferences,
  };
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
