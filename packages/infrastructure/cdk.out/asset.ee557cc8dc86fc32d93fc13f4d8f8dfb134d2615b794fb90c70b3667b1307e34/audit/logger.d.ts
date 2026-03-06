/**
 * Audit Logging Utility Module
 *
 * Provides reusable functions for logging audit events to DynamoDB.
 * Implements structured log format with required fields for compliance.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.7
 */
/**
 * Audit log action types
 */
export declare enum AuditAction {
    USER_REGISTERED = "USER_REGISTERED",
    USER_LOGIN = "USER_LOGIN",
    USER_LOGOUT = "USER_LOGOUT",
    OTP_VERIFIED = "OTP_VERIFIED",
    TOKEN_REFRESHED = "TOKEN_REFRESHED",
    DOCUMENT_UPLOADED = "DOCUMENT_UPLOADED",
    DOCUMENT_ACCESSED = "DOCUMENT_ACCESSED",
    DOCUMENT_DELETED = "DOCUMENT_DELETED",
    PROPERTY_CREATED = "PROPERTY_CREATED",
    PROPERTY_ACCESSED = "PROPERTY_ACCESSED",
    PROPERTY_DELETED = "PROPERTY_DELETED",
    USER_ROLE_CHANGED = "USER_ROLE_CHANGED",
    USER_DEACTIVATED = "USER_DEACTIVATED",
    USER_REACTIVATED = "USER_REACTIVATED",
    USER_DELETED = "USER_DELETED",
    UPDATE_USER_ROLE = "UPDATE_USER_ROLE",
    UPDATE_USER_ROLE_DENIED = "UPDATE_USER_ROLE_DENIED",
    DEACTIVATE_USER = "DEACTIVATE_USER",
    DEACTIVATE_USER_DENIED = "DEACTIVATE_USER_DENIED",
    LIST_USERS = "LIST_USERS",
    LIST_USERS_DENIED = "LIST_USERS_DENIED",
    REPORT_GENERATED = "REPORT_GENERATED",
    LINEAGE_ACCESSED = "LINEAGE_ACCESSED",
    TRUST_SCORE_ACCESSED = "TRUST_SCORE_ACCESSED",
    AUDIT_LOGS_ACCESSED = "AUDIT_LOGS_ACCESSED",
    AUDIT_LOGS_EXPORTED = "AUDIT_LOGS_EXPORTED",
    DATA_EXPORTED = "DATA_EXPORTED"
}
/**
 * Resource types for audit logging
 */
export declare enum ResourceType {
    USER = "USER",
    PROPERTY = "PROPERTY",
    DOCUMENT = "DOCUMENT",
    AUDIT_LOG = "AUDIT_LOG",
    REPORT = "REPORT"
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
    action: AuditAction | string;
    resourceType: ResourceType | string;
    resourceId: string;
    requestId?: string;
    ipAddress?: string;
    userAgent?: string;
    outcome?: string;
    reason?: string;
    details?: any;
    metadata?: Record<string, any>;
    [key: string]: any;
}
/**
 * Create an audit log entry in DynamoDB
 *
 * @param params - Audit log parameters
 * @returns Promise resolving to the created log entry
 */
export declare function createAuditLog(params: CreateAuditLogParams): Promise<AuditLogEntry>;
/**
 * Helper function to extract IP address from API Gateway event
 */
export declare function extractIpAddress(event: any): string | undefined;
/**
 * Helper function to extract user agent from API Gateway event
 */
export declare function extractUserAgent(event: any): string | undefined;
/**
 * Helper function to extract request ID from API Gateway event
 */
export declare function extractRequestId(event: any): string | undefined;
/**
 * Helper function to extract user ID from API Gateway event
 */
export declare function extractUserId(event: any): string | undefined;
/**
 * Alias for createAuditLog for backward compatibility
 */
export declare const logAuditEvent: typeof createAuditLog;
