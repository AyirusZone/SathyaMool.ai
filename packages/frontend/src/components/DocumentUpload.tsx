import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Alert,
  Paper,
  CircularProgress,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import propertyService from '../services/property';

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

interface DocumentUploadProps {
  propertyId: string;
  onUploadComplete?: () => void;
}

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_FILES = 50;

const DocumentUpload: React.FC<DocumentUploadProps> = ({ propertyId, onUploadComplete }) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return 'Invalid file type. Only PDF, JPEG, PNG, and TIFF are allowed.';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 50MB limit.';
    }
    return null;
  };

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;

    setError('');
    const fileArray = Array.from(newFiles);

    if (files.length + fileArray.length > MAX_FILES) {
      setError(`Maximum ${MAX_FILES} files allowed per property.`);
      return;
    }

    const validFiles: FileUploadStatus[] = [];
    const errors: string[] = [];

    fileArray.forEach((file) => {
      const validationError = validateFile(file);
      if (validationError) {
        errors.push(`${file.name}: ${validationError}`);
      } else {
        validFiles.push({
          file,
          status: 'pending',
          progress: 0,
        });
      }
    });

    if (errors.length > 0) {
      setError(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [files]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFile = async (fileStatus: FileUploadStatus, index: number) => {
    try {
      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, status: 'uploading', progress: 0 } : f))
      );

      const { uploadUrl, documentId, s3Key } = await propertyService.getUploadUrl(
        propertyId,
        fileStatus.file.name,
        fileStatus.file.type,
        fileStatus.file.size
      );

      await propertyService.uploadDocument(uploadUrl, fileStatus.file);

      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, progress: 50 } : f))
      );

      await propertyService.registerDocument(
        propertyId, 
        documentId, 
        s3Key,
        fileStatus.file.name,
        fileStatus.file.size,
        fileStatus.file.type
      );

      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, status: 'success', progress: 100 } : f))
      );
    } catch (err: any) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === index
            ? {
                ...f,
                status: 'error',
                error: err.response?.data?.message || 'Upload failed',
              }
            : f
        )
      );
    }
  };

  const uploadAll = async () => {
    const pendingFiles = files
      .map((f, i) => ({ file: f, index: i }))
      .filter((f) => f.file.status === 'pending');

    for (const { file, index } of pendingFiles) {
      await uploadFile(file, index);
    }

    if (onUploadComplete) {
      onUploadComplete();
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'uploading':
        return <CircularProgress size={24} />;
      default:
        return <FileIcon />;
    }
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const uploadingCount = files.filter((f) => f.status === 'uploading').length;

  return (
    <Box>
      <Paper
        sx={{
          p: 4,
          border: dragActive ? '2px dashed #1976d2' : '2px dashed #ccc',
          bgcolor: dragActive ? 'action.hover' : 'background.paper',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s',
          mb: 2,
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-input')?.click()}
      >
        <UploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          Drag and drop files here
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          or click to browse
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Supported: PDF, JPEG, PNG, TIFF (max 50MB, up to 50 files)
        </Typography>
        <input
          id="file-input"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tiff"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {files.length > 0 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1">
              {files.length} file(s) selected
            </Typography>
            <Button
              variant="contained"
              onClick={uploadAll}
              disabled={pendingCount === 0 || uploadingCount > 0}
            >
              Upload All ({pendingCount})
            </Button>
          </Box>

          <List>
            {files.map((fileStatus, index) => (
              <ListItem
                key={index}
                secondaryAction={
                  fileStatus.status === 'pending' && (
                    <IconButton edge="end" onClick={() => removeFile(index)}>
                      <DeleteIcon />
                    </IconButton>
                  )
                }
              >
                <ListItemIcon>{getStatusIcon(fileStatus.status)}</ListItemIcon>
                <ListItemText
                  primary={fileStatus.file.name}
                  secondary={
                    <>
                      {(fileStatus.file.size / 1024 / 1024).toFixed(2)} MB
                      {fileStatus.status === 'uploading' && (
                        <LinearProgress
                          variant="determinate"
                          value={fileStatus.progress}
                          sx={{ mt: 1 }}
                        />
                      )}
                      {fileStatus.status === 'error' && (
                        <Typography variant="caption" color="error">
                          {fileStatus.error}
                        </Typography>
                      )}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
    </Box>
  );
};

export default DocumentUpload;
