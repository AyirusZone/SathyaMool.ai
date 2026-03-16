import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
export type PipelineStepStatus = 'pending' | 'in_progress' | 'complete' | 'failed';
export interface PipelineProgress {
    upload: PipelineStepStatus;
    ocr: PipelineStepStatus;
    translation: PipelineStepStatus;
    analysis: PipelineStepStatus;
    lineage: PipelineStepStatus;
    scoring: PipelineStepStatus;
}
/**
 * Maps a processingStatus string to a structured PipelineProgress object.
 * Unknown statuses default to all-pending.
 *
 * Feature: document-pipeline-status, Property 3: processingStatus → pipelineProgress mapping is deterministic and idempotent
 */
export declare function mapToPipelineProgress(processingStatus: string): PipelineProgress;
/**
 * Derives the property-level status from the current document states.
 *
 * Feature: document-pipeline-status, Property 8: property status is derived from document states
 */
export declare function derivePropertyStatus(documents: any[]): string;
/**
 * Lambda handler for getting property details
 * Retrieves property metadata, document list with pipeline progress, and derived status
 */
export declare const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
