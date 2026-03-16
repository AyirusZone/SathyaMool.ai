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
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Chip,
  Collapse,
  IconButton,
  Divider,
  Stack,
} from '@mui/material';
import {
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  RadioButtonUnchecked as PendingIcon,
  HourglassEmpty as InProgressIcon,
  KeyboardArrowDown as ExpandIcon,
  KeyboardArrowUp as CollapseIcon,
  Article as ArticleIcon,
} from '@mui/icons-material';
import propertyService, {
  Property,
  LineageGraph as LineageGraphType,
  TrustScore,
  DocumentWithPipeline,
  PipelineStepStatus,
} from '../services/property';
import ProcessingStatus from '../components/ProcessingStatus';
import DocumentUpload from '../components/DocumentUpload';
import LineageGraph from '../components/LineageGraph';
import TrustScoreBreakdown from '../components/TrustScoreBreakdown';

const PIPELINE_STEPS: (keyof DocumentWithPipeline['pipelineProgress'])[] = [
  'upload', 'ocr', 'translation', 'analysis', 'lineage', 'scoring',
];

const STEP_LABELS: Record<string, string> = {
  upload: 'Upload', ocr: 'OCR', translation: 'Translation',
  analysis: 'Analysis', lineage: 'Lineage', scoring: 'Scoring',
};

type FilterStatus = 'all' | 'success' | 'failed' | 'in_progress' | 'pending';

const StepChip: React.FC<{ status: PipelineStepStatus }> = ({ status }) => {
  const map: Record<PipelineStepStatus, { icon: React.ReactElement; color: 'success' | 'error' | 'warning' | 'default'; label: string }> = {
    complete:    { icon: <CheckCircleIcon fontSize="small" />, color: 'success', label: 'Done' },
    failed:      { icon: <ErrorIcon fontSize="small" />,       color: 'error',   label: 'Failed' },
    in_progress: { icon: <InProgressIcon fontSize="small" />,  color: 'warning', label: 'Running' },
    pending:     { icon: <PendingIcon fontSize="small" />,     color: 'default', label: 'Pending' },
  };
  const { icon, color, label } = map[status] ?? map.pending;
  return <Chip icon={icon} label={label} color={color} size="small" variant="outlined" />;
};

function docOverallStatus(doc: DocumentWithPipeline): FilterStatus {
  const vals = Object.values(doc.pipelineProgress);
  if (vals.some(s => s === 'failed')) return 'failed';
  if (vals.some(s => s === 'in_progress')) return 'in_progress';
  if (vals.every(s => s === 'complete')) return 'success';
  return 'pending';
}

interface FailureEntry { fileName: string; failedSteps: string[]; }

const PipelineFailureSummary: React.FC<{ documents: DocumentWithPipeline[] }> = ({ documents }) => {
  const failures: FailureEntry[] = documents
    .map(doc => ({
      fileName: doc.fileName,
      failedSteps: Object.entries(doc.pipelineProgress)
        .filter(([, s]) => s === 'failed')
        .map(([step]) => STEP_LABELS[step] || step),
    }))
    .filter(e => e.failedSteps.length > 0);

  if (failures.length === 0) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }} icon={false}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {failures.length} document{failures.length > 1 ? 's' : ''} failed processing
      </Typography>
      {failures.map(({ fileName, failedSteps }) => (
        <Typography key={fileName} variant="body2">
          <strong>{fileName}</strong> — failed at: {failedSteps.join(', ')}
        </Typography>
      ))}
    </Alert>
  );
};

