/**
 * Government Portal Webhook Handler
 * 
 * Receives asynchronous responses from government portals for EC retrieval.
 * Validates requests, authenticates sources, and stores responses for processing.
 * 
 * Requirements: 19.5, 19.6, 19.7
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || 'SatyaMool-Documents';
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'SatyaMool-AuditLogs';
const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'SatyaMool-StatePortalConfigurations';

/**
 * Webhook request schema (expected from government portals)
 */
interface WebhookRequest {
  requestId: string; // Original request ID from EC retrieval
  state: string; // State portal identifier
  status: 'completed' | 'failed' | 'pending';
  timestamp: string;
  data?: {
    ecDocument?: string; // Base64 encoded EC document
    ecData?: any; // Structured EC data
    transactions?: Array<{
      date: string;
      parties: string[];
      documentType: string;
      registrationNumber: string;
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
  signature?: string; // HMAC signature for authentication
}

/**
 * Validate webhook signature for authentication
 * Requirements: 19.6
 */
function validateSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('Signature validation error:', error);
    return false;
  }
}

/**
 * Validate webhook request schema
 * Requirements: 19.6
 */
function validateWebhookRequest(request: any): request is WebhookRequest {
  if (!request || typeof request !== 'object') {
    return false;
  }

  // Check required fields
  if (!request.requestId || typeof request.requestId !== 'string') {
    return false;
  }

  if (!request.state || typeof request.state !== 'string') {
    return false;
  }

  if (!request.status || !['completed', 'failed', 'pending'].includes(request.status)) {
    return false;
  }

  if (!request.timestamp || typeof request.timestamp !== 'string') {
    return false;
  }

  // Validate timestamp is recent (within 5 minutes)
  const requestTime = new Date(request.timestamp).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (Math.abs(now - requestTime) > fiveMinutes) {
    console.warn('Webhook request timestamp is too old or in the future');
    return false;
  }

  return true;
}

/**
 * Get webhook secret for state portal
 */
async function getWebhookSecret(state: string): Promise<string | null> {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: STATE_CONFIG_TABLE,
      Key: { state }
    }));

    return result.Item?.webhookConfig?.authToken || null;
  } catch (error) {
    console.error(`Failed to get webhook secret for ${state}:`, error);
    return null;
  }
}

/**
 * Store webhook response for processing
 */
async function storeWebhookResponse(
  requestId: string,
  state: string,
  response: WebhookRequest
): Promise<void> {
  try {
    // Store in Documents table with special type
    await docClient.send(new PutCommand({
      TableName: DOCUMENTS_TABLE,
      Item: {
        documentId: `webhook-${requestId}`,
        propertyId: requestId.split('-')[2] || 'unknown', // Extract from requestId
        documentType: 'government_portal_response',
        uploadedAt: new Date().toISOString(),
        processingStatus: 'webhook_received',
        metadata: {
          state,
          originalRequestId: requestId,
          portalStatus: response.status,
          receivedAt: new Date().toISOString(),
          data: response.data,
          error: response.error
        }
      }
    }));

    console.log(`Stored webhook response for request ${requestId}`);
  } catch (error) {
    console.error('Failed to store webhook response:', error);
    throw error;
  }
}

/**
 * Log webhook attempt to audit logs
 */
async function logWebhookAttempt(
  requestId: string,
  state: string,
  status: string,
  authenticated: boolean
): Promise<void> {
  try {
    await docClient.send(new PutCommand({
      TableName: AUDIT_LOGS_TABLE,
      Item: {
        logId: `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        userId: 'system',
        action: 'gov_portal_webhook_received',
        resourceType: 'webhook',
        resourceId: requestId,
        metadata: {
          state,
          status,
          authenticated,
          ipAddress: 'unknown' // Will be populated from event
        }
      }
    }));
  } catch (error) {
    console.error('Failed to log webhook attempt:', error);
  }
}

/**
 * Lambda handler for government portal webhook
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('Webhook Request:', JSON.stringify(event, null, 2));

  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Missing request body',
          message: 'Request body is required'
        })
      };
    }

    const webhookRequest: WebhookRequest = JSON.parse(event.body);

    // Validate request schema (Requirement 19.6)
    if (!validateWebhookRequest(webhookRequest)) {
      await logWebhookAttempt(
        (webhookRequest as any).requestId || 'unknown',
        (webhookRequest as any).state || 'unknown',
        'validation_failed',
        false
      );

      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Invalid request',
          message: 'Webhook request validation failed'
        })
      };
    }

    // Get webhook secret for authentication
    const webhookSecret = await getWebhookSecret(webhookRequest.state);

    // Validate signature if provided (Requirement 19.6)
    let authenticated = false;
    if (webhookRequest.signature && webhookSecret) {
      authenticated = validateSignature(
        event.body,
        webhookRequest.signature,
        webhookSecret
      );

      if (!authenticated) {
        await logWebhookAttempt(
          webhookRequest.requestId,
          webhookRequest.state,
          'authentication_failed',
          false
        );

        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: 'Authentication failed',
            message: 'Invalid webhook signature'
          })
        };
      }
    } else if (webhookSecret) {
      // Secret exists but no signature provided
      await logWebhookAttempt(
        webhookRequest.requestId,
        webhookRequest.state,
        'missing_signature',
        false
      );

      return {
        statusCode: 401,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: 'Authentication required',
          message: 'Webhook signature is required'
        })
      };
    }

    // Store webhook response for processing (Requirement 19.5)
    await storeWebhookResponse(
      webhookRequest.requestId,
      webhookRequest.state,
      webhookRequest
    );

    // Log successful webhook receipt (Requirement 19.7)
    await logWebhookAttempt(
      webhookRequest.requestId,
      webhookRequest.state,
      'success',
      authenticated
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Webhook received successfully',
        requestId: webhookRequest.requestId
      })
    };

  } catch (error) {
    console.error('Error processing webhook:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to process webhook request'
      })
    };
  }
};
