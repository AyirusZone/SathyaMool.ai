import { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { handler } from '../generate-upload-url';

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue(
    'https://satyamool-documents.s3.amazonaws.com/test-key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=900&X-Amz-Signature=test-signature'
  ),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

describe('Generate Upload URL Lambda', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.PROPERTIES_TABLE_NAME = 'SatyaMool-Properties';
    process.env.DOCUMENT_BUCKET_NAME = 'satyamool-documents';
    process.env.AWS_REGION = 'us-east-1';
  });

  const createMockEvent = (
    propertyId: string,
    body: any,
    userId: string = 'user-123',
    role: string = 'Standard_User'
  ): APIGatewayProxyEvent => {
    return {
      httpMethod: 'POST',
      path: `/v1/properties/${propertyId}/upload-url`,
      pathParameters: { id: propertyId },
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      isBase64Encoded: false,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api',
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        path: `/v1/properties/${propertyId}/upload-url`,
        stage: 'test',
        requestId: 'test-request-id',
        requestTime: '01/Jan/2024:00:00:00 +0000',
        requestTimeEpoch: 1704067200000,
        identity: {
          sourceIp: '127.0.0.1',
          userAgent: 'test-agent',
          cognitoIdentityPoolId: null,
          cognitoIdentityId: null,
          cognitoAuthenticationType: null,
          cognitoAuthenticationProvider: null,
          userArn: null,
          user: null,
          caller: null,
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          clientCert: null,
          principalOrgId: null,
        },
        authorizer: {
          claims: {
            sub: userId,
            'custom:role': role,
          },
        },
        resourceId: 'test-resource',
        resourcePath: '/v1/properties/{id}/upload-url',
      },
      resource: '/v1/properties/{id}/upload-url',
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
    } as any;
  };

  describe('Successful presigned URL generation', () => {
    it('should generate presigned URL for valid PDF upload', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'sale-deed.pdf',
        fileSize: 5 * 1024 * 1024, // 5MB
        contentType: 'application/pdf',
      };

      // Mock property exists and user owns it
      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
      expect(response.uploadUrl).toContain('X-Amz-Algorithm');
      expect(response.uploadUrl).toContain('X-Amz-Expires=900'); // 15 minutes
      expect(response.documentId).toBeDefined();
      expect(response.expiresIn).toBe(900);
      expect(response.metadata.fileName).toBe('sale-deed.pdf');
      expect(response.metadata.fileSize).toBe(5 * 1024 * 1024);
      expect(response.metadata.contentType).toBe('application/pdf');
      expect(response.metadata.s3Key).toContain(`properties/${propertyId}/documents/`);
      expect(response.message).toContain('Presigned URL generated successfully');
    });

    it('should generate presigned URL for valid JPEG upload', async () => {
      const propertyId = 'property-456';
      const userId = 'user-456';
      const requestBody = {
        fileName: 'document-scan.jpeg',
        fileSize: 10 * 1024 * 1024, // 10MB
        contentType: 'image/jpeg',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
      expect(response.metadata.contentType).toBe('image/jpeg');
      expect(response.metadata.s3Key).toContain('.jpeg');
    });

    it('should generate presigned URL for valid PNG upload', async () => {
      const propertyId = 'property-789';
      const userId = 'user-789';
      const requestBody = {
        fileName: 'property-photo.png',
        fileSize: 8 * 1024 * 1024, // 8MB
        contentType: 'image/png',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
      expect(response.metadata.contentType).toBe('image/png');
      expect(response.metadata.s3Key).toContain('.png');
    });

    it('should generate presigned URL for valid TIFF upload', async () => {
      const propertyId = 'property-101';
      const userId = 'user-101';
      const requestBody = {
        fileName: 'scanned-document.tiff',
        fileSize: 15 * 1024 * 1024, // 15MB
        contentType: 'image/tiff',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
      expect(response.metadata.contentType).toBe('image/tiff');
      expect(response.metadata.s3Key).toContain('.tiff');
    });

    it('should allow admin to generate presigned URL for any property', async () => {
      const propertyId = 'property-admin';
      const userId = 'admin-user';
      const propertyOwnerId = 'different-user';
      const requestBody = {
        fileName: 'admin-upload.pdf',
        fileSize: 2 * 1024 * 1024, // 2MB
        contentType: 'application/pdf',
      };

      // Property belongs to different user
      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: propertyOwnerId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId, 'Admin_User');
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
    });
  });

  describe('File format validation', () => {
    it('should reject unsupported file format', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.docx',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('Invalid file format');
      expect(response.message).toContain('PDF, JPEG, JPG, PNG, TIFF, TIF');
    });

    it('should reject file with no extension', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('Invalid file format');
    });

    it('should reject invalid content type', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
        contentType: 'text/plain',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('Invalid content type');
    });
  });

  describe('File size validation', () => {
    it('should reject file exceeding 50MB limit', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'large-document.pdf',
        fileSize: 51 * 1024 * 1024, // 51MB
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File size exceeds the maximum limit of 50MB');
      expect(response.message).toContain('51.00MB');
    });

    it('should reject file with zero size', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'empty.pdf',
        fileSize: 0,
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File size must be greater than 0');
    });

    it('should reject file with negative size', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: -1000,
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File size must be greater than 0');
    });

    it('should accept file at exactly 50MB limit', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'max-size.pdf',
        fileSize: 50 * 1024 * 1024, // Exactly 50MB
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      
      const response = JSON.parse(result.body);
      expect(response.uploadUrl).toBeDefined();
    });
  });

  describe('Authorization and property validation', () => {
    it('should reject request without authentication', async () => {
      const propertyId = 'property-123';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      const event = createMockEvent(propertyId, requestBody);
      // Remove authorizer context
      delete event.requestContext.authorizer;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('UNAUTHORIZED');
      expect(response.message).toContain('User authentication required');
    });

    it('should reject request without property ID', async () => {
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      const event = createMockEvent('', requestBody);
      event.pathParameters = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('MISSING_PROPERTY_ID');
      expect(response.message).toContain('Property ID is required');
    });

    it('should reject request for non-existent property', async () => {
      const propertyId = 'non-existent-property';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      // Property does not exist
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('PROPERTY_NOT_FOUND');
      expect(response.message).toContain('Property not found');
    });

    it('should reject request when user does not own property', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const propertyOwnerId = 'different-user';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      // Property belongs to different user
      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: propertyOwnerId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('FORBIDDEN');
      expect(response.message).toContain('You do not have permission to upload documents');
    });
  });

  describe('Request body validation', () => {
    it('should reject request without body', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';

      const event = createMockEvent(propertyId, {}, userId);
      event.body = null;

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('MISSING_BODY');
      expect(response.message).toContain('Request body is required');
    });

    it('should reject request without fileName', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File name is required');
    });

    it('should reject request with fileName exceeding 255 characters', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const longFileName = 'a'.repeat(256) + '.pdf';
      const requestBody = {
        fileName: longFileName,
        fileSize: 1 * 1024 * 1024,
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File name must not exceed 255 characters');
    });

    it('should reject request without fileSize', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.pdf',
        contentType: 'application/pdf',
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('File size is required');
    });

    it('should reject request without contentType', async () => {
      const propertyId = 'property-123';
      const userId = 'user-123';
      const requestBody = {
        fileName: 'document.pdf',
        fileSize: 1 * 1024 * 1024,
      };

      ddbMock.on(GetCommand).resolves({
        Item: {
          propertyId: propertyId,
          userId: userId,
          status: 'pending',
        },
      });

      const event = createMockEvent(propertyId, requestBody, userId);
      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      
      const response = JSON.parse(result.body);
      expect(response.error).toBe('VALIDATION_ERROR');
      expect(response.message).toContain('Content type is required');
    });
  });
});