/** Expandable table row with inline summary */
const DocRow: React.FC<{ doc: DocumentWithPipeline }> = ({ doc }) => {
  const [open, setOpen] = useState(false);
  const overall = docOverallStatus(doc);
  const hasSummary = doc.pipelineProgress.analysis === 'complete';

  return (
    <>
      <TableRow
        hover
        sx={{ cursor: hasSummary ? 'pointer' : 'default' }}
        onClick={() => hasSummary && setOpen(o => !o)}
      >
        <TableCell sx={{ width: 32, pr: 0 }}>
          {hasSummary && (
            <IconButton size="small" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
              {open ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
        <TableCell>
          <Tooltip title={doc.fileName}>
            <Typography
              variant="body2"
              sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {doc.fileName}
            </Typography>
          </Tooltip>
        </TableCell>
        {PIPELINE_STEPS.map(step => (
          <TableCell key={step} align="center">
            <StepChip status={doc.pipelineProgress[step]} />
          </TableCell>
        ))}
        <TableCell align="center">
          <Chip
            label={overall === 'success' ? 'Complete' : overall === 'failed' ? 'Failed' : overall === 'in_progress' ? 'Running' : 'Pending'}
            color={overall === 'success' ? 'success' : overall === 'failed' ? 'error' : overall === 'in_progress' ? 'warning' : 'default'}
            size="small"
          />
        </TableCell>
      </TableRow>
      {hasSummary && (
        <TableRow>
          <TableCell colSpan={PIPELINE_STEPS.length + 3} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
            <Collapse in={open} unmountOnExit>
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1, my: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                  Analysis Summary
                </Typography>
                <Typography variant="body2">
                  {doc.documentSummary || 'Summary not available for this document.'}
                </Typography>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

/** Score & Analysis tab: trust score + all document summaries + lineage */
const ScoreAndAnalysisTab: React.FC<{
  trustScore: TrustScore | null;
  documents: DocumentWithPipeline[];
  lineage: LineageGraphType | null;
}> = ({ trustScore, documents, lineage }) => {
  const analysedDocs = documents.filter(d => d.pipelineProgress.analysis === 'complete');

  return (
    <Box>
      {/* Trust Score */}
      {trustScore ? (
        <TrustScoreBreakdown trustScore={trustScore} />
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          Trust score will be available once all documents finish processing.
        </Alert>
      )}

      {/* Document Summaries */}
      {analysedDocs.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Document Summaries
          </Typography>
          <Stack spacing={2}>
            {analysedDocs.map(doc => (
              <Paper key={doc.documentId} variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <ArticleIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                    {doc.fileName}
                  </Typography>
                  <Chip label="Analysed" color="success" size="small" variant="outlined" />
                </Box>
                <Divider sx={{ mb: 1 }} />
                <Typography variant="body2" color={doc.documentSummary ? 'text.primary' : 'text.secondary'}>
                  {doc.documentSummary || 'Summary not available for this document.'}
                </Typography>
              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      {/* Lineage Graph */}
      {lineage && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Ownership Lineage
          </Typography>
          <LineageGraph nodes={lineage.nodes} edges={lineage.edges} metadata={lineage.metadata} />
        </Box>
      )}
    </Box>
  );
};

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
  const [docFilter, setDocFilter] = useState<FilterStatus>('all');
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
    if (id) loadProperty();
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
        if (data.status === 'completed') await loadLineageAndScore();
        if (allStepsTerminal(data.documents)) clearInterval(interval);
      } catch {
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
      if (data.status === 'completed') await loadLineageAndScore();
      if (!lineage) loadLineageAndScore().catch(() => {});
    } catch (err: any) {
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

  const docs = property.documents ?? [];
  const filteredDocs = docs.filter(doc => docFilter === 'all' || docOverallStatus(doc) === docFilter);

  return (
    <Container maxWidth="xl">
      <Box sx={{ mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography variant="h4" gutterBottom>{property.address}</Typography>
            {property.surveyNumber && (
              <Typography variant="body2" color="text.secondary">
                Survey No: {property.surveyNumber}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button startIcon={<RefreshIcon />} onClick={loadProperty} disabled={loading}>
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
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteDialog(true)}>
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
                <Tab label="Score & Analysis" />
              </Tabs>

              <Box sx={{ p: 3 }}>
                {/* Tab 0: Upload */}
                {tab === 0 && (
                  <DocumentUpload
                    propertyId={property.propertyId}
                    onUploadComplete={loadProperty}
                  />
                )}

                {/* Tab 1: Documents table with expandable summaries */}
                {tab === 1 && (
                  <Box>
                    {docs.length > 0 ? (
                      <>
                        <PipelineFailureSummary documents={docs} />

                        <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="body2" color="text.secondary">Filter:</Typography>
                          <ToggleButtonGroup
                            value={docFilter}
                            exclusive
                            onChange={(_, v) => v && setDocFilter(v)}
                            size="small"
                          >
                            <ToggleButton value="all">All ({docs.length})</ToggleButton>
                            <ToggleButton value="success">
                              Success ({docs.filter(d => docOverallStatus(d) === 'success').length})
                            </ToggleButton>
                            <ToggleButton value="failed">
                              Failed ({docs.filter(d => docOverallStatus(d) === 'failed').length})
                            </ToggleButton>
                            <ToggleButton value="in_progress">
                              In Progress ({docs.filter(d => docOverallStatus(d) === 'in_progress').length})
                            </ToggleButton>
                            <ToggleButton value="pending">
                              Pending ({docs.filter(d => docOverallStatus(d) === 'pending').length})
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Box>

                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: 'grey.50' }}>
                                <TableCell sx={{ width: 32 }} />
                                <TableCell sx={{ fontWeight: 600 }}>File Name</TableCell>
                                {PIPELINE_STEPS.map(step => (
                                  <TableCell key={step} align="center" sx={{ fontWeight: 600 }}>
                                    {STEP_LABELS[step]}
                                  </TableCell>
                                ))}
                                <TableCell align="center" sx={{ fontWeight: 600 }}>Overall</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {filteredDocs.map(doc => (
                                <DocRow key={doc.documentId} doc={doc} />
                              ))}
                              {filteredDocs.length === 0 && (
                                <TableRow>
                                  <TableCell colSpan={PIPELINE_STEPS.length + 3} align="center" sx={{ py: 4 }}>
                                    <Typography color="text.secondary">No documents match this filter.</Typography>
                                  </TableCell>
                                </TableRow>
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>

                        {docs.some(d => d.pipelineProgress.analysis === 'complete') && (
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Click a row to expand the analysis summary.
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Typography color="text.secondary">No documents uploaded yet.</Typography>
                    )}
                  </Box>
                )}

                {/* Tab 2: Lineage Graph */}
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

                {/* Tab 3: Score & Analysis */}
                {tab === 3 && (
                  <ScoreAndAnalysisTab
                    trustScore={trustScore}
                    documents={docs}
                    lineage={lineage}
                  />
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
          <Button onClick={handleDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PropertyDetails;
