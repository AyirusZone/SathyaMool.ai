/**
 * Unit tests for export audit logs endpoint
 * 
 * Tests export functionality, S3 upload, presigned URL generation, and authorization
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { handler } from '../export-audit-logs';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.amazonaws.com/presigned-url'),
}));

describe('Export Audit Logs', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    process.env.AUDIT_LOGS_TABLE = 'TestAuditLogs';
    process.env.EXPORT_BUCKET = 'test-exports';
  });

  afterEach(() => {
    delete process.env.AUDIT_LOGS_TABLE;
    delete process.env.EXPORT_BUCKET;
  });

  const createMockEvent = (
    userId: string,
    userRole: string,
    queryParams: Record<string, string> = {}
  ): APIGatewayProxyEvent => {
    return {
      requestContext: {
        authorizer: {
          claims: {
            sub: userId,
            'custom:role': userRole,
          },
        },
        requestId: 'test-request-id',
        identity: {
          sourceIp: '192.168.1.1',
          userAgent: 'test-agent',
        },
      },
      queryStringParameters: queryParams,
    } as any;
  };

  describe('Authorization', () => {
    it('should return 401 if user is not authenticated', async () => {
      const event = {
        requestContext: {},
        queryStringParameters: {},
      } as any;

      const result = await handler(event);

      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('UNAUTHORIZED');
    });

    it('should return 403 if user is not admin', async () => {
      const event = createMockEvent('user-123', 'Standard_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('FORBIDDEN');
    });

    it('should allow access for admin users', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Export Functionality', () => {
    it('should export all logs when no filters provided', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
        {
          logId: 'log-2',
          timestamp: '2024-01-01T09:00:00Z',
          userId: 'user-456',
          action: 'DOCUMENT_UPLOADED',
          resourceType: 'DOCUMENT',
          resourceId: 'doc-789',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.recordCount).toBe(2);
      expect(body.downloadUrl).toBeDefined();
      expect(body.exportId).toBeDefined();
      expect(body.expiresIn).toBe(3600);

      // Verify S3 upload was called
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      expect(s3Calls.length).toBe(1);
      expect(s3Calls[0].args[0].input.Bucket).toBeDefined();
      expect(s3Calls[0].args[0].input.ContentType).toBe('application/json');
    });

    it('should export filtered logs', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockLogs,
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
        action: 'USER_LOGIN',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.recordCount).toBe(1);
    });

    it('should handle pagination and collect all logs', async () => {
      const mockLogsPage1 = Array.from({ length: 50 }, (_, i) => ({
        logId: `log-${i}`,
        timestamp: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
        userId: 'user-123',
        action: 'USER_LOGIN',
        resourceType: 'USER',
        resourceId: 'user-123',
      }));

      const mockLogsPage2 = Array.from({ length: 30 }, (_, i) => ({
        logId: `log-${i + 50}`,
        timestamp: `2024-01-02T${String(i).padStart(2, '0')}:00:00Z`,
        userId: 'user-123',
        action: 'USER_LOGIN',
        resourceType: 'USER',
        resourceId: 'user-123',
      }));

      ddbMock
        .on(ScanCommand)
        .resolvesOnce({
          Items: mockLogsPage1,
          LastEvaluatedKey: { logId: 'log-49' },
        })
        .resolvesOnce({
          Items: mockLogsPage2,
        });

      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.recordCount).toBe(80);

      // Verify multiple scan calls were made
      const scanCalls = ddbMock.commandCalls(ScanCommand);
      expect(scanCalls.length).toBe(2);
    });

    it('should sort logs by timestamp descending', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-01T08:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
        {
          logId: 'log-2',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-456',
          action: 'DOCUMENT_UPLOADED',
          resourceType: 'DOCUMENT',
          resourceId: 'doc-789',
        },
        {
          logId: 'log-3',
          timestamp: '2024-01-01T09:00:00Z',
          userId: 'user-789',
          action: 'PROPERTY_CREATED',
          resourceType: 'PROPERTY',
          resourceId: 'prop-123',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 upload contains sorted logs
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const uploadedData = JSON.parse(s3Calls[0].args[0].input.Body as string);
      expect(uploadedData.logs[0].logId).toBe('log-2'); // Most recent
      expect(uploadedData.logs[1].logId).toBe('log-3');
      expect(uploadedData.logs[2].logId).toBe('log-1'); // Oldest
    });

    it('should include export metadata in S3 object', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockLogs,
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
        action: 'USER_LOGIN',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 upload contains metadata
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const uploadedData = JSON.parse(s3Calls[0].args[0].input.Body as string);
      
      expect(uploadedData.exportId).toBeDefined();
      expect(uploadedData.exportedAt).toBeDefined();
      expect(uploadedData.exportedBy).toBe('admin-123');
      expect(uploadedData.filters).toEqual({
        userId: 'user-123',
        action: 'USER_LOGIN',
        resourceType: undefined,
        startDate: undefined,
        endDate: undefined,
      });
      expect(uploadedData.recordCount).toBe(1);
      expect(uploadedData.logs).toHaveLength(1);
    });
  });

  describe('S3 Integration', () => {
    it('should upload export to correct S3 path', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 key format
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const s3Key = s3Calls[0].args[0].input.Key as string;
      expect(s3Key).toMatch(/^exports\/audit-logs\/audit-logs-export-.*\.json$/);
    });

    it('should set correct S3 object metadata', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify S3 metadata
      const s3Calls = s3Mock.commandCalls(PutObjectCommand);
      const metadata = s3Calls[0].args[0].input.Metadata;
      expect(metadata?.exportedBy).toBe('admin-123');
      expect(metadata?.recordCount).toBe('0');
      expect(metadata?.exportId).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should return 500 on DynamoDB error', async () => {
      ddbMock.on(ScanCommand).rejects(new Error('DynamoDB error'));

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });

    it('should return 500 on S3 error', async () => {
      ddbMock.on(ScanCommand).resolves({
        Items: [],
      });
      s3Mock.on(PutObjectCommand).rejects(new Error('S3 error'));

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('Audit Logging', () => {
    it('should log the export operation', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });
      s3Mock.on(PutObjectCommand).resolves({});
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify audit log was created
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
      
      const auditLog = putCalls[0].args[0].input.Item;
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('AUDIT_LOGS_EXPORTED');
      expect(auditLog?.userId).toBe('admin-123');
      expect(auditLog?.metadata.recordCount).toBe(0);
    });
  });
});
