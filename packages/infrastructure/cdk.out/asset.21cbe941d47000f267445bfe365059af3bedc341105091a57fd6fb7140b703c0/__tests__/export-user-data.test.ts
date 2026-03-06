/**
 * Unit tests for export user data endpoint
 * 
 * Tests data export functionality, S3 upload, presigned URL generation
 * Requirements: 20.8
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { handler } from '../export-user-data';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-url'),
}));

describe('Export User Data', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.USERS_TABLE_NAME = 'TestUsers';
    process.env.PROPERTIES_TABLE_NAME = 'TestProperties';
    process.env.DOCUMENTS_TABLE_NAME = 'TestDocuments';
    process.env.LINEAGE_TABLE_NAME = 'TestLineage';
    process.env.TRUST_SCORES_TABLE_NAME = 'TestTrustScores';
    process.env.NOTIFICATIONS_TABLE_NAME = 'TestNotifications';
    process.env.DOCUMENT_BUCKET_NAME = 'test-documents';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
    delete process.env.PROPERTIES_TABLE_NAME;
    delete process.env.DOCUMENTS_TABLE_NAME;
    delete process.env.LINEAGE_TABLE_NAME;
    delete process.env.TRUST_SCORES_TABLE_NAME;
    delete process.env.NOTIFICATIONS_TABLE_NAME;
    delete process.env.DOCUMENT_BUCKET_NAME;
  });

  const createMockEvent = (userId: string): APIGatewayProxyEvent => {
    return {
      requestContext: {
        authorizer: {
          claims: {
            sub: userId,
          },
        },
        requestId: 'test-request-id',
        identity: {
          sourceIp: '192.168.1.1',
          userAgent: 'test-agent',
        },
      },
    } as any;
  };

  describe('Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = {
        requestContext: {},
      } as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should return 404 if user not found', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('USER_NOT_FOUND');
    });
  });

  describe('Export Functionality', () => {
    it('should export all user data successfully', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        phoneNumber: '+1234567890',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
        lastLogin: '2024-01-15T10:00:00Z',
      };

      // Mock all GetCommand calls
      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      
      // Mock all QueryCommand calls
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('User data exported successfully');
      expect(body.downloadUrl).toBeDefined();
      expect(body.expiresIn).toBe(3600);

      // Verify S3 upload was called
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      expect(s3Calls.length).toBe(1);
      expect(s3Calls[0].args[0].input.ContentType).toBe('application/json');
    });

    it('should sanitize sensitive data in export', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      // Mock all GetCommand calls
      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      
      // Mock all QueryCommand calls
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 upload was called
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      expect(s3Calls.length).toBe(1);
      
      // Verify export structure
      const uploadedData = JSON.parse(s3Calls[0].args[0].input.Body as string);
      expect(uploadedData.user).toBeDefined();
      expect(uploadedData.properties).toBeDefined();
      expect(uploadedData.documents).toBeDefined();
      expect(uploadedData.exportedAt).toBeDefined();
    });

    it('should export user with no properties', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify export contains empty arrays
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const uploadedData = JSON.parse(s3Calls[0].args[0].input.Body as string);
      
      expect(uploadedData.properties).toEqual([]);
      expect(uploadedData.documents).toEqual([]);
      expect(uploadedData.lineage).toEqual([]);
      expect(uploadedData.trustScores).toEqual([]);
    });

    it('should include export metadata', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify export metadata
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const uploadedData = JSON.parse(s3Calls[0].args[0].input.Body as string);
      
      expect(uploadedData.user.userId).toBe('user-123');
      expect(uploadedData.exportedAt).toBeDefined();
      expect(new Date(uploadedData.exportedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('S3 Integration', () => {
    it('should upload export to correct S3 path', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 key format
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const s3Key = s3Calls[0].args[0].input.Key as string;
      expect(s3Key).toMatch(/^exports\/user-123\/user-data-\d+\.json$/);
    });

    it('should set correct S3 object metadata', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 metadata
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const metadata = s3Calls[0].args[0].input.Metadata;
      expect(metadata?.userId).toBe('user-123');
      expect(metadata?.exportedAt).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on DynamoDB error', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 500 on S3 error', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      s3Mock.on(PutObjectCommand).rejects(new Error('S3 error'));

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('Audit Logging', () => {
    it('should log the export operation', async () => {
      const mockUser = {
        userId: 'user-123',
        email: 'test@example.com',
        role: 'Standard_User',
        status: 'active',
        createdAt: '2024-01-01T00:00:00Z',
      };

      ddbMock.on(GetCommand).resolves({ Item: mockUser });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('user-123');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify audit log was created
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
      
      const auditLog = putCalls[0].args[0].input.Item;
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('DATA_EXPORTED');
      expect(auditLog?.userId).toBe('user-123');
      expect(auditLog?.resourceType).toBe('USER');
    });
  });
});
