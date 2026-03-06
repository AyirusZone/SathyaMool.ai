/**
 * Government Portal EC Retrieval Lambda
 * 
 * Placeholder API for future integration with state government portals
 * to automatically retrieve Encumbrance Certificates.
 * 
 * Requirements: 19.1, 19.4, 19.7
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { determineECRetrievalStrategy, getManualUploadInstructions } from './ec-retrieval-fallback';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'StatePortalConfigurations';
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'AuditLogs';

/**
 * Request format for EC retrieval
 */
interface ECRetrievalRequest {
  propertyId: string;
  state: string;
  surveyNumber: string;
  district?: string;
  taluk?: string;
  village?: string;
}

/**
 * Response format for EC retrieval
 */
interface ECRetrievalResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'unavailable';
  message: string;
  webhookUrl?: string;
  estimatedCompletionTime?: string;
}

/**
 * Log integration attempt to audit logs
 */
async function logIntegrationAttempt(
  requestId: string,
  propertyId: string,
  state: string,
  status: string,
  userId?: string
): Promise<void> {
  try {
    await docClient.send(new PutCommand({
      TableName: AUDIT_LOGS_TABLE,
      Item: {
        logId: requestId,
        timestamp: new Date().toISOString(),
        userId: userId || 'system',
        action: 'gov_portal_ec_retrieval',
        resourceType: 'property',
        resourceId: propertyId,
        metadata: {
          state,
          status,
          integrationAvailable: false
        }
      }
    }));
  } catch (error) {
    console.error('Failed to log integration attempt:', error);
  }
}

/**
 * Check if state portal integration is available
 */
async function checkStatePortalAvailability(state: string): Promise<boolean> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: STATE_CONFIG_TABLE,
      Key: { state }
    }));

    return result.Item?.enabled === true && result.Item?.status === 'active';
  } catch (error) {
    console.error('Failed to check state portal availability:', error);
    return false;
  }
}

/**
 * Lambda handler for EC retrieval from government portals
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('EC Retrieval Request:', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Missing request body',
          message: 'Request body is required'
        })
      };
    }

    const request: ECRetrievalRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.propertyId || !request.state || !request.surveyNumber) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Invalid request',
          message: 'propertyId, state, and surveyNumber are required'
        })
      };
    }

    // Generate request ID
    const requestId = `ec-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Extract user ID from authorizer context
    const userId = event.requestContext?.authorizer?.claims?.sub;

    // Determine EC retrieval strategy (Requirement 19.3)
    const retrievalStrategy = await determineECRetrievalStrategy(request.state);

    // Log integration attempt (Requirement 19.7)
    await logIntegrationAttempt(
      requestId,
      request.propertyId,
      request.state,
      retrievalStrategy.available ? 'initiated' : 'unavailable',
      userId
    );

    // Build response based on strategy
    const response: ECRetrievalResponse = {
      requestId,
      status: retrievalStrategy.available ? 'pending' : 'unavailable',
      message: retrievalStrategy.message,
      webhookUrl: `${process.env.API_GATEWAY_URL}/v1/integration/webhook/${requestId}`
    };

    // Add manual upload instructions if fallback is needed
    if (retrievalStrategy.strategy === 'manual') {
      (response as any).manualUploadInstructions = getManualUploadInstructions(request.state);
      (response as any).fallbackReason = retrievalStrategy.fallbackReason;
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error processing EC retrieval request:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to process EC retrieval request'
      })
    };
  }
};
