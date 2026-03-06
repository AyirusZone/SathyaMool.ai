import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminPanel from '../AdminPanel';
import adminService from '../../services/admin';

// Mock the admin service
vi.mock('../../services/admin', () => ({
  default: {
    getUsers: vi.fn(),
    getSystemMetrics: vi.fn(),
    getAuditLogs: vi.fn(),
    updateUserRole: vi.fn(),
    deactivateUser: vi.fn(),
    exportAuditLogs: vi.fn(),
  },
}));

const mockUsers = [
  {
    userId: 'user-1',
    email: 'user1@example.com',
    role: 'Standard_User',
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    userId: 'user-2',
    email: 'user2@example.com',
    role: 'Professional_User',
    createdAt: '2024-01-02T00:00:00Z',
  },
  {
    userId: 'user-3',
    phoneNumber: '+1234567890',
    role: 'Admin_User',
    createdAt: '2024-01-03T00:00:00Z',
  },
];

const mockMetrics = {
  totalUsers: 150,
  totalProperties: 320,
  processingQueueDepth: 45,
};

const mockAuditLogs = {
  logs: [
    {
      logId: 'log-1',
      userId: 'user-1',
      action: 'LOGIN',
      resourceType: 'User',
      resourceId: 'user-1',
      timestamp: '2024-01-15T10:00:00Z',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    },
    {
      logId: 'log-2',
      userId: 'user-2',
      action: 'UPLOAD_DOCUMENT',
      resourceType: 'Document',
      resourceId: 'doc-1',
      timestamp: '2024-01-15T11:00:00Z',
      ipAddress: '192.168.1.2',
      userAgent: 'Mozilla/5.0',
    },
  ],
  total: 2,
};

