import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../get-property';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Get Property Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
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
      httpMethod: 'GET',
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
        httpMethod: 'GET',
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
    description: 'Residential property',
    status: 'processing',
    trustScore: null,
    documentCount: 3,
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  };

  const mockDocuments = [
    {
      documentId: 'doc-1',
      propertyId: 'prop-123',
      processingStatus: 'analysis_complete',
      uploadedAt: '2026-03-01T10:00:00.000Z',
    },
    {
      documentId: 'doc-2',
      propertyId: 'prop-123',
      processingStatus: 'translation_complete',
      uploadedAt: '2026-03-01T10:05:00.000Z',
    },
    {
      documentId: 'doc-3',
      propertyId: 'prop-123',
      processingStatus: 'ocr_complete',
      uploadedAt: '2026-03-01T10:10:00.000Z',
    },
  ];

  describe('Successful property retrieval', () => {
    it('should retrieve property details for owner', async () => {
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

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBe('prop-123');
      expect(body.userId).toBe('user-123');
      expect(body.address).toBe('123 Main Street, Bangalore');
      expect(body.documentCount).toBe(3);
      expect(body.processingStatus).toBeDefined();
    });

    it('should retrieve property details for admin user', async () => {
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

      const event = createMockEvent('prop-123', 'admin-456', 'Admin_User');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.propertyId).toBe('prop-123');
    });

    it('should include processing status', async () => {
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

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.processingStatus).toEqual({
        ocr: 100,
        translation: 67,
        analysis: 33,
        lineage: false,
        scoring: false,
      });
    });

    it('should handle property with no documents', async () => {
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
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.documentCount).toBe(0);
      expect(body.processingStatus).toEqual({
        ocr: 0,
        translation: 0,
        analysis: 0,
        lineage: false,
        scoring: false,
      });
    });

    it('should show lineage and scoring ready when all docs analyzed', async () => {
      const allAnalyzedDocs = [
        {
          documentId: 'doc-1',
          propertyId: 'prop-123',
          processingStatus: 'analysis_complete',
          uploadedAt: '2026-03-01T10:00:00.000Z',
        },
        {
          documentId: 'doc-2',
          propertyId: 'prop-123',
          processingStatus: 'analysis_complete',
          uploadedAt: '2026-03-01T10:05:00.000Z',
        },
      ];

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
          Items: allAnalyzedDocs,
        });

      const event = createMockEvent('prop-123', 'user-123');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.processingStatus.lineage).toBe(true);
      expect(body.processingStatus.scoring).toBe(true);
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
      expect(body.message).toBe('You do not have permission to access this property');
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
  });
});
