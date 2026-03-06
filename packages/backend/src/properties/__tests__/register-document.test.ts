import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { handler } from '../register-document';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

describe('Register Document Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENTS_TABLE_NAME = 'SatyaMool-Documents';
    process.env.DOCUMENT_BUCKET_NAME = 'satyamool-documents';
    process.env.AWS_REGION = 'us-east-1';
  });

  const mockUserId = 'user-123';
  const mockPropertyId = 'property-456';
  const mockDocumentId = 'doc-789';

  const createMockEvent = (
    propertyId: string,
    body: any,
    userId: string = mockUserId,
    role: string = 'Standard_User'
  ): APIGatewayProxyEvent => ({
    pathParameters: { id: propertyId },
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: `/v1/properties/${propertyId}/documents`,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      authorizer: {
        claims: {
          sub: userId,
          'custom:role': role,
        },
      },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
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
        userAgent: null,
        userArn: null,
      },
      path: `/v1/properties/${propertyId}/documents`,
      stage: 'test',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/v1/properties/{id}/documents',
    },
    resource: '/v1/properties/{id}/documents',
  });

  describe('Successful Registration', () => {
    it('should register document successfully', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'sale-deed.pdf',
        fileSize: 1024000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
        documentType: 'sale_deed',
      };

      // Mock property exists
      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: mockUserId,
          status: 'pending',
        },
      });

      // Mock S3 document exists
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1024000,
        ContentType: 'application/pdf',
      });

      // Mock DynamoDB put
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const response = JSON.parse(result.body);
      expect(response.documentId).toBe(mockDocumentId);
      expect(response.propertyId).toBe(mockPropertyId);
      expect(response.userId).toBe(mockUserId);
      expect(response.processingStatus).toBe('pending');
      expect(response.message).toContain('registered successfully');
    });

    it('should register document with default documentType', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'document.pdf',
        fileSize: 500000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: mockUserId,
        },
      });

      s3Mock.on(HeadObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
      const response = JSON.parse(result.body);
      expect(response.documentType).toBe('unknown');
    });

    it('should allow admin to register document for any property', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 800000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
      };

      // Property belongs to different user
      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: 'other-user-999',
        },
      });

      s3Mock.on(HeadObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent(mockPropertyId, requestBody, mockUserId, 'Admin_User');
      const result = await handler(event);

      expect(result.statusCode).toBe(201);
    });
  });

  describe('Validation Errors', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = createMockEvent(mockPropertyId, {}, '', 'Standard_User');
      event.requestContext.authorizer = {} as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('UNAUTHORIZED');
    });

    it('should return 400 if propertyId is missing', async () => {
      const event = createMockEvent('', {});
      event.pathParameters = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('MISSING_PROPERTY_ID');
    });

    it('should return 400 if request body is missing', async () => {
      const event = createMockEvent(mockPropertyId, {});
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('MISSING_BODY');
    });

    it('should return 400 if documentId is missing', async () => {
      const requestBody = {
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: 'some-key',
      };

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('Document ID');
    });

    it('should return 400 if fileName is missing', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: 'some-key',
      };

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.message).toContain('File name');
    });

    it('should return 400 if fileSize is invalid', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 0,
        contentType: 'application/pdf',
        s3Key: 'some-key',
      };

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.message).toContain('File size must be greater than 0');
    });

    it('should return 400 if s3Key is missing', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
      };

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const response = JSON.parse(result.body);
      expect(response.message).toContain('S3 key');
    });
  });

  describe('Authorization Errors', () => {
    it('should return 404 if property does not exist', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: 'some-key',
      };

      ddbMock.on(GetCommand).resolves({});

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('PROPERTY_NOT_FOUND');
    });

    it('should return 403 if user does not own the property', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: 'some-key',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: 'other-user-999',
        },
      });

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('FORBIDDEN');
    });
  });

  describe('S3 Verification', () => {
    it('should return 404 if document not found in S3', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: mockUserId,
        },
      });

      // Mock S3 document not found
      s3Mock.on(HeadObjectCommand).rejects({
        name: 'NotFound',
        $metadata: { httpStatusCode: 404 },
      });

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('DOCUMENT_NOT_FOUND');
      expect(response.message).toContain('not found in S3');
    });
  });

  describe('Database Errors', () => {
    it('should return 409 if document already registered', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: mockUserId,
        },
      });

      s3Mock.on(HeadObjectCommand).resolves({});

      ddbMock.on(PutCommand).rejects({
        name: 'ConditionalCheckFailedException',
      });

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('DOCUMENT_EXISTS');
    });

    it('should return 500 for unexpected database errors', async () => {
      const requestBody = {
        documentId: mockDocumentId,
        fileName: 'deed.pdf',
        fileSize: 1000,
        contentType: 'application/pdf',
        s3Key: `properties/${mockPropertyId}/documents/${mockDocumentId}.pdf`,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: mockPropertyId,
          userId: mockUserId,
        },
      });

      s3Mock.on(HeadObjectCommand).resolves({});

      ddbMock.on(PutCommand).rejects(new Error('Database error'));

      const event = createMockEvent(mockPropertyId, requestBody);
      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const response = JSON.parse(result.body);
      expect(response.error).toBe('INTERNAL_ERROR');
    });
  });
});
