"use strict";
/**
 * Admin Module
 *
 * Exports admin-only Lambda handlers for user management, audit log management, and data retention
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupDeactivatedAccounts = exports.exportUserData = exports.exportAuditLogs = exports.searchAuditLogs = exports.deactivateUser = exports.updateUserRole = exports.listUsers = void 0;
var list_users_1 = require("./list-users");
Object.defineProperty(exports, "listUsers", { enumerable: true, get: function () { return list_users_1.handler; } });
var update_user_role_1 = require("./update-user-role");
Object.defineProperty(exports, "updateUserRole", { enumerable: true, get: function () { return update_user_role_1.handler; } });
var deactivate_user_1 = require("./deactivate-user");
Object.defineProperty(exports, "deactivateUser", { enumerable: true, get: function () { return deactivate_user_1.handler; } });
var search_audit_logs_1 = require("./search-audit-logs");
Object.defineProperty(exports, "searchAuditLogs", { enumerable: true, get: function () { return search_audit_logs_1.handler; } });
var export_audit_logs_1 = require("./export-audit-logs");
Object.defineProperty(exports, "exportAuditLogs", { enumerable: true, get: function () { return export_audit_logs_1.handler; } });
var export_user_data_1 = require("./export-user-data");
Object.defineProperty(exports, "exportUserData", { enumerable: true, get: function () { return export_user_data_1.handler; } });
var cleanup_deactivated_accounts_1 = require("./cleanup-deactivated-accounts");
Object.defineProperty(exports, "cleanupDeactivatedAccounts", { enumerable: true, get: function () { return cleanup_deactivated_accounts_1.handler; } });
//# sourceMappingURL=index.js.map