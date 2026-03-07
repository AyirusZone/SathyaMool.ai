/**
 * Audit Logging Utility Module
 * 
 * Provides reusable functions for logging audit events to DynamoDB.
 * Implements structured log format with required fields for compliance.
 * 
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.7
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE_NAME || process.env.AUDIT_LOGS_TABLE || 'AuditLogs';

/**
 * Audit log action types
 */
export enum AuditAction {
  // Authentication events
  USER_REGISTERED = 'USER_REGISTERED',
  USER_LOGIN = 'USER_LOGIN',
  USER_LOGOUT = 'USER_LOGOUT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  TOKEN_REFRESHED = 'TOKEN_REFRESHED',
  
  // Document operations
  DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED',
  DOCUMENT_ACCESSED = 'DOCUMENT_ACCESSED',
  DOCUMENT_DELETED = 'DOCUMENT_DELETED',
  
  // Property operations
  PROPERTY_CREATED = 'PROPERTY_CREATED',
  PROPERTY_ACCESSED = 'PROPERTY_ACCESSED',
  PROPERTY_DELETED = 'PROPERTY_DELETED',
  
  // Admin operations
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  USER_DEACTIVATED = 'USER_DEACTIVATED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  USER_DELETED = 'USER_DELETED',
  UPDATE_USER_ROLE = 'UPDATE_USER_ROLE',
  UPDATE_USER_ROLE_DENIED = 'UPDATE_USER_ROLE_DENIED',
  DEACTIVATE_USER = 'DEACTIVATE_USER',
  DEACTIVATE_USER_DENIED = 'DEACTIVATE_USER_DENIED',
  LIST_USERS = 'LIST_USERS',
  LIST_USERS_DENIED = 'LIST_USERS_DENIED',
  
  // Data access
  REPORT_GENERATED = 'REPORT_GENERATED',
  LINEAGE_ACCESSED = 'LINEAGE_ACCESSED',
  TRUST_SCORE_ACCESSED = 'TRUST_SCORE_ACCESSED',
  AUDIT_LOGS_ACCESSED = 'AUDIT_LOGS_ACCESSED',
  AUDIT_LOGS_EXPORTED = 'AUDIT_LOGS_EXPORTED',
  DATA_EXPORTED = 'DATA_EXPORTED',
}

/**
 * Resource types for audit logging
 */
export enum ResourceType {
  USER = 'USER',
  PROPERTY = 'PROPERTY',
  DOCUMENT = 'DOCUMENT',
  AUDIT_LOG = 'AUDIT_LOG',
  REPORT = 'REPORT',
}

/**
 * Structured audit log entry
 */
export interface AuditLogEntry {
  logId: string;
  timestamp: string;
  userId: string;
  action: AuditAction | string;
  resourceType: ResourceType | string;
  resourceId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome?: string;
  metadata?: Record<string, any>;
}

/**
 * Parameters for creating an audit log
 */
export interface CreateAuditLogParams {
  userId: string;
  action: AuditAction | string; // Allow string for flexibility
  resourceType: ResourceType | string; // Allow string for flexibility
  resourceId: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome?: string; // SUCCESS or FAILURE
  reason?: string; // Reason for action
  details?: any; // Additional details
  metadata?: Record<string, any>;
  [key: string]: any; // Allow any additional fields
}

/**
 * Create an audit log entry in DynamoDB
 * 
 * @param params - Audit log parameters
 * @returns Promise resolving to the created log entry
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<AuditLogEntry> {
  const logEntry: AuditLogEntry = {
    logId: uuidv4(),
    timestamp: new Date().toISOString(),
    userId: params.userId,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    requestId: params.requestId,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    outcome: params.outcome,
    metadata: params.metadata,
  };

  // Remove undefined values to avoid DynamoDB errors
  const cleanedEntry = Object.fromEntries(
    Object.entries(logEntry).filter(([_, value]) => value !== undefined)
  ) as AuditLogEntry;

  try {
    await docClient.send(
      new PutCommand({
        TableName: AUDIT_LOGS_TABLE,
        Item: cleanedEntry,
      })
    );

    console.log('Audit log created:', {
      logId: cleanedEntry.logId,
      action: cleanedEntry.action,
      userId: cleanedEntry.userId,
      resourceType: cleanedEntry.resourceType,
    });

    return cleanedEntry;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main operation
    throw error;
  }
}

/**
 * Helper function to extract IP address from API Gateway event
 */
export function extractIpAddress(event: any): string | undefined {
  return event.requestContext?.identity?.sourceIp;
}

/**
 * Helper function to extract user agent from API Gateway event
 */
export function extractUserAgent(event: any): string | undefined {
  return event.requestContext?.identity?.userAgent;
}

/**
 * Helper function to extract request ID from API Gateway event
 */
export function extractRequestId(event: any): string | undefined {
  return event.requestContext?.requestId;
}

/**
 * Helper function to extract user ID from API Gateway event
 * The authorizer puts userId in the context, not in claims
 */
export function extractUserId(event: any): string | undefined {
  return event.requestContext?.authorizer?.userId || event.requestContext?.authorizer?.claims?.sub;
}

/**
 * Alias for createAuditLog for backward compatibility
 */
export const logAuditEvent = createAuditLog;
