import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, BatchWriteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { handler } from '../delete-property';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

describe('Delete Property Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
    process.env.LINEAGE_TABLE_NAME = 'SatyaMool-Lineage';
    process.env.TRUST_SCORES_TABLE_NAME = 'SatyaMool-TrustScores';
    process.env.AUDIT_LOGS_TABLE_NAME = 'SatyaMool-AuditLogs';
    process.env.DOCUMENT_BUCKET_NAME = 'satyamool-documents';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (
    propertyId: string,
    userId?: string,
    userRole?: string
  ): APIGatewayProxyEvent => {
    return {
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'DELETE',
      isBase64Encoded: false,
      path: `/v1/properties/${propertyId}`,
      pathParameters: { id: propertyId },
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        authorizer: userId ? {
          claims: {
            sub: userId,
            'cognito:username': 'testuser',
            'custom:role': userRole || 'Standard_User',
          },
        } : {},
        protocol: 'HTTP/1.1',
        httpMethod: 'DELETE',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'test-agent',
          userArn: null,
        },
        path: `/v1/properties/${propertyId}`,
        stage: 'test',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource',
        resourcePath: '/v1/properties/{id}',
      },
      resource: '/v1/properties/{id}',
    } as APIGatewayProxyEvent;
  };

  const mockProperty = {
    propertyId: 'prop-123',
    userId: 'user-123',
    address: '123 Main Street, Bangalore',
    surveyNumber: 'SY-123/456',
    status: 'completed',
    trustScore: 85,
    documentCount: 3,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockDocuments = [
    {
      documentId: 'doc-1',
      propertyId: 'prop-123',
      s3Key: 'properties/prop-123/doc-1.pdf',
      processingStatus: 'analysis_complete',
      uploadedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      documentId: 'doc-2',
      propertyId: 'prop-123',
      s3Key: 'properties/prop-123/doc-2.pdf',
      processingStatus: 'analysis_complete',
      uploadedAt: '2026-03-01T10:05:00.000Z',
    },
  ];

  describe('Successful property deletion', () => {
    it('should delete property and all associated data for owner', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock
        .on(ListObjectsV2Command)
        .resolves({
          Contents: [
            { Key: 'properties/prop-123/doc-1.pdf' },
            { Key: 'properties/prop-123/doc-2.pdf' },
          ],
        })
        .on(DeleteObjectsCommand)
        .resolves({});

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Property verification deleted successfully');
      expect(body.propertyId).toBe('prop-123');
      expect(body.deletedDocuments).toBe(2);
    });

    it('should delete property for admin user', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: [],
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const event = createMockEvent('prop-123', 'admin-456', 'Admin_User');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('should delete property with no documents', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: [],
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.deletedDocuments).toBe(0);
    });

    it('should delete documents from S3', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock
        .on(ListObjectsV2Command)
        .resolves({
          Contents: [
            { Key: 'properties/prop-123/doc-1.pdf' },
            { Key: 'properties/prop-123/doc-2.pdf' },
          ],
        })
        .on(DeleteObjectsCommand)
        .resolves({});

      const event = createMockEvent('prop-123', 'user-123');
      await handler(event);

      const s3Calls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(s3Calls.length).toBe(1);
      expect(s3Calls[0].args[0].input.Delete?.Objects).toHaveLength(2);
    });

    it('should delete document metadata from DynamoDB', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock
        .on(ListObjectsV2Command)
        .resolves({
          Contents: [
            { Key: 'properties/prop-123/doc-1.pdf' },
            { Key: 'properties/prop-123/doc-2.pdf' },
          ],
        })
        .on(DeleteObjectsCommand)
        .resolves({});

      const event = createMockEvent('prop-123', 'user-123');
      await handler(event);

      const batchWriteCalls = ddbMock.commandCalls(BatchWriteCommand);
      expect(batchWriteCalls.length).toBeGreaterThan(0);
    });

    it('should delete lineage and trust score data', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: [],
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });

      const event = createMockEvent('prop-123', 'user-123');
      await handler(event);

      const deleteCalls = ddbMock.commandCalls(DeleteCommand);
      expect(deleteCalls.length).toBe(3); // Lineage, TrustScore, Property
    });

    it('should log deletion event to AuditLogs', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        })
        .on(DeleteCommand)
        .resolves({})
        .on(BatchWriteCommand)
        .resolves({});

      s3Mock
        .on(ListObjectsV2Command)
        .resolves({
          Contents: [
            { Key: 'properties/prop-123/doc-1.pdf' },
          ],
        })
        .on(DeleteObjectsCommand)
        .resolves({});

      const event = createMockEvent('prop-123', 'user-123');
      await handler(event);

      // Verify audit log was created using PutCommand (new audit logging module)
      const putCalls = ddbMock.commandCalls(PutCommand);
      const auditLogCall = putCalls.find(
        call => call.args[0].input.TableName === 'AuditLogs'
      );
      expect(auditLogCall).toBeDefined();
    });
  });

  describe('Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent('prop-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user does not own property and is not admin', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        });

      const event = createMockEvent('prop-123', 'other-user-456');
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('FORBIDDEN');
    });
  });

  describe('Validation errors', () => {
    it('should return 400 if property ID is missing', async () => {
      const event = createMockEvent('', 'user-123');
      event.pathParameters = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('MISSING_PROPERTY_ID');
    });

    it('should return 404 if property does not exist', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [],
        });

      const event = createMockEvent('nonexistent-prop', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('PROPERTY_NOT_FOUND');
    });
  });

  describe('Error handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });

    it('should handle S3 errors gracefully', async () => {
      ddbMock
        .on(QueryCommand, {
          TableName: 'SatyaMool-Properties',
        })
        .resolves({
          Items: [mockProperty],
        })
        .on(QueryCommand, {
          TableName: 'SatyaMool-Documents',
        })
        .resolves({
          Items: mockDocuments,
        });

      s3Mock.on(ListObjectsV2Command).rejects(new Error('S3 error'));

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });
});
