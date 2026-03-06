"use strict";
/**
 * Audit Logging Utility Module
 *
 * Provides reusable functions for logging audit events to DynamoDB.
 * Implements structured log format with required fields for compliance.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4, 17.7
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = exports.ResourceType = exports.AuditAction = void 0;
exports.createAuditLog = createAuditLog;
exports.extractIpAddress = extractIpAddress;
exports.extractUserAgent = extractUserAgent;
exports.extractRequestId = extractRequestId;
exports.extractUserId = extractUserId;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const uuid_1 = require("uuid");
const client = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(client);
const AUDIT_LOGS_TABLE = process.env.AUDIT_LOGS_TABLE || 'AuditLogs';
/**
 * Audit log action types
 */
var AuditAction;
(function (AuditAction) {
    // Authentication events
    AuditAction["USER_REGISTERED"] = "USER_REGISTERED";
    AuditAction["USER_LOGIN"] = "USER_LOGIN";
    AuditAction["USER_LOGOUT"] = "USER_LOGOUT";
    AuditAction["OTP_VERIFIED"] = "OTP_VERIFIED";
    AuditAction["TOKEN_REFRESHED"] = "TOKEN_REFRESHED";
    // Document operations
    AuditAction["DOCUMENT_UPLOADED"] = "DOCUMENT_UPLOADED";
    AuditAction["DOCUMENT_ACCESSED"] = "DOCUMENT_ACCESSED";
    AuditAction["DOCUMENT_DELETED"] = "DOCUMENT_DELETED";
    // Property operations
    AuditAction["PROPERTY_CREATED"] = "PROPERTY_CREATED";
    AuditAction["PROPERTY_ACCESSED"] = "PROPERTY_ACCESSED";
    AuditAction["PROPERTY_DELETED"] = "PROPERTY_DELETED";
    // Admin operations
    AuditAction["USER_ROLE_CHANGED"] = "USER_ROLE_CHANGED";
    AuditAction["USER_DEACTIVATED"] = "USER_DEACTIVATED";
    AuditAction["USER_REACTIVATED"] = "USER_REACTIVATED";
    AuditAction["USER_DELETED"] = "USER_DELETED";
    AuditAction["UPDATE_USER_ROLE"] = "UPDATE_USER_ROLE";
    AuditAction["UPDATE_USER_ROLE_DENIED"] = "UPDATE_USER_ROLE_DENIED";
    AuditAction["DEACTIVATE_USER"] = "DEACTIVATE_USER";
    AuditAction["DEACTIVATE_USER_DENIED"] = "DEACTIVATE_USER_DENIED";
    AuditAction["LIST_USERS"] = "LIST_USERS";
    AuditAction["LIST_USERS_DENIED"] = "LIST_USERS_DENIED";
    // Data access
    AuditAction["REPORT_GENERATED"] = "REPORT_GENERATED";
    AuditAction["LINEAGE_ACCESSED"] = "LINEAGE_ACCESSED";
    AuditAction["TRUST_SCORE_ACCESSED"] = "TRUST_SCORE_ACCESSED";
    AuditAction["AUDIT_LOGS_ACCESSED"] = "AUDIT_LOGS_ACCESSED";
    AuditAction["AUDIT_LOGS_EXPORTED"] = "AUDIT_LOGS_EXPORTED";
    AuditAction["DATA_EXPORTED"] = "DATA_EXPORTED";
})(AuditAction || (exports.AuditAction = AuditAction = {}));
/**
 * Resource types for audit logging
 */
var ResourceType;
(function (ResourceType) {
    ResourceType["USER"] = "USER";
    ResourceType["PROPERTY"] = "PROPERTY";
    ResourceType["DOCUMENT"] = "DOCUMENT";
    ResourceType["AUDIT_LOG"] = "AUDIT_LOG";
    ResourceType["REPORT"] = "REPORT";
})(ResourceType || (exports.ResourceType = ResourceType = {}));
/**
 * Create an audit log entry in DynamoDB
 *
 * @param params - Audit log parameters
 * @returns Promise resolving to the created log entry
 */
async function createAuditLog(params) {
    const logEntry = {
        logId: (0, uuid_1.v4)(),
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
    try {
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: AUDIT_LOGS_TABLE,
            Item: logEntry,
        }));
        console.log('Audit log created:', {
            logId: logEntry.logId,
            action: logEntry.action,
            userId: logEntry.userId,
            resourceType: logEntry.resourceType,
        });
        return logEntry;
    }
    catch (error) {
        console.error('Failed to create audit log:', error);
        // Don't throw - audit logging should not break the main operation
        throw error;
    }
}
/**
 * Helper function to extract IP address from API Gateway event
 */
function extractIpAddress(event) {
    return event.requestContext?.identity?.sourceIp;
}
/**
 * Helper function to extract user agent from API Gateway event
 */
function extractUserAgent(event) {
    return event.requestContext?.identity?.userAgent;
}
/**
 * Helper function to extract request ID from API Gateway event
 */
function extractRequestId(event) {
    return event.requestContext?.requestId;
}
/**
 * Helper function to extract user ID from API Gateway event
 */
function extractUserId(event) {
    return event.requestContext?.authorizer?.claims?.sub;
}
/**
 * Alias for createAuditLog for backward compatibility
 */
exports.logAuditEvent = createAuditLog;
//# sourceMappingURL=logger.js.map