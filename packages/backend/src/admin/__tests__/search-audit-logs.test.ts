/**
 * Unit tests for search audit logs endpoint
 * 
 * Tests search functionality, filtering, pagination, and authorization
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../search-audit-logs';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Search Audit Logs', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.AUDIT_LOGS_TABLE = 'TestAuditLogs';
  });

  afterEach(() => {
    delete process.env.AUDIT_LOGS_TABLE;
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
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });
  });

  describe('Search Functionality', () => {
    it('should return all logs when no filters provided', async () => {
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
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User');

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(2);
      expect(body.logs[0].logId).toBe('log-1');
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should filter by userId using GSI query', async () => {
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
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].userId).toBe('user-123');

      // Verify QueryCommand was used (not ScanCommand)
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls.length).toBeGreaterThan(0);
    });

    it('should filter by action', async () => {
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

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        action: 'USER_LOGIN',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].action).toBe('USER_LOGIN');
    });

    it('should filter by resourceType', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-123',
          action: 'DOCUMENT_UPLOADED',
          resourceType: 'DOCUMENT',
          resourceId: 'doc-456',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        resourceType: 'DOCUMENT',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].resourceType).toBe('DOCUMENT');
    });

    it('should filter by date range', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-15T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
    });

    it('should apply multiple filters', async () => {
      const mockLogs = [
        {
          logId: 'log-1',
          timestamp: '2024-01-15T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
      ];

      ddbMock.on(QueryCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
        action: 'USER_LOGIN',
        startDate: '2024-01-01T00:00:00Z',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
    });
  });

  describe('Pagination', () => {
    it('should return pagination metadata', async () => {
      const mockLogs = Array.from({ length: 10 }, (_, i) => ({
        logId: `log-${i}`,
        timestamp: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
        userId: 'user-123',
        action: 'USER_LOGIN',
        resourceType: 'USER',
        resourceId: 'user-123',
      }));

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
        LastEvaluatedKey: { logId: 'log-9' },
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        limit: '10',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(10);
      expect(body.pagination.hasMore).toBe(true);
      expect(body.pagination.nextToken).toBeDefined();
      expect(body.pagination.count).toBe(10);
    });

    it('should respect limit parameter', async () => {
      const mockLogs = Array.from({ length: 5 }, (_, i) => ({
        logId: `log-${i}`,
        timestamp: `2024-01-01T${String(i).padStart(2, '0')}:00:00Z`,
        userId: 'user-123',
        action: 'USER_LOGIN',
        resourceType: 'USER',
        resourceId: 'user-123',
      }));

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        limit: '5',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(5);
    });

    it('should return 400 for invalid limit', async () => {
      const event = createMockEvent('admin-123', 'Admin_User', {
        limit: '200',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('INVALID_LIMIT');
    });

    it('should handle nextToken for pagination', async () => {
      const mockLogs = [
        {
          logId: 'log-10',
          timestamp: '2024-01-01T10:00:00Z',
          userId: 'user-123',
          action: 'USER_LOGIN',
          resourceType: 'USER',
          resourceId: 'user-123',
        },
      ];

      ddbMock.on(ScanCommand).resolves({
        Items: mockLogs,
      });
      ddbMock.on(PutCommand).resolves({});

      const nextToken = Buffer.from(JSON.stringify({ logId: 'log-9' })).toString('base64');
      const event = createMockEvent('admin-123', 'Admin_User', {
        nextToken: nextToken,
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.logs).toHaveLength(1);
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
  });

  describe('Audit Logging', () => {
    it('should log the search operation', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [],
      });
      ddbMock.on(PutCommand).resolves({});

      const event = createMockEvent('admin-123', 'Admin_User', {
        userId: 'user-123',
        action: 'USER_LOGIN',
      });

      const result = await handler(event);

      expect(result.statusCode).toBe(200);

      // Verify audit log was created
      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls.length).toBeGreaterThan(0);
      
      const auditLog = putCalls[0].args[0].input.Item;
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe('AUDIT_LOGS_ACCESSED');
      expect(auditLog?.userId).toBe('admin-123');
    });
  });
});
