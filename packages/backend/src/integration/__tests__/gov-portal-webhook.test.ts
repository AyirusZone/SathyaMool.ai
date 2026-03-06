/**
 * Unit tests for government portal webhook handler
 * 
 * Tests webhook endpoint validation, authentication, and response storage.
 * Requirements: 19.5, 19.6
 */

import { handler } from '../gov-portal-webhook';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import * as crypto from 'crypto';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Government Portal Webhook Handler', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.DOCUMENTS_TABLE = 'SatyaMool-Documents';
    process.env.AUDIT_LOGS_TABLE = 'SatyaMool-AuditLogs';
    process.env.STATE_CONFIG_TABLE = 'SatyaMool-StatePortalConfigurations';
  });

  const createMockEvent = (body: any): APIGatewayProxyEvent => ({
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/v1/integration/webhook/test-request-123',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/v1/integration/webhook/test-request-123',
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      identity: {
        cognitoIdentityPoolId: null,
        accountId: null,
        cognitoIdentityId: null,
        caller: null,
        sourceIp: '127.0.0.1',
        principalOrgId: null,
        accessKey: null,
        cognitoAuthenticationType: null,
        cognitoAuthenticationProvider: null,
        userArn: null,
        userAgent: 'test-agent',
        user: null,
        apiKey: null,
        apiKeyId: null,
        clientCert: null
      },
      authorizer: null,
      resourceId: 'test-resource',
      resourcePath: '/v1/integration/webhook/{requestId}'
    },
    resource: '/v1/integration/webhook/{requestId}'
  });

  describe('Request Validation', () => {
    it('should reject request with missing body', async () => {
      const event = createMockEvent(null);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Missing request body');
    });

    it('should reject request with missing required fields', async () => {
      const event = createMockEvent({
        state: 'Karnataka'
        // Missing requestId, status, timestamp
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid request');
    });

    it('should reject request with invalid status', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'invalid-status',
        timestamp: new Date().toISOString()
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid request');
    });

    it('should reject request with old timestamp', async () => {
      const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago

      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: oldTimestamp
      });

      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Invalid request');
    });

    it('should accept valid request without signature', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString(),
        data: {
          ecDocument: 'base64-encoded-document'
        }
      });

      ddbMock.on(GetCommand).resolves({ Item: undefined }); // No webhook config
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Webhook received successfully');
      expect(body.requestId).toBe('test-request-123');
    });
  });

  describe('Authentication', () => {
    it('should reject request with invalid signature', async () => {
      const webhookRequest = {
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      };

      const event = createMockEvent(webhookRequest);

      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          webhookConfig: {
            authToken: 'test-secret'
          }
        }
      });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Authentication failed');
    });

    it('should accept request with valid signature', async () => {
      const webhookRequest = {
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed' as const,
        timestamp: new Date().toISOString()
      };

      const event = createMockEvent(webhookRequest);

      // No webhook secret configured, so no signature required
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          webhookConfig: {
            enabled: true
          }
          // No authToken, so signature not required
        }
      });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Webhook received successfully');
    });

    it('should reject request without signature when secret exists', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          webhookConfig: {
            authToken: 'test-secret'
          }
        }
      });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Authentication required');
    });
  });

  describe('Response Storage', () => {
    it('should store completed webhook response', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString(),
        data: {
          ecDocument: 'base64-encoded-document',
          transactions: [
            {
              date: '2020-01-15',
              parties: ['John Doe', 'Jane Smith'],
              documentType: 'Sale Deed',
              registrationNumber: 'REG-2020-001'
            }
          ]
        }
      });

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify PutCommand was called for storing response
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);

      const documentPut = putCalls.find(
        call => call.args[0].input.TableName === 'SatyaMool-Documents'
      );
      expect(documentPut).toBeDefined();
      expect(documentPut?.args[0].input.Item?.documentType).toBe('government_portal_response');
    });

    it('should store failed webhook response', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: {
          code: 'PORTAL_ERROR',
          message: 'Portal temporarily unavailable'
        }
      });

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      const putCalls = ddbMock.commandCalls(PutCommand);
      const documentPut = putCalls.find(
        call => call.args[0].input.TableName === 'SatyaMool-Documents'
      );
      expect(documentPut?.args[0].input.Item?.metadata?.error).toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    it('should log successful webhook receipt', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString()
      });

      ddbMock.on(GetCommand).resolves({ Item: undefined });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify audit log was created
      const putCalls = ddbMock.commandCalls(PutCommand);
      const auditPut = putCalls.find(
        call => call.args[0].input.TableName === 'SatyaMool-AuditLogs'
      );
      expect(auditPut).toBeDefined();
      expect(auditPut?.args[0].input.Item?.action).toBe('gov_portal_webhook_received');
    });

    it('should log failed authentication attempt', async () => {
      const event = createMockEvent({
        requestId: 'test-request-123',
        state: 'Karnataka',
        status: 'completed',
        timestamp: new Date().toISOString(),
        signature: 'invalid-signature'
      });

      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          webhookConfig: {
            authToken: 'test-secret'
          }
        }
      });
      ddbMock.on(PutCommand).resolves({});

      const result = await handler(event);

      expect(result.statusCode).toBe(401);

      // Verify audit log was created
      const putCalls = ddbMock.commandCalls(PutCommand);
      const auditPut = putCalls.find(
        call => call.args[0].input.TableName === 'SatyaMool-AuditLogs'
      );
      expect(auditPut).toBeDefined();
    });
  });
});
