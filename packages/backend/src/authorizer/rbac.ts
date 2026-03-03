/**
 * Role-Based Access Control (RBAC) utilities
 * 
 * This module provides utilities for enforcing role-based access control
 * in Lambda functions that are protected by the Lambda authorizer.
 */

export enum UserRole {
  STANDARD_USER = 'Standard_User',
  PROFESSIONAL_USER = 'Professional_User',
  ADMIN_USER = 'Admin_User',
}

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
export function hasRole(userRole: string, requiredRole: UserRole): boolean {
  return userRole === requiredRole;
}

/**
 * Check if a user has at least the required role level
 * (e.g., Admin has Professional and Standard permissions)
 */
export function hasMinimumRole(userRole: string, minimumRole: UserRole): boolean {
  const userRoleIndex = ROLE_HIERARCHY.indexOf(userRole as UserRole);
  const minimumRoleIndex = ROLE_HIERARCHY.indexOf(minimumRole);
  
  if (userRoleIndex === -1) {
    return false; // Invalid role
  }
  
  return userRoleIndex >= minimumRoleIndex;
}

/**
 * Check if a user is a Standard User
 */
export function isStandardUser(userRole: string): boolean {
  return hasRole(userRole, UserRole.STANDARD_USER);
}

/**
 * Check if a user is a Professional User or higher
 */
export function isProfessionalUser(userRole: string): boolean {
  return hasMinimumRole(userRole, UserRole.PROFESSIONAL_USER);
}

/**
 * Check if a user is an Admin User
 */
export function isAdminUser(userRole: string): boolean {
  return hasRole(userRole, UserRole.ADMIN_USER);
}

/**
 * Enforce role requirement - throws error if user doesn't have required role
 */
export function requireRole(userRole: string, requiredRole: UserRole): void {
  if (!hasRole(userRole, requiredRole)) {
    throw new Error(`Access denied. Required role: ${requiredRole}`);
  }
}

/**
 * Enforce minimum role requirement - throws error if user doesn't meet minimum role
 */
export function requireMinimumRole(userRole: string, minimumRole: UserRole): void {
  if (!hasMinimumRole(userRole, minimumRole)) {
    throw new Error(`Access denied. Minimum required role: ${minimumRole}`);
  }
}

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
export function getUserContext(requestContext: any): UserContext {
  const authorizer = requestContext.authorizer;
  
  if (!authorizer) {
    throw new Error('No authorizer context found');
  }
  
  return {
    userId: authorizer.userId,
    email: authorizer.email,
    role: authorizer.role as UserRole,
  };
}
