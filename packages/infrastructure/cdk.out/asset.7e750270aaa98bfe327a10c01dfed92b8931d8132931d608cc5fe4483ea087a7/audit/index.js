"use strict";
/**
 * Audit Logging Module
 *
 * Exports audit logging utilities for use across Lambda functions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResourceType = exports.AuditAction = exports.extractUserId = exports.extractRequestId = exports.extractUserAgent = exports.extractIpAddress = exports.createAuditLog = void 0;
var logger_1 = require("./logger");
Object.defineProperty(exports, "createAuditLog", { enumerable: true, get: function () { return logger_1.createAuditLog; } });
Object.defineProperty(exports, "extractIpAddress", { enumerable: true, get: function () { return logger_1.extractIpAddress; } });
Object.defineProperty(exports, "extractUserAgent", { enumerable: true, get: function () { return logger_1.extractUserAgent; } });
Object.defineProperty(exports, "extractRequestId", { enumerable: true, get: function () { return logger_1.extractRequestId; } });
Object.defineProperty(exports, "extractUserId", { enumerable: true, get: function () { return logger_1.extractUserId; } });
Object.defineProperty(exports, "AuditAction", { enumerable: true, get: function () { return logger_1.AuditAction; } });
Object.defineProperty(exports, "ResourceType", { enumerable: true, get: function () { return logger_1.ResourceType; } });
//# sourceMappingURL=index.js.map