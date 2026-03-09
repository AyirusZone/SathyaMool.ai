/**
 * Role-Based Access Control (RBAC) utilities
 *
 * This module provides utilities for enforcing role-based access control
 * in Lambda functions that are protected by the Lambda authorizer.
 */
export declare enum UserRole {
    STANDARD_USER = "Standard_User",
    PROFESSIONAL_USER = "Professional_User",
    ADMIN_USER = "Admin_User"
}
/**
 * Check if a user has a specific role
 */
export declare function hasRole(userRole: string, requiredRole: UserRole): boolean;
/**
 * Check if a user has at least the required role level
 * (e.g., Admin has Professional and Standard permissions)
 */
export declare function hasMinimumRole(userRole: string, minimumRole: UserRole): boolean;
/**
 * Check if a user is a Standard User
 */
export declare function isStandardUser(userRole: string): boolean;
/**
 * Check if a user is a Professional User or higher
 */
export declare function isProfessionalUser(userRole: string): boolean;
/**
 * Check if a user is an Admin User
 */
export declare function isAdminUser(userRole: string): boolean;
/**
 * Enforce role requirement - throws error if user doesn't have required role
 */
export declare function requireRole(userRole: string, requiredRole: UserRole): void;
/**
 * Enforce minimum role requirement - throws error if user doesn't meet minimum role
 */
export declare function requireMinimumRole(userRole: string, minimumRole: UserRole): void;
/**
 * Extract user context from API Gateway event
 * (populated by Lambda authorizer)
 */
export interface UserContext {
    userId: string;
    email: string;
    role: UserRole;
}
/**
 * Get user context from API Gateway request context
 */
export declare function getUserContext(requestContext: any): UserContext;
