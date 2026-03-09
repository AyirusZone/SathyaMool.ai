import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  CircularProgress,
  Alert,
  Paper,
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as PendingIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import propertyService, { Document } from '../services/property';

interface DocumentListProps {
  propertyId: string;
}

const DocumentList: React.FC<DocumentListProps> = ({ propertyId }) => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDocuments();
    
    // Auto-refresh every 10 seconds to show updated document statuses
    const interval = setInterval(() => {
      loadDocuments();
    }, 10000);
    
    return () => clearInterval(interval);
  }, [propertyId]);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await propertyService.getDocuments(propertyId);
      setDocuments(docs);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'analysis_complete' || status === 'completed') {
      return <CheckIcon color="success" />;
    }
    if (status === 'ocr_failed' || status === 'translation_failed' || status === 'analysis_failed' || status === 'failed') {
      return <ErrorIcon color="error" />;
    }
    if (status === 'ocr_processing' || status === 'ocr_complete' || status === 'translation_processing' || status === 'translation_complete' || status === 'analysis_processing' || status === 'processing') {
      return <CircularProgress size={24} />;
    }
    return <PendingIcon color="action" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'analysis_complete' || status === 'completed') {
      return 'success';
    }
    if (status === 'ocr_failed' || status === 'translation_failed' || status === 'analysis_failed' || status === 'failed') {
      return 'error';
    }
    if (status === 'ocr_processing' || status === 'ocr_complete' || status === 'translation_processing' || status === 'translation_complete' || status === 'analysis_processing' || status === 'processing') {
      return 'info';
    }
    return 'default';
  };

  const getStatusLabel = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'pending': 'Pending',
      'ocr_processing': 'OCR Processing',
      'ocr_complete': 'OCR Complete',
      'ocr_failed': 'OCR Failed',
      'translation_processing': 'Translation Processing',
      'translation_complete': 'Translation Complete',
      'translation_failed': 'Translation Failed',
      'analysis_processing': 'Analysis Processing',
      'analysis_complete': 'Analysis Complete',
      'analysis_failed': 'Analysis Failed',
      'completed': 'Completed',
      'failed': 'Failed',
      'processing': 'Processing',
    };
    return statusMap[status] || status;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (documents.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">
          No documents uploaded yet. Upload documents to begin verification.
        </Typography>
      </Paper>
    );
  }

  return (
    <List>
      {documents.map((doc) => (
        <ListItem key={doc.documentId}>
          <ListItemIcon>{getStatusIcon(doc.processingStatus)}</ListItemIcon>
          <ListItemText
            primary={doc.fileName}
            secondary={
              <>
                {(doc.fileSize / 1024 / 1024).toFixed(2)} MB • Uploaded {new Date(doc.uploadedAt).toLocaleString()}
                {doc.ocrConfidence && ` • OCR Confidence: ${(doc.ocrConfidence).toFixed(1)}%`}
              </>
            }
          />
          <Chip
            label={getStatusLabel(doc.processingStatus)}
            color={getStatusColor(doc.processingStatus) as any}
            size="small"
          />
        </ListItem>
      ))}
    </List>
  );
};

export default DocumentList;