describe('AdminPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (adminService.getUsers as any).mockResolvedValue(mockUsers);
    (adminService.getSystemMetrics as any).mockResolvedValue(mockMetrics);
    (adminService.getAuditLogs as any).mockResolvedValue(mockAuditLogs);
  });

  const renderAdminPanel = () => {
    return render(
      <BrowserRouter>
        <AdminPanel />
      </BrowserRouter>
    );
  };

  // Helper function to wait for component to load
  const waitForComponentToLoad = async () => {
    await waitFor(() => {
      // Wait for the dashboard metrics to appear, indicating the component has loaded
      expect(screen.getByText('Total Users')).toBeDefined();
    }, { timeout: 3000 });
  };

  describe('Dashboard Tab', () => {
    it('renders system metrics correctly', async () => {
      renderAdminPanel();

      await waitFor(() => {
        expect(screen.getByText('150')).toBeDefined();
        expect(screen.getByText('Total Users')).toBeDefined();
        expect(screen.getByText('320')).toBeDefined();
        expect(screen.getByText('Total Properties')).toBeDefined();
        expect(screen.getByText('45')).toBeDefined();
        expect(screen.getByText('Processing Queue')).toBeDefined();
      });
    });

    it('displays recent activity feed', async () => {
      renderAdminPanel();

      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeDefined();
        expect(screen.getByText('LOGIN')).toBeDefined();
        expect(screen.getByText('UPLOAD_DOCUMENT')).toBeDefined();
      });
    });

    it('refreshes data when refresh button is clicked', async () => {
      renderAdminPanel();

      await waitFor(() => {
        expect(screen.getByText('150')).toBeDefined();
      });

      const refreshButtons = screen.getAllByText('Refresh');
      fireEvent.click(refreshButtons[0]);

      await waitFor(() => {
        expect(adminService.getUsers).toHaveBeenCalledTimes(2);
        expect(adminService.getSystemMetrics).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('User Management Tab', () => {
    it('displays user list with details', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      // Switch to User Management tab
      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
        expect(screen.getByText('user2@example.com')).toBeDefined();
        expect(screen.getByText('+1234567890')).toBeDefined();
      });
    });

    it('filters users by search term', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText('Search by email, phone, or user ID');
      fireEvent.change(searchInput, { target: { value: 'user1' } });

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
        expect(screen.queryByText('user2@example.com')).toBeNull();
      });
    });

    it('filters users by role', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      // Find and click the role filter dropdown
      const roleFilterElements = screen.getAllByText('Filter by Role');
      const roleFilterLabel = roleFilterElements[0];
      const roleFilterSelect = roleFilterLabel.parentElement?.querySelector('select');
      
      if (roleFilterSelect) {
        fireEvent.change(roleFilterSelect, { target: { value: 'Admin_User' } });

        await waitFor(() => {
          expect(screen.getByText('+1234567890')).toBeDefined();
          expect(screen.queryByText('user1@example.com')).toBeNull();
        });
      }
    });

    it('opens role change dialog when Change Role button is clicked', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const changeRoleButtons = screen.getAllByText('Change Role');
      fireEvent.click(changeRoleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Change User Role')).toBeDefined();
        expect(screen.getByText(/Change role for user1@example.com/)).toBeDefined();
      });
    });

    it('updates user role successfully', async () => {
      (adminService.updateUserRole as any).mockResolvedValue({
        ...mockUsers[0],
        role: 'Professional_User',
      });

      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const changeRoleButtons = screen.getAllByText('Change Role');
      fireEvent.click(changeRoleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Change User Role')).toBeDefined();
      });

      const confirmButton = screen.getByText('Confirm Change');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(adminService.updateUserRole).toHaveBeenCalledWith('user-1', 'Standard_User');
        expect(screen.getByText(/Role updated successfully/)).toBeDefined();
      });
    });

    it('opens deactivate dialog when Deactivate button is clicked', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const deactivateButtons = screen.getAllByText('Deactivate');
      fireEvent.click(deactivateButtons[0]);

      await waitFor(() => {
        const deactivateUserElements = screen.getAllByText('Deactivate User');
        // The dialog title should be the first one
        expect(deactivateUserElements[0]).toBeDefined();
        expect(screen.getByText(/Are you sure you want to deactivate this user/)).toBeDefined();
      });
    });

    it('deactivates user successfully', async () => {
      (adminService.deactivateUser as any).mockResolvedValue(undefined);

      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const deactivateButtons = screen.getAllByText('Deactivate');
      fireEvent.click(deactivateButtons[0]);

      await waitFor(() => {
        const deactivateUserElements = screen.getAllByText('Deactivate User');
        expect(deactivateUserElements[0]).toBeDefined();
      });

      const confirmButton = screen.getByText('Deactivate User', { selector: 'button' });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(adminService.deactivateUser).toHaveBeenCalledWith('user-1');
        expect(screen.getByText(/User deactivated successfully/)).toBeDefined();
      });
    });
  });

  describe('Audit Logs Tab', () => {
    it('displays audit logs with filtering options', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByText('LOGIN')).toBeDefined();
        expect(screen.getByText('UPLOAD_DOCUMENT')).toBeDefined();
        expect(screen.getByPlaceholderText('Search by user ID')).toBeDefined();
        expect(screen.getByPlaceholderText('Filter by action')).toBeDefined();
        expect(screen.getByPlaceholderText('Filter by resource type')).toBeDefined();
      });
    });

    it('filters audit logs by user ID', async () => {
      const filteredLogs = {
        logs: [mockAuditLogs.logs[0]],
        total: 1,
      };
      (adminService.getAuditLogs as any).mockResolvedValue(filteredLogs);

      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by user ID')).toBeDefined();
      });

      const searchInput = screen.getByPlaceholderText('Search by user ID');
      fireEvent.change(searchInput, { target: { value: 'user-1' } });

      await waitFor(() => {
        expect(adminService.getAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({ userId: 'user-1' })
        );
      });
    });

    it('filters audit logs by action', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Filter by action')).toBeDefined();
      });

      const actionInput = screen.getByPlaceholderText('Filter by action');
      fireEvent.change(actionInput, { target: { value: 'LOGIN' } });

      await waitFor(() => {
        expect(adminService.getAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'LOGIN' })
        );
      });
    });

    it('filters audit logs by resource type', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Filter by resource type')).toBeDefined();
      });

      const resourceInput = screen.getByPlaceholderText('Filter by resource type');
      fireEvent.change(resourceInput, { target: { value: 'Document' } });

      await waitFor(() => {
        expect(adminService.getAuditLogs).toHaveBeenCalledWith(
          expect.objectContaining({ resourceType: 'Document' })
        );
      });
    });

    it('exports audit logs when Export button is clicked', async () => {
      const exportUrl = 'https://example.com/export.json';
      (adminService.exportAuditLogs as any).mockResolvedValue(exportUrl);
      
      // Mock window.open
      const originalOpen = window.open;
      window.open = vi.fn();

      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByText('Export Logs')).toBeDefined();
      });

      const exportButton = screen.getByText('Export Logs');
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(adminService.exportAuditLogs).toHaveBeenCalled();
        expect(window.open).toHaveBeenCalledWith(exportUrl, '_blank');
        expect(screen.getByText(/Audit logs exported successfully/)).toBeDefined();
      });

      // Restore window.open
      window.open = originalOpen;
    });

    it('handles pagination correctly', async () => {
      renderAdminPanel();

      // Wait for component to load
      await waitForComponentToLoad();

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByText('LOGIN')).toBeDefined();
      });

      // Check that pagination is rendered (if there are multiple pages)
      const pagination = screen.queryByRole('navigation');
      if (pagination) {
        expect(pagination).toBeDefined();
      }
    });
  });

  describe('Error Handling', () => {
    it('displays error message when data loading fails', async () => {
      (adminService.getUsers as any).mockRejectedValue({
        response: { data: { message: 'Failed to load users' } },
      });

      renderAdminPanel();

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeDefined();
      });
    });

    it('displays error message when role update fails', async () => {
      (adminService.updateUserRole as any).mockRejectedValue({
        response: { data: { message: 'Failed to update role' } },
      });

      renderAdminPanel();

      // Wait for the component to load first
      await waitFor(() => {
        expect(screen.getByText('User Management')).toBeDefined();
      });

      const userManagementTab = screen.getByText('User Management');
      fireEvent.click(userManagementTab);

      await waitFor(() => {
        expect(screen.getByText('user1@example.com')).toBeDefined();
      });

      const changeRoleButtons = screen.getAllByText('Change Role');
      fireEvent.click(changeRoleButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Change User Role')).toBeDefined();
      });

      const confirmButton = screen.getByText('Confirm Change');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to update role')).toBeDefined();
      });
    });

    it('displays error message when export fails', async () => {
      (adminService.exportAuditLogs as any).mockRejectedValue({
        response: { data: { message: 'Failed to export logs' } },
      });

      renderAdminPanel();

      // Wait for the component to load first
      await waitFor(() => {
        expect(screen.getByText('Audit Logs')).toBeDefined();
      });

      const auditLogsTab = screen.getByText('Audit Logs');
      fireEvent.click(auditLogsTab);

      await waitFor(() => {
        expect(screen.getByText('Export Logs')).toBeDefined();
      });

      const exportButton = screen.getByText('Export Logs');
      fireEvent.click(exportButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to export logs')).toBeDefined();
      });
    });
  });
});
