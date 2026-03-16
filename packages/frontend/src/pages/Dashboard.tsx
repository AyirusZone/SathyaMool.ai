import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  CardActionArea,
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
  Autocomplete,
  LinearProgress,
  Stack,
  Tooltip,
  Fade,
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  HomeWork as HomeWorkIcon,
  VerifiedUser as VerifiedUserIcon,
  HourglassEmpty as HourglassEmptyIcon,
  ErrorOutline as ErrorOutlineIcon,
  Description as DescriptionIcon,
  ArrowForward as ArrowForwardIcon,
  Shield as ShieldIcon,
  Apartment as ApartmentIcon,
} from '@mui/icons-material';
import propertyService, { Property, AggregateStats } from '../services/property';
import authService from '../services/auth';
import TrustScoreGauge from '../components/TrustScoreGauge';
import BulkOperations from '../components/BulkOperations';

const STATUS_CONFIG: Record<string, { color: 'success' | 'info' | 'error' | 'warning' | 'default'; label: string; icon: React.ReactNode }> = {
  completed:  { color: 'success', label: 'Verified',    icon: <VerifiedUserIcon sx={{ fontSize: 14 }} /> },
  processing: { color: 'info',    label: 'Processing',  icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
  failed:     { color: 'error',   label: 'Failed',      icon: <ErrorOutlineIcon sx={{ fontSize: 14 }} /> },
  pending:    { color: 'warning', label: 'Pending',     icon: <HourglassEmptyIcon sx={{ fontSize: 14 }} /> },
};

const getTrustColor = (score: number | null | undefined) => {
  if (score == null) return '#9e9e9e';
  if (score >= 75) return '#4caf50';
  if (score >= 50) return '#ff9800';
  return '#f44336';
};

const StatCard: React.FC<{ icon: React.ReactNode; label: string; value: string | number; color: string; sub?: string }> = ({ icon, label, value, color, sub }) => (
  <Paper
    elevation={0}
    sx={{
      p: 2.5,
      borderRadius: 3,
      border: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      alignItems: 'center',
      gap: 2,
      height: '100%',
    }}
  >
    <Box
      sx={{
        width: 48,
        height: 48,
        borderRadius: 2,
        bgcolor: `${color}18`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color,
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
    <Box>
      <Typography variant="h5" fontWeight={700} lineHeight={1.2}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" fontWeight={500}>
        {label}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.disabled">
          {sub}
        </Typography>
      )}
    </Box>
  </Paper>
);

const EmptyState: React.FC<{ onAdd: () => void }> = ({ onAdd }) => (
  <Box
    sx={{
      textAlign: 'center',
      py: 10,
      px: 4,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}
  >
    <Box
      sx={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        bgcolor: 'primary.main',
        opacity: 0.08,
        position: 'absolute',
      }}
    />
    <ApartmentIcon sx={{ fontSize: 56, color: 'primary.main', opacity: 0.4 }} />
    <Typography variant="h5" fontWeight={600} color="text.primary">
      No properties yet
    </Typography>
    <Typography variant="body1" color="text.secondary" maxWidth={400}>
      Add your first property to start verifying ownership documents, building lineage graphs, and generating trust scores.
    </Typography>
    <Button
      variant="contained"
      size="large"
      startIcon={<AddIcon />}
      onClick={onAdd}
      sx={{ mt: 1, borderRadius: 2, px: 4 }}
    >
      Add First Property
    </Button>
  </Box>
);

const PropertyCard: React.FC<{ property: Property; onClick: () => void }> = ({ property, onClick }) => {
  const cfg = STATUS_CONFIG[property.status] ?? STATUS_CONFIG.pending;
  const trustColor = getTrustColor(property.trustScore);
  const progress = property.documentCount > 0
    ? Math.round((property.documentCount / property.documentCount) * 100)
    : 0;

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 3,
        transition: 'all 0.2s ease',
        '&:hover': {
          borderColor: 'primary.main',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', p: 0 }}>
        {/* Top accent bar based on status */}
        <Box
          sx={{
            height: 4,
            borderRadius: '12px 12px 0 0',
            bgcolor: cfg.color === 'success' ? 'success.main'
              : cfg.color === 'info' ? 'info.main'
              : cfg.color === 'error' ? 'error.main'
              : 'warning.main',
          }}
        />

        <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
          {/* Header row */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Chip
              icon={cfg.icon}
              label={cfg.label}
              color={cfg.color}
              size="small"
              sx={{ fontWeight: 600, fontSize: '0.7rem' }}
            />
            {property.trustScore != null ? (
              <Tooltip title={`Trust Score: ${property.trustScore}/100`}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShieldIcon sx={{ fontSize: 16, color: trustColor }} />
                  <Typography variant="body2" fontWeight={700} sx={{ color: trustColor }}>
                    {property.trustScore}
                  </Typography>
                </Box>
              </Tooltip>
            ) : (
              <Tooltip title="Trust score pending">
                <ShieldIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </Tooltip>
            )}
          </Box>

          {/* Address */}
          <Typography
            variant="subtitle1"
            fontWeight={600}
            gutterBottom
            sx={{
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.4,
              minHeight: '2.8em',
            }}
          >
            {property.address || 'Untitled Property'}
          </Typography>

          {/* Survey number */}
          {property.surveyNumber && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Survey No: {property.surveyNumber}
            </Typography>
          )}

          {/* Divider */}
          <Box sx={{ borderTop: '1px solid', borderColor: 'divider', my: 1.5 }} />

          {/* Footer meta */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <DescriptionIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
              <Typography variant="caption" color="text.secondary">
                {property.documentCount ?? 0} doc{property.documentCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.disabled">
              {new Date(property.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Typography>
          </Box>

          {/* Processing progress bar */}
          {property.status === 'processing' && (
            <LinearProgress
              sx={{ mt: 1.5, borderRadius: 1, height: 3 }}
              color="info"
            />
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

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
  const [newProperty, setNewProperty] = useState({ address: '', surveyNumber: '', clientName: '', clientId: '' });
  const [clients, setClients] = useState<{ clientId: string; clientName: string }[]>([]);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [isProfessional, setIsProfessional] = useState(false);
  const [bulkOperationsOpen, setBulkOperationsOpen] = useState(false);
  const limit = 12;

  const user = authService.getCurrentUser();

  useEffect(() => {
    const professional = user?.role === 'Professional_User';
    setIsProfessional(professional);
    if (professional) { loadClients(); loadStats(); }
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
    try { setClients(await propertyService.getClients()); } catch {}
  };

  const loadStats = async () => {
    try { setStats(await propertyService.getAggregateStats()); } catch {}
  };

  const handleCreateProperty = async () => {
    try {
      const propertyData: any = { address: newProperty.address, surveyNumber: newProperty.surveyNumber };
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

  const totalPages = Math.ceil(total / limit);
  const completedCount = properties.filter(p => p.status === 'completed').length;
  const processingCount = properties.filter(p => p.status === 'processing').length;
  const avgScore = properties.filter(p => p.trustScore != null).length > 0
    ? Math.round(properties.filter(p => p.trustScore != null).reduce((s, p) => s + (p.trustScore ?? 0), 0) / properties.filter(p => p.trustScore != null).length)
    : null;

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      {/* Page header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Property Intelligence
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Verify ownership, analyse documents, and build trust scores for your properties.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {isProfessional && (
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setBulkOperationsOpen(true)} sx={{ borderRadius: 2 }}>
              Bulk Import
            </Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialog(true)} sx={{ borderRadius: 2 }}>
            New Property
          </Button>
        </Stack>
      </Box>

      {/* Stats row */}
      {!loading && properties.length > 0 && (
        <Fade in>
          <Grid container spacing={2} sx={{ mb: 4 }}>
            <Grid item xs={6} sm={3}>
              <StatCard icon={<HomeWorkIcon />} label="Total Properties" value={total} color="#1976d2" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard icon={<VerifiedUserIcon />} label="Verified" value={completedCount} color="#4caf50" sub="fully processed" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard icon={<HourglassEmptyIcon />} label="Processing" value={processingCount} color="#ff9800" sub="in pipeline" />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatCard
                icon={<ShieldIcon />}
                label="Avg Trust Score"
                value={avgScore != null ? `${avgScore}/100` : '—'}
                color={avgScore != null ? getTrustColor(avgScore) : '#9e9e9e'}
                sub="across verified"
              />
            </Grid>
          </Grid>
        </Fade>
      )}

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={isProfessional ? 5 : 7}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search by address or survey number…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
                sx: { borderRadius: 2 },
              }}
            />
          </Grid>
          <Grid item xs={12} md={isProfessional ? 3 : 3}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} sx={{ borderRadius: 2 }}>
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="processing">Processing</MenuItem>
                <MenuItem value="completed">Verified</MenuItem>
                <MenuItem value="failed">Failed</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          {isProfessional && (
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Client</InputLabel>
                <Select value={clientFilter} label="Client" onChange={(e) => { setClientFilter(e.target.value); setPage(1); }} sx={{ borderRadius: 2 }}>
                  <MenuItem value="">All Clients</MenuItem>
                  {clients.map((c) => <MenuItem key={c.clientId} value={c.clientId}>{c.clientName}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          )}
          <Grid item xs={12} md={isProfessional ? 1 : 2} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
              {total} result{total !== 1 ? 's' : ''}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress />
        </Box>
      ) : properties.length === 0 ? (
        <EmptyState onAdd={() => setCreateDialog(true)} />
      ) : (
        <>
          <Grid container spacing={2.5}>
            {properties.map((property) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={property.propertyId}>
                <PropertyCard
                  property={property}
                  onClick={() => navigate(`/properties/${property.propertyId}`)}
                />
              </Grid>
            ))}
          </Grid>

          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
              <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" shape="rounded" />
            </Box>
          )}
        </>
      )}

      {/* Create dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>New Property Verification</Typography>
          <Typography variant="body2" color="text.secondary">
            Add a property to start the document analysis pipeline.
          </Typography>
        </DialogTitle>
        <DialogContent>
          {isProfessional && (
            <Autocomplete
              freeSolo
              options={clients.map((c) => c.clientName)}
              value={newProperty.clientName}
              onChange={(_, value) => {
                const client = clients.find((c) => c.clientName === value);
                setNewProperty({ ...newProperty, clientName: value || '', clientId: client?.clientId || '' });
              }}
              onInputChange={(_, value) => setNewProperty({ ...newProperty, clientName: value, clientId: '' })}
              renderInput={(params) => (
                <TextField {...params} label="Client Name" required sx={{ mt: 2, mb: 2 }} helperText="Select existing or enter new client" />
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
            placeholder="e.g. 12/3, MG Road, Bengaluru, Karnataka"
          />
          <TextField
            fullWidth
            label="Survey Number (Optional)"
            value={newProperty.surveyNumber}
            onChange={(e) => setNewProperty({ ...newProperty, surveyNumber: e.target.value })}
            placeholder="e.g. 397/2"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setCreateDialog(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button
            onClick={handleCreateProperty}
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            disabled={!newProperty.address || (isProfessional && !newProperty.clientName)}
            sx={{ borderRadius: 2 }}
          >
            Create & Open
          </Button>
        </DialogActions>
      </Dialog>

      <BulkOperations
        open={bulkOperationsOpen}
        onClose={() => setBulkOperationsOpen(false)}
        onComplete={() => { loadProperties(); if (isProfessional) loadStats(); }}
      />
    </Container>
  );
};

export default Dashboard;
