import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActions,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Box,
  Chip,
  CircularProgress,
  Alert,
  Pagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  Divider,
  Autocomplete,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  TrendingUp as TrendingUpIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import propertyService, { Property, AggregateStats } from '../services/property';
import authService from '../services/auth';
import TrustScoreGauge from '../components/TrustScoreGauge';
import BulkOperations from '../components/BulkOperations';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [createDialog, setCreateDialog] = useState(false);
  const [newProperty, setNewProperty] = useState({ 
    address: '', 
    surveyNumber: '', 
    clientName: '', 
    clientId: '' 
  });
  const [clients, setClients] = useState<{ clientId: string; clientName: string }[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [isProfessional, setIsProfessional] = useState(false);
  const [bulkOperationsOpen, setBulkOperationsOpen] = useState(false);
  const limit = 12;

  useEffect(() => {
    const user = authService.getCurrentUser();
    const professional = user?.role === 'Professional_User';
    setIsProfessional(professional);
    
    if (professional) {
      loadClients();
      loadStats();
    }
    
    loadProperties();
  }, [page, statusFilter, search, clientFilter]);

  const loadProperties = async () => {
    setLoading(true);
    setError('');

    try {
      const filters: any = { page, limit };
      if (statusFilter) filters.status = statusFilter;
      if (search) filters.search = search;
      if (clientFilter) filters.clientId = clientFilter;

      const data = await propertyService.getProperties(filters);
      setProperties(data.properties);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load properties');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      const clientList = await propertyService.getClients();
      setClients(clientList);
    } catch (err: any) {
      console.error('Failed to load clients:', err);
    }
  };

  const loadStats = async () => {
    try {
      const aggregateStats = await propertyService.getAggregateStats();
      setStats(aggregateStats);
    } catch (err: any) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleCreateProperty = async () => {
    try {
      const propertyData: any = {
        address: newProperty.address,
        surveyNumber: newProperty.surveyNumber,
      };
      
      if (isProfessional && newProperty.clientName) {
        propertyData.clientName = newProperty.clientName;
        propertyData.clientId = newProperty.clientId;
      }
      
      const property = await propertyService.createProperty(propertyData);
      setCreateDialog(false);
      setNewProperty({ address: '', surveyNumber: '', clientName: '', clientId: '' });
      navigate(`/properties/${property.propertyId}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create property');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'processing':
        return 'info';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">Property Dashboard</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {isProfessional && (
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setBulkOperationsOpen(true)}
              >
                Bulk Operations
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialog(true)}
            >
              New Property
            </Button>
          </Box>
        </Box>

        {/* Professional User Statistics */}
        {isProfessional && stats && (
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <AssessmentIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Total Properties
                  </Typography>
                </Box>
                <Typography variant="h4">{stats.totalProperties}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="subtitle2" color="text.secondary">
                    Average Trust Score
                  </Typography>
                </Box>
                <Typography variant="h4">{stats.averageTrustScore.toFixed(1)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Completed
                </Typography>
                <Typography variant="h4" color="success.main">
                  {stats.completedProperties}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Processing
                </Typography>
                <Typography variant="h4" color="info.main">
                  {stats.processingProperties}
                </Typography>
              </Paper>
            </Grid>
          </Grid>
        )}

        {/* Client Statistics for Professional Users */}
        {isProfessional && stats && stats.byClient.length > 0 && (
          <Paper sx={{ p: 2, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Statistics by Client
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              {stats.byClient.map((client) => (
                <Grid item xs={12} sm={6} md={4} key={client.clientId}>
                  <Box sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                      {client.clientName}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Properties:
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {client.propertyCount}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        Avg Trust Score:
                      </Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {client.averageTrustScore.toFixed(1)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        )}

        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={isProfessional ? 4 : 6}>
            <TextField
              fullWidth
              placeholder="Search by address, survey number, or owner"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
          </Grid>
          <Grid item xs={12} md={isProfessional ? 3 : 3}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {isProfessional && (
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Client</InputLabel>
                <Select
                  value={clientFilter}
                  label="Client"
                  onChange={(e) => setClientFilter(e.target.value)}
                >
                  <MenuItem value="">All Clients</MenuItem>
                  {clients.map((client) => (
                    <MenuItem key={client.clientId} value={client.clientId}>
                      {client.clientName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        ) : properties.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography variant="h6" color="text.secondary">
              No properties found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Create your first property verification to get started
            </Typography>
          </Box>
        ) : (
          <>
            <Grid container spacing={3}>
              {properties.map((property) => (
                <Grid item xs={12} sm={6} md={4} key={property.propertyId}>
                  <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Chip
                          label={property.status}
                          color={getStatusColor(property.status)}
                          size="small"
                        />
                        {property.trustScore !== undefined && (
                          <TrustScoreGauge score={property.trustScore} size="small" />
                        )}
                      </Box>

                      {isProfessional && property.clientName && (
                        <Chip
                          label={property.clientName}
                          size="small"
                          variant="outlined"
                          sx={{ mb: 1 }}
                        />
                      )}

                      <Typography variant="h6" gutterBottom noWrap>
                        {property.address}
                      </Typography>

                      {property.surveyNumber && (
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          Survey No: {property.surveyNumber}
                        </Typography>
                      )}

                      <Typography variant="body2" color="text.secondary">
                        Documents: {property.documentCount}
                      </Typography>

                      <Typography variant="caption" color="text.secondary">
                        Created: {new Date(property.createdAt).toLocaleDateString()}
                      </Typography>
                    </CardContent>

                    <CardActions>
                      <Button
                        size="small"
                        onClick={() => navigate(`/properties/${property.propertyId}`)}
                      >
                        View Details
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              ))}
            </Grid>

            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <Pagination
                  count={totalPages}
                  page={page}
                  onChange={(_, value) => setPage(value)}
                  color="primary"
                />
              </Box>
            )}
          </>
        )}
      </Box>

      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Property Verification</DialogTitle>
        <DialogContent>
          {isProfessional && (
            <Autocomplete
              freeSolo
              options={clients.map((c) => c.clientName)}
              value={newProperty.clientName}
              onChange={(_, value) => {
                const client = clients.find((c) => c.clientName === value);
                setNewProperty({
                  ...newProperty,
                  clientName: value || '',
                  clientId: client?.clientId || '',
                });
              }}
              onInputChange={(_, value) => {
                setNewProperty({
                  ...newProperty,
                  clientName: value,
                  clientId: '',
                });
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Client Name"
                  required
                  sx={{ mt: 2, mb: 2 }}
                  helperText="Select existing client or enter new client name"
                />
              )}
            />
          )}
          <TextField
            fullWidth
            label="Property Address"
            value={newProperty.address}
            onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
            required
            sx={{ mt: isProfessional ? 0 : 2, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Survey Number (Optional)"
            value={newProperty.surveyNumber}
            onChange={(e) => setNewProperty({ ...newProperty, surveyNumber: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
          <Button
            onClick={handleCreateProperty}
            variant="contained"
            disabled={!newProperty.address || (isProfessional && !newProperty.clientName)}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Operations Dialog */}
      <BulkOperations
        open={bulkOperationsOpen}
        onClose={() => setBulkOperationsOpen(false)}
        onComplete={() => {
          loadProperties();
          if (isProfessional) {
            loadStats();
          }
        }}
      />
    </Container>
  );
};

export default Dashboard;
