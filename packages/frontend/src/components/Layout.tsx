import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Menu,
  MenuItem,
  Box,
  Avatar,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  AccountCircle,
  AdminPanelSettings,
} from '@mui/icons-material';
import authService from '../services/auth';
import notificationService, { Notification } from '../services/notification';

const Layout: React.FC = () => {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [notifAnchorEl, setNotifAnchorEl] = useState<null | HTMLElement>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const user = authService.getCurrentUser();

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadNotifications = async () => {
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      // Don't throw - just log the error and continue
      setNotifications([]);
    }
  };

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleNotifMenu = (event: React.MouseEvent<HTMLElement>) => {
    setNotifAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotifClose = () => {
    setNotifAnchorEl(null);
  };

  const handleLogout = () => {
    authService.logout();
    navigate('/login');
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
      await notificationService.markAsRead(notification.notificationId);
      loadNotifications();
    }
    if (notification.propertyId) {
      navigate(`/properties/${notification.propertyId}`);
    }
    handleNotifClose();
  };

  const unreadCount = notificationService.getUnreadCount(notifications);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', color: 'text.primary' }}>
        <Toolbar>
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, cursor: 'pointer' }}
            onClick={() => navigate('/dashboard')}
          >
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: 1.5,
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography variant="body2" fontWeight={800} color="white" sx={{ fontSize: 14 }}>S</Typography>
            </Box>
            <Typography variant="h6" fontWeight={700} color="text.primary">
              SatyaMool
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5, mt: 0.5 }}>
              Property Intelligence
            </Typography>
          </Box>

          {user?.role === 'Admin_User' && (
            <IconButton
              color="inherit"
              onClick={() => navigate('/admin')}
              sx={{ mr: 2 }}
            >
              <AdminPanelSettings />
            </IconButton>
          )}

          <IconButton color="inherit" onClick={handleNotifMenu}>
            <Badge badgeContent={unreadCount} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          <IconButton onClick={handleMenu} color="inherit">
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              {user?.email?.[0]?.toUpperCase() || user?.phoneNumber?.[0] || 'U'}
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem disabled>
              <Typography variant="body2">
                {user?.email || user?.phoneNumber}
              </Typography>
            </MenuItem>
            <MenuItem disabled>
              <Typography variant="caption" color="text.secondary">
                {user?.role}
              </Typography>
            </MenuItem>
            <MenuItem onClick={handleLogout}>Logout</MenuItem>
          </Menu>

          <Menu
            anchorEl={notifAnchorEl}
            open={Boolean(notifAnchorEl)}
            onClose={handleNotifClose}
            PaperProps={{
              sx: { width: 320, maxHeight: 400 },
            }}
          >
            {notifications.length === 0 ? (
              <MenuItem disabled>
                <Typography variant="body2">No notifications</Typography>
              </MenuItem>
            ) : (
              notifications.map((notification) => (
                <MenuItem
                  key={notification.notificationId}
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    bgcolor: notification.read ? 'transparent' : 'action.hover',
                    whiteSpace: 'normal',
                    py: 1.5,
                  }}
                >
                  <Box>
                    <Typography variant="subtitle2">{notification.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {notification.message}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(notification.createdAt).toLocaleString()}
                    </Typography>
                  </Box>
                </MenuItem>
              ))
            )}
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ flexGrow: 1, p: 3, bgcolor: '#f8f9fb' }}>
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
