"use strict";
/**
 * Government Portal Webhook Handler
 *
 * Receives asynchronous responses from government portals for EC retrieval.
 * Validates requests, authenticates sources, and stores responses for processing.
 *
 * Requirements: 19.5, 19.6, 19.7
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const crypto = __importStar(require("crypto"));
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const DOCUMENTS_TABLE = process.env.DOCUMENTS_TABLE || 'SatyaMool-Documents';
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'SatyaMool-AuditLogs';
const STATE_CONFIG_TABLE = process.env.STATE_CONFIG_TABLE || 'SatyaMool-StatePortalConfigurations';
/**
 * Validate webhook signature for authentication
 * Requirements: 19.6
 */
function validateSignature(payload, signature, secret) {
    try {
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }
    catch (error) {
        console.error('Signature validation error:', error);
        return false;
    }
}
/**
 * Validate webhook request schema
 * Requirements: 19.6
 */
function validateWebhookRequest(request) {
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
async function getWebhookSecret(state) {
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: STATE_CONFIG_TABLE,
            Key: { state }
        }));
        return result.Item?.webhookConfig?.authToken || null;
    }
    catch (error) {
        console.error(`Failed to get webhook secret for ${state}:`, error);
        return null;
    }
}
/**
 * Store webhook response for processing
 */
async function storeWebhookResponse(requestId, state, response) {
    try {
        // Store in Documents table with special type
        await docClient.send(new lib_dynamodb_1.PutCommand({
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
    }
    catch (error) {
        console.error('Failed to store webhook response:', error);
        throw error;
    }
}
/**
 * Log webhook attempt to audit logs
 */
async function logWebhookAttempt(requestId, state, status, authenticated) {
    try {
        await docClient.send(new lib_dynamodb_1.PutCommand({
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
    }
    catch (error) {
        console.error('Failed to log webhook attempt:', error);
    }
}
/**
 * Lambda handler for government portal webhook
 */
const handler = async (event) => {
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
        const webhookRequest = JSON.parse(event.body);
        // Validate request schema (Requirement 19.6)
        if (!validateWebhookRequest(webhookRequest)) {
            await logWebhookAttempt(webhookRequest.requestId || 'unknown', webhookRequest.state || 'unknown', 'validation_failed', false);
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
            authenticated = validateSignature(event.body, webhookRequest.signature, webhookSecret);
            if (!authenticated) {
                await logWebhookAttempt(webhookRequest.requestId, webhookRequest.state, 'authentication_failed', false);
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
        }
        else if (webhookSecret) {
            // Secret exists but no signature provided
            await logWebhookAttempt(webhookRequest.requestId, webhookRequest.state, 'missing_signature', false);
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
        await storeWebhookResponse(webhookRequest.requestId, webhookRequest.state, webhookRequest);
        // Log successful webhook receipt (Requirement 19.7)
        await logWebhookAttempt(webhookRequest.requestId, webhookRequest.state, 'success', authenticated);
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
    }
    catch (error) {
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
exports.handler = handler;
//# sourceMappingURL=gov-portal-webhook.js.map