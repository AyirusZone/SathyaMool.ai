/**
 * Unit tests for audit logging utility module
 * 
 * Tests log entry creation, helper functions, and error handling
 */

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  createAuditLog,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
  extractUserId,
  AuditAction,
  ResourceType,
} from '../logger';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Audit Logger', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('createAuditLog', () => {
    it('should create audit log entry with all fields', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createAuditLog({
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        resourceType: ResourceType.USER,
        resourceId: 'user-123',
        requestId: 'req-456',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: {
          role: 'Standard_User',
        },
      });

      expect(result).toMatchObject({
        userId: 'user-123',
        action: AuditAction.USER_LOGIN,
        resourceType: ResourceType.USER,
        resourceId: 'user-123',
        requestId: 'req-456',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        metadata: {
          role: 'Standard_User',
        },
      });

      expect(result.logId).toBeDefined();
      expect(result.timestamp).toBeDefined();

      // Verify DynamoDB was called
      const calls = ddbMock.commandCalls(PutCommand);
      expect(calls.length).toBe(1);
      expect(calls[0].args[0].input.TableName).toBeDefined();
    });

    it('should create audit log entry with minimal fields', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createAuditLog({
        userId: 'user-123',
        action: AuditAction.DOCUMENT_UPLOADED,
        resourceType: ResourceType.DOCUMENT,
        resourceId: 'doc-789',
      });

      expect(result).toMatchObject({
        userId: 'user-123',
        action: AuditAction.DOCUMENT_UPLOADED,
        resourceType: ResourceType.DOCUMENT,
        resourceId: 'doc-789',
      });

      expect(result.logId).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.requestId).toBeUndefined();
      expect(result.ipAddress).toBeUndefined();
      expect(result.userAgent).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should throw error if DynamoDB put fails', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(
        createAuditLog({
          userId: 'user-123',
          action: AuditAction.USER_LOGIN,
          resourceType: ResourceType.USER,
          resourceId: 'user-123',
        })
      ).rejects.toThrow('DynamoDB error');
    });

    it('should create log for authentication events', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createAuditLog({
        userId: 'user-123',
        action: AuditAction.USER_REGISTERED,
        resourceType: ResourceType.USER,
        resourceId: 'user-123',
        metadata: {
          email: 'test@example.com',
          role: 'Standard_User',
        },
      });

      expect(result.action).toBe(AuditAction.USER_REGISTERED);
      expect(result.metadata).toEqual({
        email: 'test@example.com',
        role: 'Standard_User',
      });
    });

    it('should create log for document operations', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createAuditLog({
        userId: 'user-123',
        action: AuditAction.DOCUMENT_UPLOADED,
        resourceType: ResourceType.DOCUMENT,
        resourceId: 'doc-456',
        metadata: {
          propertyId: 'prop-789',
          fileName: 'deed.pdf',
          fileSize: 1024000,
        },
      });

      expect(result.action).toBe(AuditAction.DOCUMENT_UPLOADED);
      expect(result.resourceType).toBe(ResourceType.DOCUMENT);
      expect(result.metadata?.fileName).toBe('deed.pdf');
    });

    it('should create log for admin operations', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await createAuditLog({
        userId: 'admin-123',
        action: AuditAction.USER_ROLE_CHANGED,
        resourceType: ResourceType.USER,
        resourceId: 'user-456',
        metadata: {
          oldRole: 'Standard_User',
          newRole: 'Professional_User',
        },
      });

      expect(result.action).toBe(AuditAction.USER_ROLE_CHANGED);
      expect(result.metadata?.oldRole).toBe('Standard_User');
      expect(result.metadata?.newRole).toBe('Professional_User');
    });
  });

  describe('Helper Functions', () => {
    describe('extractIpAddress', () => {
      it('should extract IP address from API Gateway event', () => {
        const event = {
          requestContext: {
            identity: {
              sourceIp: '192.168.1.1',
            },
          },
        };

        const ipAddress = extractIpAddress(event);
        expect(ipAddress).toBe('192.168.1.1');
      });

      it('should return undefined if IP address not present', () => {
        const event = {
          requestContext: {
            identity: {},
          },
        };

        const ipAddress = extractIpAddress(event);
        expect(ipAddress).toBeUndefined();
      });

      it('should return undefined if requestContext not present', () => {
        const event = {};

        const ipAddress = extractIpAddress(event);
        expect(ipAddress).toBeUndefined();
      });
    });

    describe('extractUserAgent', () => {
      it('should extract user agent from API Gateway event', () => {
        const event = {
          requestContext: {
            identity: {
              userAgent: 'Mozilla/5.0',
            },
          },
        };

        const userAgent = extractUserAgent(event);
        expect(userAgent).toBe('Mozilla/5.0');
      });

      it('should return undefined if user agent not present', () => {
        const event = {
          requestContext: {
            identity: {},
          },
        };

        const userAgent = extractUserAgent(event);
        expect(userAgent).toBeUndefined();
      });
    });

    describe('extractRequestId', () => {
      it('should extract request ID from API Gateway event', () => {
        const event = {
          requestContext: {
            requestId: 'req-123',
          },
        };

        const requestId = extractRequestId(event);
        expect(requestId).toBe('req-123');
      });

      it('should return undefined if request ID not present', () => {
        const event = {
          requestContext: {},
        };

        const requestId = extractRequestId(event);
        expect(requestId).toBeUndefined();
      });
    });

    describe('extractUserId', () => {
      it('should extract user ID from API Gateway event', () => {
        const event = {
          requestContext: {
            authorizer: {
              claims: {
                sub: 'user-123',
              },
            },
          },
        };

        const userId = extractUserId(event);
        expect(userId).toBe('user-123');
      });

      it('should return undefined if user ID not present', () => {
        const event = {
          requestContext: {
            authorizer: {
              claims: {},
            },
          },
        };

        const userId = extractUserId(event);
        expect(userId).toBeUndefined();
      });

      it('should return undefined if authorizer not present', () => {
        const event = {
          requestContext: {},
        };

        const userId = extractUserId(event);
        expect(userId).toBeUndefined();
      });
    });
  });

  describe('AuditAction Enum', () => {
    it('should have all required authentication actions', () => {
      expect(AuditAction.USER_REGISTERED).toBe('USER_REGISTERED');
      expect(AuditAction.USER_LOGIN).toBe('USER_LOGIN');
      expect(AuditAction.USER_LOGOUT).toBe('USER_LOGOUT');
      expect(AuditAction.OTP_VERIFIED).toBe('OTP_VERIFIED');
      expect(AuditAction.TOKEN_REFRESHED).toBe('TOKEN_REFRESHED');
    });

    it('should have all required document actions', () => {
      expect(AuditAction.DOCUMENT_UPLOADED).toBe('DOCUMENT_UPLOADED');
      expect(AuditAction.DOCUMENT_ACCESSED).toBe('DOCUMENT_ACCESSED');
      expect(AuditAction.DOCUMENT_DELETED).toBe('DOCUMENT_DELETED');
    });

    it('should have all required property actions', () => {
      expect(AuditAction.PROPERTY_CREATED).toBe('PROPERTY_CREATED');
      expect(AuditAction.PROPERTY_ACCESSED).toBe('PROPERTY_ACCESSED');
      expect(AuditAction.PROPERTY_DELETED).toBe('PROPERTY_DELETED');
    });

    it('should have all required admin actions', () => {
      expect(AuditAction.USER_ROLE_CHANGED).toBe('USER_ROLE_CHANGED');
      expect(AuditAction.USER_DEACTIVATED).toBe('USER_DEACTIVATED');
      expect(AuditAction.USER_REACTIVATED).toBe('USER_REACTIVATED');
    });

    it('should have all required data access actions', () => {
      expect(AuditAction.REPORT_GENERATED).toBe('REPORT_GENERATED');
      expect(AuditAction.LINEAGE_ACCESSED).toBe('LINEAGE_ACCESSED');
      expect(AuditAction.TRUST_SCORE_ACCESSED).toBe('TRUST_SCORE_ACCESSED');
      expect(AuditAction.AUDIT_LOGS_ACCESSED).toBe('AUDIT_LOGS_ACCESSED');
      expect(AuditAction.AUDIT_LOGS_EXPORTED).toBe('AUDIT_LOGS_EXPORTED');
    });
  });

  describe('ResourceType Enum', () => {
    it('should have all required resource types', () => {
      expect(ResourceType.USER).toBe('USER');
      expect(ResourceType.PROPERTY).toBe('PROPERTY');
      expect(ResourceType.DOCUMENT).toBe('DOCUMENT');
      expect(ResourceType.AUDIT_LOG).toBe('AUDIT_LOG');
      expect(ResourceType.REPORT).toBe('REPORT');
    });
  });
});
