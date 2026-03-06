import React from 'react';
import {
  Box,
  Typography,
  LinearProgress,
  Stepper,
  Step,
  StepLabel,
  Paper,
  Chip,
} from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
} from '@mui/icons-material';

interface ProcessingStatusProps {
  status: string;
  documentCount: number;
  processedCount?: number;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  status,
  documentCount,
  processedCount = 0,
}) => {
  const stages = [
    { label: 'Upload', key: 'pending' },
    { label: 'OCR', key: 'ocr' },
    { label: 'Translation', key: 'translation' },
    { label: 'Analysis', key: 'analysis' },
    { label: 'Lineage', key: 'lineage' },
    { label: 'Scoring', key: 'completed' },
  ];

  const getActiveStep = () => {
    switch (status) {
      case 'pending':
        return 0;
      case 'processing':
        return 3;
      case 'completed':
        return 6;
      case 'failed':
        return -1;
      default:
        return 0;
    }
  };

  const getStepIcon = (index: number) => {
    const activeStep = getActiveStep();
    if (status === 'failed') {
      return <ErrorIcon color="error" />;
    }
    if (index < activeStep) {
      return <CheckIcon color="success" />;
    }
    if (index === activeStep) {
      return <PendingIcon color="primary" />;
    }
    return null;
  };

  const progress = documentCount > 0 ? (processedCount / documentCount) * 100 : 0;

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Processing Status</Typography>
        <Chip
          label={status.toUpperCase()}
          color={
            status === 'completed'
              ? 'success'
              : status === 'failed'
              ? 'error'
              : status === 'processing'
              ? 'info'
              : 'default'
          }
        />
      </Box>

      {status === 'processing' && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Processing documents...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {processedCount} / {documentCount} ({Math.round(progress)}%)
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={progress} />
        </Box>
      )}

      <Stepper activeStep={getActiveStep()} alternativeLabel>
        {stages.map((stage, index) => (
          <Step key={stage.key}>
            <StepLabel icon={getStepIcon(index)}>{stage.label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {status === 'processing' && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
          Status updates every 10 seconds
        </Typography>
      )}
    </Paper>
  );
};

export default ProcessingStatus;
