/**
 * Admin Module
 * 
 * Exports admin-only Lambda handlers for user management, audit log management, and data retention
 */

export { handler as listUsers } from './list-users';
export { handler as updateUserRole } from './update-user-role';
export { handler as deactivateUser } from './deactivate-user';
export { handler as searchAuditLogs } from './search-audit-logs';
export { handler as exportAuditLogs } from './export-audit-logs';
export { handler as exportUserData } from './export-user-data';
export { handler as cleanupDeactivatedAccounts } from './cleanup-deactivated-accounts';
