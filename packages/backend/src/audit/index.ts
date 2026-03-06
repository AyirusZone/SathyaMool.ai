/**
 * Audit Logging Module
 * 
 * Exports audit logging utilities for use across Lambda functions
 */

export {
  createAuditLog,
  extractIpAddress,
  extractUserAgent,
  extractRequestId,
  extractUserId,
  AuditAction,
  ResourceType,
  type AuditLogEntry,
  type CreateAuditLogParams,
} from './logger';
