"use strict";
/**
 * Role-Based Access Control (RBAC) utilities
 *
 * This module provides utilities for enforcing role-based access control
 * in Lambda functions that are protected by the Lambda authorizer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRole = void 0;
exports.hasRole = hasRole;
exports.hasMinimumRole = hasMinimumRole;
exports.isStandardUser = isStandardUser;
exports.isProfessionalUser = isProfessionalUser;
exports.isAdminUser = isAdminUser;
exports.requireRole = requireRole;
exports.requireMinimumRole = requireMinimumRole;
exports.getUserContext = getUserContext;
var UserRole;
(function (UserRole) {
    UserRole["STANDARD_USER"] = "Standard_User";
    UserRole["PROFESSIONAL_USER"] = "Professional_User";
    UserRole["ADMIN_USER"] = "Admin_User";
})(UserRole || (exports.UserRole = UserRole = {}));
/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
const ROLE_HIERARCHY = [
    UserRole.STANDARD_USER,
    UserRole.PROFESSIONAL_USER,
    UserRole.ADMIN_USER,
];
/**
 * Check if a user has a specific role
 */
function hasRole(userRole, requiredRole) {
    return userRole === requiredRole;
}
/**
 * Check if a user has at least the required role level
 * (e.g., Admin has Professional and Standard permissions)
 */
function hasMinimumRole(userRole, minimumRole) {
    const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole);
    const minimumRoleIndex = ROLE_HIERARCHY.indexOf(minimumRole);
    if (userRoleIndex === -1) {
        return false; // Invalid role
    }
    return userRoleIndex >= minimumRoleIndex;
}
/**
 * Check if a user is a Standard User
 */
function isStandardUser(userRole) {
    return hasRole(userRole, UserRole.STANDARD_USER);
}
/**
 * Check if a user is a Professional User or higher
 */
function isProfessionalUser(userRole) {
    return hasMinimumRole(userRole, UserRole.PROFESSIONAL_USER);
}
/**
 * Check if a user is an Admin User
 */
function isAdminUser(userRole) {
    return hasRole(userRole, UserRole.ADMIN_USER);
}
/**
 * Enforce role requirement - throws error if user doesn't have required role
 */
function requireRole(userRole, requiredRole) {
    if (!hasRole(userRole, requiredRole)) {
        throw new Error(`Access denied. Required role: ${requiredRole}`);
    }
}
/**
 * Enforce minimum role requirement - throws error if user doesn't meet minimum role
 */
function requireMinimumRole(userRole, minimumRole) {
    if (!hasMinimumRole(userRole, minimumRole)) {
        throw new Error(`Access denied. Minimum required role: ${minimumRole}`);
    }
}
/**
 * Get user context from API Gateway request context
 */
function getUserContext(requestContext) {
    const authorizer = requestContext.authorizer;
    if (!authorizer) {
        throw new Error('No authorizer context found');
    }
    return {
        userId: authorizer.userId,
        email: authorizer.email,
        role: authorizer.role,
    };
}
//# sourceMappingURL=rbac.js.map