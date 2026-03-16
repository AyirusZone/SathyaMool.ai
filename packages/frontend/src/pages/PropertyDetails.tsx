import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  Grid,
  Paper,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import propertyService, { Property, LineageGraph as LineageGraphType, TrustScore, DocumentWithPipeline } from '../services/property';
import ProcessingStatus from '../components/ProcessingStatus';
import DocumentUpload from '../components/DocumentUpload';
import LineageGraph from '../components/LineageGraph';
import TrustScoreBreakdown from '../components/TrustScoreBreakdown';
import DocumentPipelineProgress from '../components/DocumentPipelineProgress';

const PropertyDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [lineage, setLineage] = useState<LineageGraphType | null>(null);
  const [trustScore, setTrustScore] = useState<TrustScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const consecutiveFailuresRef = useRef(0);

  const hasActiveSteps = (documents: DocumentWithPipeline[] | undefined): boolean => {
    if (!documents || documents.length === 0) return false;
    return documents.some(doc =>
      Object.values(doc.pipelineProgress).some(status => status === 'in_progress')
    );
  };

  const allStepsTerminal = (documents: DocumentWithPipeline[] | undefined): boolean => {
    if (!documents || documents.length === 0) return true;
    return documents.every(doc =>
      Object.values(doc.pipelineProgress).every(status => status === 'complete' || status === 'failed')
    );
  };

  useEffect(() => {
    if (id) {
      loadProperty();
    }
  }, [id]);

  useEffect(() => {
    if (!id || !property) return;

    if (allStepsTerminal(property.documents)) return;

    const interval = setInterval(async () => {
      if (!hasActiveSteps(property.documents) && allStepsTerminal(property.documents)) {
        clearInterval(interval);
        return;
      }
      try {
        const data = await propertyService.getProperty(id);
        setProperty(data);
        consecutiveFailuresRef.current = 0;
        if (data.status === 'completed') {
          await loadLineageAndScore();
        }
        if (allStepsTerminal(data.documents)) {
          clearInterval(interval);
        }
      } catch (err: any) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          clearInterval(interval);
          setError('Polling failed after 3 consecutive errors. Please refresh manually.');
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [id, property?.documents]);

  const loadProperty = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await propertyService.getProperty(id);
      setProperty(data);

      if (data.status === 'completed') {
        await loadLineageAndScore();
      }
      // Always try to load lineage (shows partial/empty state with gap info)
      if (!lineage) {
        loadLineageAndScore().catch(() => {});
      }    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load property');
    } finally {
      setLoading(false);
    }
  };

  const loadLineageAndScore = async () => {
    if (!id) return;

    try {
      const [lineageData, scoreData] = await Promise.all([
        propertyService.getLineage(id),
        propertyService.getTrustScore(id),
      ]);
      setLineage(lineageData);
      setTrustScore(scoreData);
    } catch (err: any) {
      console.error('Failed to load lineage or trust score:', err);
    }
  };

  const handleDownloadReport = async () => {
    if (!id) return;

    try {
      setDownloading(true);
      const reportUrl = await propertyService.downloadReport(id);
      window.open(reportUrl, '_blank');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;

    try {
      await propertyService.deleteProperty(id);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete property');
    }
  };

  if (loading && !property) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!property) {
    return (
      <Container>
        <Alert severity="error">Property not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h4" gutterBottom>
              {property.address}
            </Typography>
            {property.surveyNumber && (
              <Typography variant="body2" color="text.secondary">
                Survey No: {property.surveyNumber}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              startIcon={<RefreshIcon />}
              onClick={loadProperty}
              disabled={loading}
            >
              Refresh
            </Button>
            {property.status === 'completed' && (
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadReport}
                disabled={downloading}
              >
                {downloading ? 'Downloading...' : 'Download Report'}
              </Button>
            )}
            <Button
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setDeleteDialog(true)}
            >
              Delete
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Grid container spacing={3}>
          <Grid item xs={12}>
            <ProcessingStatus
              status={property.status}
              documentCount={property.documentCount}
              processedCount={property.documentCount}
              processingStatus={property.processingStatus}
            />
          </Grid>

          <Grid item xs={12}>
            <Paper>
              <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                <Tab label="Upload Documents" />
                <Tab label="Documents" />
                <Tab label="Lineage Graph" />
                {property.status === 'completed' && <Tab label="Trust Score" />}
              </Tabs>

              <Box sx={{ p: 3 }}>
                {tab === 0 && (
                  <DocumentUpload
                    propertyId={property.propertyId}
                    onUploadComplete={loadProperty}
                  />
                )}

                {tab === 1 && (
                  <Box>
                    {property.documents && property.documents.length > 0 ? (
                      property.documents.map(doc => (
                        <Box key={doc.documentId} sx={{ mb: 3 }}>
                          <DocumentPipelineProgress document={doc} />
                        </Box>
                      ))
                    ) : (
                      <Typography color="text.secondary">No documents uploaded yet.</Typography>
                    )}
                  </Box>
                )}

                {tab === 2 && lineage && (
                  <LineageGraph nodes={lineage.nodes} edges={lineage.edges} metadata={lineage.metadata} />
                )}

                {tab === 2 && !lineage && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    {property.status === 'completed' ? (
                      <CircularProgress />
                    ) : (
                      <Typography color="text.secondary">
                        Lineage graph will be available once processing completes.
                      </Typography>
                    )}
                  </Box>
                )}

                {tab === 3 && trustScore && (
                  <TrustScoreBreakdown trustScore={trustScore} />
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>

      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Delete Property Verification</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this property verification? This action cannot be undone.
            All documents and analysis will be permanently deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PropertyDetails;
