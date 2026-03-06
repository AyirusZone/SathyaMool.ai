import { describe, it, expect, beforeEach, vi } from 'vitest';
import authService from '../auth';

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCurrentUser', () => {
    it('returns null when no user is stored', () => {
      expect(authService.getCurrentUser()).toBeNull();
    });

    it('returns user when stored in localStorage', () => {
      const user = {
        userId: '123',
        email: 'test@example.com',
        role: 'Standard_User' as const,
      };
      localStorage.setItem('user', JSON.stringify(user));
      expect(authService.getCurrentUser()).toEqual(user);
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token is stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('returns true when token is stored', () => {
      localStorage.setItem('accessToken', 'test-token');
      expect(authService.isAuthenticated()).toBe(true);
    });
  });

  describe('hasRole', () => {
    it('returns false when no user is stored', () => {
      expect(authService.hasRole('Admin_User')).toBe(false);
    });

    it('returns true when user has the specified role', () => {
      const user = {
        userId: '123',
        email: 'admin@example.com',
        role: 'Admin_User' as const,
      };
      localStorage.setItem('user', JSON.stringify(user));
      expect(authService.hasRole('Admin_User')).toBe(true);
    });

    it('returns false when user has a different role', () => {
      const user = {
        userId: '123',
        email: 'user@example.com',
        role: 'Standard_User' as const,
      };
      localStorage.setItem('user', JSON.stringify(user));
      expect(authService.hasRole('Admin_User')).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears all auth data from localStorage', () => {
      localStorage.setItem('accessToken', 'test-token');
      localStorage.setItem('refreshToken', 'test-refresh');
      localStorage.setItem('user', JSON.stringify({ userId: '123' }));

      authService.logout();

      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
    });
  });
});
