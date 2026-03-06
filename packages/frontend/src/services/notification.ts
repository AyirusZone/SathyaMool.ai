import api from './api';

export interface Notification {
  notificationId: string;
  userId: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  propertyId?: string;
}

class NotificationService {
  async getNotifications(): Promise<Notification[]> {
    const response = await api.get<{ notifications: Notification[] }>('/notifications');
    return response.data.notifications;
  }

  async markAsRead(notificationId: string): Promise<void> {
    await api.put(`/notifications/${notificationId}/read`);
  }

  async markAllAsRead(): Promise<void> {
    await api.put('/notifications/read-all');
  }

  getUnreadCount(notifications: Notification[]): number {
    return notifications.filter(n => !n.read).length;
  }
}

export default new NotificationService();
