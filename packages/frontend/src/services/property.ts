import api from './api';

export type PipelineStepStatus = 'pending' | 'in_progress' | 'complete' | 'failed';

export interface PipelineProgress {
  upload: PipelineStepStatus;
  ocr: PipelineStepStatus;
  translation: PipelineStepStatus;
  analysis: PipelineStepStatus;
  lineage: PipelineStepStatus;
  scoring: PipelineStepStatus;
}

export interface DocumentWithPipeline {
  documentId: string;
  fileName: string;
  fileSize: number;
  processingStatus: string;
  uploadedAt: string;
  pipelineProgress: PipelineProgress;
}

export interface Property {
  propertyId: string;
  userId: string;
  address: string;
  surveyNumber?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  trustScore?: number;
  documentCount: number;
  documents?: DocumentWithPipeline[];
  createdAt: string;
  updatedAt: string;
  clientName?: string; // For Professional Users
  clientId?: string; // For Professional Users
  processingStatus?: {
    ocr: number;
    translation: number;
    analysis: number;
    lineage: boolean;
    scoring: boolean;
  };
}

export interface Document {
  documentId: string;
  propertyId: string;
  s3Key: string;
  documentType: string;
  uploadedAt: string;
  processingStatus: string;
  ocrConfidence?: number;
  fileName: string;
  fileSize: number;
}

export interface LineageNode {
  id: string;
  data: {
    name: string;
    date?: string;
    verified: boolean;
    isCurrentOwner?: boolean;
    verificationStatus?: 'verified' | 'gap' | 'warning';
    isGapNode?: boolean;
  };
  position: { x: number; y: number };
  type: string;
}

export interface LineageEdge {
  id: string;
  source: string;
  target: string;
  data: {
    transferType: string;
    date: string;
    documentId: string;
    isGap?: boolean;
  };
  type: string;
}

export interface LineageGap {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  owners?: string[];
  years?: number;
}

export interface LineageGraph {
  nodes: LineageNode[];
  edges: LineageEdge[];
  metadata?: {
    motherDeed?: { owner_name?: string; identification_method?: string; warning?: string };
    gaps: LineageGap[];
    ownershipPaths: any[];
    circularPatterns: any[];
    nodeCount: number;
    edgeCount: number;
    gapCount: number;
    documentsWithoutExtraction?: number;
  };
}

export interface TrustScore {
  totalScore: number;
  scoreBreakdown: {
    baseScore: number;
    gapPenalty: number;
    inconsistencyPenalty: number;
    surveyNumberMismatch: number;
    ecBonus: number;
    recencyBonus: number;
    successionBonus: number;
  };
  explanations: string[];
  calculatedAt: string;
}

export interface CreatePropertyRequest {
  address: string;
  surveyNumber?: string;
  clientName?: string; // For Professional Users
  clientId?: string; // For Professional Users
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  s3Key: string;
}

export interface AggregateStats {
  totalProperties: number;
  averageTrustScore: number;
  completedProperties: number;
  processingProperties: number;
  failedProperties: number;
  byClient: {
    clientId: string;
    clientName: string;
    propertyCount: number;
    averageTrustScore: number;
  }[];
}

export interface BulkPropertyRequest {
  properties: {
    address: string;
    surveyNumber?: string;
    clientName?: string;
    clientId?: string;
  }[];
}

export interface BulkPropertyResponse {
  batchId: string;
  properties: Property[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface BulkUploadStatus {
  batchId: string;
  totalProperties: number;
  completedUploads: number;
  failedUploads: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  properties: {
    propertyId: string;
    address: string;
    uploadStatus: string;
    documentCount: number;
  }[];
}

class PropertyService {
  async createProperty(data: CreatePropertyRequest): Promise<Property> {
    const response = await api.post<Property>('/properties', data);
    return response.data;
  }

  async getProperties(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
    clientId?: string; // For Professional Users
  }): Promise<{ properties: Property[]; total: number }> {
    const response = await api.get('/properties', { params: filters });
    return response.data;
  }

  async getProperty(propertyId: string): Promise<Property> {
    const response = await api.get<Property>(`/properties/${propertyId}`);
    return response.data;
  }

  async deleteProperty(propertyId: string): Promise<void> {
    await api.delete(`/properties/${propertyId}`);
  }

  async getUploadUrl(propertyId: string, fileName: string, fileType: string, fileSize: number): Promise<UploadUrlResponse> {
    const response = await api.post<UploadUrlResponse>(`/properties/${propertyId}/upload-url`, {
      fileName,
      contentType: fileType,
      fileSize,
    });
    return response.data;
  }

  async registerDocument(propertyId: string, documentId: string, s3Key: string, fileName: string, fileSize: number, contentType: string): Promise<Document> {
    const response = await api.post<Document>(`/properties/${propertyId}/documents`, {
      documentId,
      s3Key,
      fileName,
      fileSize,
      contentType,
    });
    return response.data;
  }

  async getDocuments(propertyId: string): Promise<Document[]> {
    const response = await api.get<{ documents: Document[]; count: number }>(`/properties/${propertyId}/documents`);
    return response.data.documents;
  }

  async uploadDocument(uploadUrl: string, file: File): Promise<void> {
    await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });
  }

  async getLineage(propertyId: string): Promise<LineageGraph> {
    const response = await api.get<LineageGraph>(`/properties/${propertyId}/lineage`);
    return response.data;
  }

  async getTrustScore(propertyId: string): Promise<TrustScore> {
    const response = await api.get<TrustScore>(`/properties/${propertyId}/trust-score`);
    return response.data;
  }

  async downloadReport(propertyId: string): Promise<string> {
    const response = await api.get<{ reportUrl: string }>(`/properties/${propertyId}/report`);
    return response.data.reportUrl;
  }

  async getAggregateStats(): Promise<AggregateStats> {
    const response = await api.get<AggregateStats>('/properties/stats/aggregate');
    return response.data;
  }

  async getClients(): Promise<{ clientId: string; clientName: string }[]> {
    const response = await api.get<{ clients: { clientId: string; clientName: string }[] }>('/properties/clients');
    return response.data.clients;
  }

  async createBulkProperties(data: BulkPropertyRequest): Promise<BulkPropertyResponse> {
    const response = await api.post<BulkPropertyResponse>('/properties/bulk', data);
    return response.data;
  }

  async uploadBulkDocuments(
    batchId: string,
    propertyId: string,
    files: File[]
  ): Promise<{ uploaded: number; failed: number }> {
    let uploaded = 0;
    let failed = 0;

    for (const file of files) {
      try {
        const { uploadUrl, documentId, s3Key } = await this.getUploadUrl(
          propertyId,
          file.name,
          file.type,
          file.size
        );
        await this.uploadDocument(uploadUrl, file);
        await this.registerDocument(propertyId, documentId, s3Key, file.name, file.size, file.type);
        uploaded++;
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        failed++;
      }
    }

    return { uploaded, failed };
  }

  async getBulkUploadStatus(batchId: string): Promise<BulkUploadStatus> {
    const response = await api.get<BulkUploadStatus>(`/properties/bulk/${batchId}/status`);
    return response.data;
  }

  async getPipelineProgress(propertyId: string): Promise<DocumentWithPipeline[]> {
    const property = await this.getProperty(propertyId);
    return property.documents ?? [];
  }
}

export default new PropertyService();
