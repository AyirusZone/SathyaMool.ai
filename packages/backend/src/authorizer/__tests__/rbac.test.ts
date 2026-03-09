import {
  UserRole,
  hasRole,
  hasMinimumRole,
  isStandardUser,
  isProfessionalUser,
  isAdminUser,
  requireRole,
  requireMinimumRole,
  getUserContext,
} from '../rbac';

describe('RBAC Utilities', () => {
  describe('hasRole', () => {
    it('should return true when user has exact role', () => {
      expect(hasRole('Standard_User', UserRole.STANDARD_USER)).toBe(true);
      expect(hasRole('Professional_User', UserRole.PROFESSIONAL_USER)).toBe(true);
      expect(hasRole('Admin_User', UserRole.ADMIN_USER)).toBe(true);
    });

    it('should return false when user does not have exact role', () => {
      expect(hasRole('Standard_User', UserRole.ADMIN_USER)).toBe(false);
      expect(hasRole('Professional_User', UserRole.STANDARD_USER)).toBe(false);
      expect(hasRole('Admin_User', UserRole.PROFESSIONAL_USER)).toBe(false);
    });
  });

  describe('hasMinimumRole', () => {
    it('should return true when user has exact minimum role', () => {
      expect(hasMinimumRole('Standard_User', UserRole.STANDARD_USER)).toBe(true);
      expect(hasMinimumRole('Professional_User', UserRole.PROFESSIONAL_USER)).toBe(true);
      expect(hasMinimumRole('Admin_User', UserRole.ADMIN_USER)).toBe(true);
    });

    it('should return true when user has higher role than minimum', () => {
      expect(hasMinimumRole('Professional_User', UserRole.STANDARD_USER)).toBe(true);
      expect(hasMinimumRole('Admin_User', UserRole.STANDARD_USER)).toBe(true);
      expect(hasMinimumRole('Admin_User', UserRole.PROFESSIONAL_USER)).toBe(true);
    });

    it('should return false when user has lower role than minimum', () => {
      expect(hasMinimumRole('Standard_User', UserRole.PROFESSIONAL_USER)).toBe(false);
      expect(hasMinimumRole('Standard_User', UserRole.ADMIN_USER)).toBe(false);
      expect(hasMinimumRole('Professional_User', UserRole.ADMIN_USER)).toBe(false);
    });

    it('should return false for invalid role', () => {
      expect(hasMinimumRole('InvalidRole', UserRole.STANDARD_USER)).toBe(false);
    });
  });

  describe('isStandardUser', () => {
    it('should return true for Standard_User', () => {
      expect(isStandardUser('Standard_User')).toBe(true);
    });

    it('should return false for other roles', () => {
      expect(isStandardUser('Professional_User')).toBe(false);
      expect(isStandardUser('Admin_User')).toBe(false);
    });
  });

  describe('isProfessionalUser', () => {
    it('should return true for Professional_User', () => {
      expect(isProfessionalUser('Professional_User')).toBe(true);
    });

    it('should return true for Admin_User (higher role)', () => {
      expect(isProfessionalUser('Admin_User')).toBe(true);
    });

    it('should return false for Standard_User', () => {
      expect(isProfessionalUser('Standard_User')).toBe(false);
    });
  });

  describe('isAdminUser', () => {
    it('should return true for Admin_User', () => {
      expect(isAdminUser('Admin_User')).toBe(true);
    });

    it('should return false for other roles', () => {
      expect(isAdminUser('Standard_User')).toBe(false);
      expect(isAdminUser('Professional_User')).toBe(false);
    });
  });

  describe('requireRole', () => {
    it('should not throw when user has required role', () => {
      expect(() => requireRole('Standard_User', UserRole.STANDARD_USER)).not.toThrow();
      expect(() => requireRole('Professional_User', UserRole.PROFESSIONAL_USER)).not.toThrow();
      expect(() => requireRole('Admin_User', UserRole.ADMIN_USER)).not.toThrow();
    });

    it('should throw when user does not have required role', () => {
      expect(() => requireRole('Standard_User', UserRole.ADMIN_USER)).toThrow(
        'Access denied. Required role: Admin_User'
      );
      expect(() => requireRole('Professional_User', UserRole.ADMIN_USER)).toThrow(
        'Access denied. Required role: Admin_User'
      );
    });
  });

  describe('requireMinimumRole', () => {
    it('should not throw when user has minimum role', () => {
      expect(() => requireMinimumRole('Standard_User', UserRole.STANDARD_USER)).not.toThrow();
      expect(() => requireMinimumRole('Professional_User', UserRole.STANDARD_USER)).not.toThrow();
      expect(() => requireMinimumRole('Admin_User', UserRole.STANDARD_USER)).not.toThrow();
    });

    it('should not throw when user has higher role than minimum', () => {
      expect(() => requireMinimumRole('Professional_User', UserRole.STANDARD_USER)).not.toThrow();
      expect(() => requireMinimumRole('Admin_User', UserRole.PROFESSIONAL_USER)).not.toThrow();
    });

    it('should throw when user has lower role than minimum', () => {
      expect(() => requireMinimumRole('Standard_User', UserRole.PROFESSIONAL_USER)).toThrow(
        'Access denied. Minimum required role: Professional_User'
      );
      expect(() => requireMinimumRole('Professional_User', UserRole.ADMIN_USER)).toThrow(
        'Access denied. Minimum required role: Admin_User'
      );
    });
  });

  describe('getUserContext', () => {
    it('should extract user context from request context', () => {
      const requestContext = {
        authorizer: {
          userId: 'user-123',
          email: 'user@example.com',
          role: 'Standard_User',
        },
      };

      const context = getUserContext(requestContext);

      expect(context.userId).toBe('user-123');
      expect(context.email).toBe('user@example.com');
      expect(context.role).toBe(UserRole.STANDARD_USER);
    });

    it('should throw when no authorizer context is present', () => {
      const requestContext = {};

      expect(() => getUserContext(requestContext)).toThrow('No authorizer context found');
    });

    it('should extract context for Professional_User', () => {
      const requestContext = {
        authorizer: {
          userId: 'user-456',
          email: 'professional@example.com',
          role: 'Professional_User',
        },
      };

      const context = getUserContext(requestContext);

      expect(context.role).toBe(UserRole.PROFESSIONAL_USER);
    });

    it('should extract context for Admin_User', () => {
      const requestContext = {
        authorizer: {
          userId: 'admin-789',
          email: 'admin@example.com',
          role: 'Admin_User',
        },
      };

      const context = getUserContext(requestContext);

      expect(context.role).toBe(UserRole.ADMIN_USER);
    });
  });
});
