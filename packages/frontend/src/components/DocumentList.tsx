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
    switch (status) {
      case 'completed':
        return <CheckIcon color="success" />;
      case 'failed':
        return <ErrorIcon color="error" />;
      case 'processing':
        return <CircularProgress size={24} />;
      default:
        return <PendingIcon color="action" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
        return 'error';
      case 'processing':
        return 'info';
      default:
        return 'default';
    }
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
                {doc.ocrConfidence && ` • OCR Confidence: ${(doc.ocrConfidence * 100).toFixed(1)}%`}
              </>
            }
          />
          <Chip
            label={doc.processingStatus}
            color={getStatusColor(doc.processingStatus) as any}
            size="small"
          />
        </ListItem>
      ))}
    </List>
  );
};

export default DocumentList;
