import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stepper,
  Step,
  StepLabel,
  TextField,
  Box,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  LinearProgress,
  Alert,
  Paper,
  Chip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material';
import propertyService, { BulkPropertyRequest, BulkUploadStatus } from '../services/property';

interface BulkOperationsProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface PropertyInput {
  id: string;
  address: string;
  surveyNumber: string;
  clientName: string;
  files: File[];
}

const BulkOperations: React.FC<BulkOperationsProps> = ({ open, onClose, onComplete }) => {
  const [activeStep, setActiveStep] = useState(0);
  const [properties, setProperties] = useState<PropertyInput[]>([
    { id: '1', address: '', surveyNumber: '', clientName: '', files: [] },
  ]);
  const [batchId, setBatchId] = useState('');
  const [uploadStatus, setUploadStatus] = useState<BulkUploadStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const steps = ['Add Properties', 'Upload Documents', 'Review Status'];

  const handleAddProperty = () => {
    setProperties([
      ...properties,
      {
        id: Date.now().toString(),
        address: '',
        surveyNumber: '',
        clientName: '',
        files: [],
      },
    ]);
  };

  const handleRemoveProperty = (id: string) => {
    setProperties(properties.filter((p) => p.id !== id));
  };

  const handlePropertyChange = (id: string, field: keyof PropertyInput, value: any) => {
    setProperties(
      properties.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleFileSelect = (id: string, files: FileList | null) => {
    if (files) {
      const fileArray = Array.from(files);
      handlePropertyChange(id, 'files', fileArray);
    }
  };

  const handleCreateProperties = async () => {
    setLoading(true);
    setError('');

    try {
      const bulkRequest: BulkPropertyRequest = {
        properties: properties.map((p) => ({
          address: p.address,
          surveyNumber: p.surveyNumber || undefined,
          clientName: p.clientName || undefined,
        })),
      };

      const response = await propertyService.createBulkProperties(bulkRequest);
      setBatchId(response.batchId);
      setActiveStep(1);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create properties');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadDocuments = async () => {
    setLoading(true);
    setError('');

    try {
      const status = await propertyService.getBulkUploadStatus(batchId);
      
      // Upload documents for each property
      for (let i = 0; i < properties.length; i++) {
        const property = properties[i];
        const propertyId = status.properties[i]?.propertyId;
        
        if (propertyId && property.files.length > 0) {
          await propertyService.uploadBulkDocuments(batchId, propertyId, property.files);
        }
      }

      // Get updated status
      const updatedStatus = await propertyService.getBulkUploadStatus(batchId);
      setUploadStatus(updatedStatus);
      setActiveStep(2);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload documents');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete();
    handleClose();
  };

  const handleClose = () => {
    setActiveStep(0);
    setProperties([{ id: '1', address: '', surveyNumber: '', clientName: '', files: [] }]);
    setBatchId('');
    setUploadStatus(null);
    setError('');
    onClose();
  };

  const canProceedToUpload = properties.every((p) => p.address.trim() !== '');
  const canProceedToReview = properties.every((p) => p.files.length > 0);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Bulk Property Operations</DialogTitle>
      <DialogContent>
        <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Step 1: Add Properties */}
        {activeStep === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add multiple properties for bulk processing. You can add up to 50 properties at once.
            </Typography>

            <List>
              {properties.map((property, index) => (
                <Paper key={property.id} sx={{ p: 2, mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                      Property {index + 1}
                    </Typography>
                    {properties.length > 1 && (
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveProperty(property.id)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
                  </Box>

                  <TextField
                    fullWidth
                    label="Client Name"
                    value={property.clientName}
                    onChange={(e) =>
                      handlePropertyChange(property.id, 'clientName', e.target.value)
                    }
                    required
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label="Property Address"
                    value={property.address}
                    onChange={(e) =>
                      handlePropertyChange(property.id, 'address', e.target.value)
                    }
                    required
                    sx={{ mb: 2 }}
                  />

                  <TextField
                    fullWidth
                    label="Survey Number (Optional)"
                    value={property.surveyNumber}
                    onChange={(e) =>
                      handlePropertyChange(property.id, 'surveyNumber', e.target.value)
                    }
                  />
                </Paper>
              ))}
            </List>

            {properties.length < 50 && (
              <Button
                startIcon={<AddIcon />}
                onClick={handleAddProperty}
                variant="outlined"
                fullWidth
              >
                Add Another Property
              </Button>
            )}
          </Box>
        )}

        {/* Step 2: Upload Documents */}
        {activeStep === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Upload documents for each property. You can upload up to 50 documents per property.
            </Typography>

            <List>
              {properties.map((property, index) => (
                <Paper key={property.id} sx={{ p: 2, mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Property {index + 1}: {property.address}
                  </Typography>

                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={<CloudUploadIcon />}
                    fullWidth
                    sx={{ mb: 1 }}
                  >
                    Select Documents
                    <input
                      type="file"
                      hidden
                      multiple
                      accept=".pdf,.jpg,.jpeg,.png,.tiff"
                      onChange={(e) => handleFileSelect(property.id, e.target.files)}
                    />
                  </Button>

                  {property.files.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {property.files.length} file(s) selected
                      </Typography>
                      <List dense>
                        {property.files.map((file, fileIndex) => (
                          <ListItem key={fileIndex}>
                            <ListItemText
                              primary={file.name}
                              secondary={`${(file.size / 1024 / 1024).toFixed(2)} MB`}
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </Paper>
              ))}
            </List>
          </Box>
        )}

        {/* Step 3: Review Status */}
        {activeStep === 2 && uploadStatus && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              Bulk upload completed successfully!
            </Alert>

            <Paper sx={{ p: 2, mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Upload Summary
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <Chip label={`Total: ${uploadStatus.totalProperties}`} />
                <Chip
                  label={`Completed: ${uploadStatus.completedUploads}`}
                  color="success"
                />
                <Chip
                  label={`Failed: ${uploadStatus.failedUploads}`}
                  color={uploadStatus.failedUploads > 0 ? 'error' : 'default'}
                />
              </Box>
            </Paper>

            <Typography variant="subtitle2" gutterBottom>
              Property Status
            </Typography>
            <List>
              {uploadStatus.properties.map((property) => (
                <ListItem key={property.propertyId}>
                  <ListItemText
                    primary={property.address}
                    secondary={`${property.documentCount} documents • ${property.uploadStatus}`}
                  />
                  <ListItemSecondaryAction>
                    <Chip
                      label={property.uploadStatus}
                      size="small"
                      color={
                        property.uploadStatus === 'completed'
                          ? 'success'
                          : property.uploadStatus === 'failed'
                          ? 'error'
                          : 'default'
                      }
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

        {loading && <LinearProgress sx={{ mt: 2 }} />}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        {activeStep === 0 && (
          <Button
            onClick={handleCreateProperties}
            variant="contained"
            disabled={!canProceedToUpload || loading}
          >
            Next: Upload Documents
          </Button>
        )}
        {activeStep === 1 && (
          <>
            <Button onClick={() => setActiveStep(0)}>Back</Button>
            <Button
              onClick={handleUploadDocuments}
              variant="contained"
              disabled={!canProceedToReview || loading}
            >
              Upload & Process
            </Button>
          </>
        )}
        {activeStep === 2 && (
          <Button onClick={handleComplete} variant="contained">
            Done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default BulkOperations;
