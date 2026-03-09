import React, { useState, useEffect } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
  Grid,
  Card,
  CardContent,
  TextField,
  InputAdornment,
  Tabs,
  Tab,
  Pagination,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  People as PeopleIcon,
  Description as DescriptionIcon,
  QueueMusic as QueueIcon,
  Search as SearchIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import adminService, { AuditLog, SystemMetrics } from '../services/admin';
import { User } from '../services/auth';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
};

const AdminPanel: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // User management state
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [roleDialog, setRoleDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [deactivateDialog, setDeactivateDialog] = useState<{ open: boolean; user: User | null }>({
    open: false,
    user: null,
  });
  const [newRole, setNewRole] = useState('');

  // Audit log state
  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('');
  const [logResourceFilter, setLogResourceFilter] = useState('');
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const logsPerPage = 20;

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, userSearch, roleFilter]);

  useEffect(() => {
    loadAuditLogs();
  }, [logPage, logSearch, logActionFilter, logResourceFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, metricsData] = await Promise.all([
        adminService.getUsers(),
        adminService.getSystemMetrics(),
      ]);
      setUsers(usersData);
      setMetrics(metricsData);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logsData = await adminService.getAuditLogs({
        userId: logSearch || undefined,
        action: logActionFilter || undefined,
        resourceType: logResourceFilter || undefined,
        page: logPage,
        limit: logsPerPage,
      });
      setAuditLogs(logsData.logs);
      setLogTotal(logsData.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load audit logs');
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (userSearch) {
      const search = userSearch.toLowerCase();
      filtered = filtered.filter(
        (user) =>
          user.email?.toLowerCase().includes(search) ||
          user.phoneNumber?.includes(search) ||
          user.userId.toLowerCase().includes(search)
      );
    }

    if (roleFilter !== 'all') {
      filtered = filtered.filter((user) => user.role === roleFilter);
    }

    setFilteredUsers(filtered);
  };

  const handleRoleChange = async () => {
    if (!roleDialog.user) return;

    try {
      await adminService.updateUserRole(roleDialog.user.userId, newRole);
      setSuccess(`Role updated successfully for ${roleDialog.user.email || roleDialog.user.phoneNumber}`);
      setRoleDialog({ open: false, user: null });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update role');
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateDialog.user) return;

    try {
      await adminService.deactivateUser(deactivateDialog.user.userId);
      setSuccess(`User deactivated successfully`);
      setDeactivateDialog({ open: false, user: null });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to deactivate user');
    }
  };

  const handleExportLogs = async () => {
    try {
      const exportUrl = await adminService.exportAuditLogs({
        userId: logSearch || undefined,
        action: logActionFilter || undefined,
        resourceType: logResourceFilter || undefined,
      });
      window.open(exportUrl, '_blank');
      setSuccess('Audit logs exported successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to export logs');
    }
  };

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Admin Panel
        </Typography>
        <Typography variant="body2" color="text.secondary">
          System administration and monitoring
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} sx={{ mb: 3 }}>
        <Tab label="Dashboard" />
        <Tab label="User Management" />
        <Tab label="Audit Logs" />
      </Tabs>

      {/* Dashboard Tab */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <PeopleIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
                  <Box>
                    <Typography variant="h4">{metrics?.totalUsers || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Users
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <DescriptionIcon sx={{ fontSize: 40, color: 'success.main', mr: 2 }} />
                  <Box>
                    <Typography variant="h4">{metrics?.totalProperties || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Properties
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <QueueIcon sx={{ fontSize: 40, color: 'warning.main', mr: 2 }} />
                  <Box>
                    <Typography variant="h4">{metrics?.processingQueueDepth || 0}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Processing Queue
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Recent Activity</Typography>
            <Button startIcon={<RefreshIcon />} onClick={loadData}>
              Refresh
            </Button>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Resource</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.slice(0, 10).map((log) => (
                  <TableRow key={log.logId}>
                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{log.userId.substring(0, 8)}...</TableCell>
                    <TableCell>
                      <Chip label={log.action} size="small" />
                    </TableCell>
                    <TableCell>
                      {log.resourceType}: {log.resourceId.substring(0, 8)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </TabPanel>

      {/* User Management Tab */}
      <TabPanel value={tabValue} index={1}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">User Management</Typography>
            <Button startIcon={<RefreshIcon />} onClick={loadData}>
              Refresh
            </Button>
          </Box>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                placeholder="Search by email, phone, or user ID"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Filter by Role</InputLabel>
                <Select
                  value={roleFilter}
                  label="Filter by Role"
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="Standard_User">Standard User</MenuItem>
                  <MenuItem value="Professional_User">Professional User</MenuItem>
                  <MenuItem value="Admin_User">Admin User</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>User ID</TableCell>
                  <TableCell>Email/Phone</TableCell>
                  <TableCell>Role</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Registered</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {user.userId.substring(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>{user.email || user.phoneNumber}</TableCell>
                    <TableCell>
                      <Chip
                        label={user.role.replace('_', ' ')}
                        size="small"
                        color={
                          user.role === 'Admin_User'
                            ? 'error'
                            : user.role === 'Professional_User'
                            ? 'primary'
                            : 'default'
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label="Active" color="success" size="small" />
                    </TableCell>
                    <TableCell>
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => {
                          setRoleDialog({ open: true, user });
                          setNewRole(user.role);
                        }}
                        sx={{ mr: 1 }}
                      >
                        Change Role
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => setDeactivateDialog({ open: true, user })}
                      >
                        Deactivate
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {filteredUsers.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">No users found</Typography>
            </Box>
          )}
        </Paper>
      </TabPanel>

      {/* Audit Logs Tab */}
      <TabPanel value={tabValue} index={2}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h6">Audit Logs</Typography>
            <Button startIcon={<DownloadIcon />} onClick={handleExportLogs}>
              Export Logs
            </Button>
          </Box>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Search by user ID"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Filter by action"
                value={logActionFilter}
                onChange={(e) => setLogActionFilter(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                placeholder="Filter by resource type"
                value={logResourceFilter}
                onChange={(e) => setLogResourceFilter(e.target.value)}
              />
            </Grid>
          </Grid>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>User ID</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Resource</TableCell>
                  <TableCell>IP Address</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditLogs.map((log) => (
                  <TableRow key={log.logId}>
                    <TableCell>{new Date(log.timestamp).toLocaleString()}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {log.userId.substring(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={log.action} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {log.resourceType}: {log.resourceId.substring(0, 12)}...
                      </Typography>
                    </TableCell>
                    <TableCell>{log.ipAddress}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {auditLogs.length === 0 && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">No audit logs found</Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={Math.ceil(logTotal / logsPerPage)}
              page={logPage}
              onChange={(_, page) => setLogPage(page)}
              color="primary"
            />
          </Box>
        </Paper>
      </TabPanel>

      {/* Role Change Dialog */}
      <Dialog open={roleDialog.open} onClose={() => setRoleDialog({ open: false, user: null })}>
        <DialogTitle>Change User Role</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Change role for {roleDialog.user?.email || roleDialog.user?.phoneNumber}
          </Typography>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Role</InputLabel>
            <Select
              value={newRole}
              label="Role"
              onChange={(e) => setNewRole(e.target.value)}
            >
              <MenuItem value="Standard_User">Standard User</MenuItem>
              <MenuItem value="Professional_User">Professional User</MenuItem>
              <MenuItem value="Admin_User">Admin User</MenuItem>
            </Select>
          </FormControl>
          <Alert severity="warning" sx={{ mt: 2 }}>
            Changing a user's role will immediately affect their access permissions.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleDialog({ open: false, user: null })}>Cancel</Button>
          <Button onClick={handleRoleChange} variant="contained" color="primary">
            Confirm Change
          </Button>
        </DialogActions>
      </Dialog>

      {/* Deactivate User Dialog */}
      <Dialog
        open={deactivateDialog.open}
        onClose={() => setDeactivateDialog({ open: false, user: null })}
      >
        <DialogTitle>Deactivate User</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Are you sure you want to deactivate this user?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            User: {deactivateDialog.user?.email || deactivateDialog.user?.phoneNumber}
          </Typography>
          <Alert severity="error" sx={{ mt: 2 }}>
            This action will immediately revoke the user's access to the system. The user's data
            will be retained for 30 days before permanent deletion.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeactivateDialog({ open: false, user: null })}>Cancel</Button>
          <Button onClick={handleDeactivate} variant="contained" color="error">
            Deactivate User
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default AdminPanel;
