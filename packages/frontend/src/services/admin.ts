import api from './api';
import { User } from './auth';

export interface AuditLog {
  logId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp: string;
  ipAddress: string;
  userAgent: string;
}

export interface SystemMetrics {
  totalUsers: number;
  totalProperties: number;
  processingQueueDepth: number;
}

class AdminService {
  async getUsers(): Promise<User[]> {
    const response = await api.get<{ users: User[] }>('/admin/users');
    return response.data.users;
  }

  async updateUserRole(userId: string, role: string): Promise<User> {
    const response = await api.put<User>(`/admin/users/${userId}/role`, { role });
    return response.data;
  }

  async deactivateUser(userId: string): Promise<void> {
    await api.put(`/admin/users/${userId}/deactivate`);
  }

  async getSystemMetrics(): Promise<SystemMetrics> {
    const response = await api.get<SystemMetrics>('/admin/metrics');
    return response.data;
  }

  async getAuditLogs(filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const response = await api.get('/admin/audit-logs', { params: filters });
    return response.data;
  }

  async exportAuditLogs(filters?: {
    userId?: string;
    action?: string;
    resourceType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<string> {
    const response = await api.get<{ exportUrl: string }>('/admin/audit-logs/export', { params: filters });
    return response.data.exportUrl;
  }
}

export default new AdminService();
