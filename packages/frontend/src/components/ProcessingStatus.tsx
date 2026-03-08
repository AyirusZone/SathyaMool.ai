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
  processingStatus?: {
    ocr: number;
    translation: number;
    analysis: number;
    lineage: boolean;
    scoring: boolean;
  };
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({
  status,
  documentCount,
  processedCount = 0,
  processingStatus,
}) => {
  const stages = [
    { label: 'Upload', key: 'upload', progress: documentCount > 0 ? 100 : 0 },
    { label: 'OCR', key: 'ocr', progress: processingStatus?.ocr || 0 },
    { label: 'Translation', key: 'translation', progress: processingStatus?.translation || 0 },
    { label: 'Analysis', key: 'analysis', progress: processingStatus?.analysis || 0 },
    { label: 'Lineage', key: 'lineage', progress: processingStatus?.lineage ? 100 : 0 },
    { label: 'Scoring', key: 'scoring', progress: processingStatus?.scoring ? 100 : 0 },
  ];

  const getActiveStep = () => {
    if (status === 'failed') return -1;
    if (status === 'completed') return 6;
    if (documentCount === 0) return 0;
    
    // Determine active step based on processing status
    if (processingStatus) {
      if (processingStatus.scoring) return 6;
      if (processingStatus.lineage) return 5;
      if (processingStatus.analysis === 100) return 4;
      if (processingStatus.translation > 0) return 3;
      if (processingStatus.ocr > 0) return 2;
    }
    
    return 1; // Upload complete, waiting for OCR
  };

  const getStepIcon = (index: number, stage: typeof stages[0]) => {
    if (status === 'failed') {
      return <ErrorIcon color="error" />;
    }
    
    if (stage.progress === 100) {
      return <CheckIcon color="success" />;
    }
    
    if (stage.progress > 0 && stage.progress < 100) {
      return <PendingIcon color="primary" />;
    }
    
    return null;
  };

  const overallProgress = processingStatus 
    ? Math.round((processingStatus.ocr + processingStatus.translation + processingStatus.analysis) / 3)
    : 0;

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

      {(status === 'processing' || (documentCount > 0 && status !== 'completed')) && (
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Processing documents...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {overallProgress}% complete
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={overallProgress} />
        </Box>
      )}

      <Stepper activeStep={getActiveStep()} alternativeLabel>
        {stages.map((stage, index) => (
          <Step key={stage.key}>
            <StepLabel icon={getStepIcon(index, stage)}>
              <Box>
                <Typography variant="caption">{stage.label}</Typography>
                {stage.progress > 0 && stage.progress < 100 && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {stage.progress}%
                  </Typography>
                )}
              </Box>
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      {(status === 'processing' || (documentCount > 0 && status !== 'completed')) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
          Status updates every 10 seconds
        </Typography>
      )}
    </Paper>
  );
};

export default ProcessingStatus;
