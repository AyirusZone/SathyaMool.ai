import React from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  Typography,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
} from '@mui/icons-material';
import { DocumentWithPipeline, PipelineStepStatus } from '../services/property';

interface DocumentPipelineProgressProps {
  document: DocumentWithPipeline;
}

const STEPS: { key: keyof DocumentWithPipeline['pipelineProgress']; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'ocr', label: 'OCR' },
  { key: 'translation', label: 'Translation' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'lineage', label: 'Lineage' },
  { key: 'scoring', label: 'Scoring' },
];

const StepIcon: React.FC<{ status: PipelineStepStatus; stepLabel: string }> = ({ status, stepLabel }) => {
  switch (status) {
    case 'complete':
      return <CheckCircleIcon sx={{ color: 'success.main' }} />;
    case 'in_progress':
      return (
        <CircularProgress
          size={20}
          sx={{
            color: 'primary.main',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.5 },
              '100%': { opacity: 1 },
            },
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      );
    case 'failed':
      return (
        <Tooltip title={`${stepLabel} failed`}>
          <ErrorIcon sx={{ color: 'error.main' }} />
        </Tooltip>
      );
    case 'pending':
    default:
      return <RadioButtonUncheckedIcon sx={{ color: 'text.disabled' }} />;
  }
};

const DocumentPipelineProgress: React.FC<DocumentPipelineProgressProps> = ({ document }) => {
  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {document.fileName}
      </Typography>
      <Stepper alternativeLabel>
        {STEPS.map(({ key, label }) => (
          <Step key={key}>
            <StepLabel
              StepIconComponent={() => (
                <StepIcon status={document.pipelineProgress[key]} stepLabel={label} />
              )}
            >
              <Typography variant="caption">{label}</Typography>
            </StepLabel>
          </Step>
        ))}
      </Stepper>
    </Box>
  );
};

export default DocumentPipelineProgress;
