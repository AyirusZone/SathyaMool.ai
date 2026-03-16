"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
exports.mapToPipelineProgress = mapToPipelineProgress;
exports.derivePropertyStatus = derivePropertyStatus;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
/**
 * Maps a processingStatus string to a structured PipelineProgress object.
 * Unknown statuses default to all-pending.
 *
 * Feature: document-pipeline-status, Property 3: processingStatus → pipelineProgress mapping is deterministic and idempotent
 */
function mapToPipelineProgress(processingStatus) {
    const C = 'complete';
    const P = 'pending';
    const I = 'in_progress';
    const F = 'failed';
    switch (processingStatus) {
        case 'pending':
            return { upload: C, ocr: P, translation: P, analysis: P, lineage: P, scoring: P };
        case 'ocr_processing':
            return { upload: C, ocr: I, translation: P, analysis: P, lineage: P, scoring: P };
        case 'ocr_complete':
            return { upload: C, ocr: C, translation: P, analysis: P, lineage: P, scoring: P };
        case 'ocr_failed':
            return { upload: C, ocr: F, translation: P, analysis: P, lineage: P, scoring: P };
        case 'translation_processing':
            return { upload: C, ocr: C, translation: I, analysis: P, lineage: P, scoring: P };
        case 'translation_complete':
            return { upload: C, ocr: C, translation: C, analysis: P, lineage: P, scoring: P };
        case 'translation_failed':
            return { upload: C, ocr: C, translation: F, analysis: P, lineage: P, scoring: P };
        case 'analysis_processing':
            return { upload: C, ocr: C, translation: C, analysis: I, lineage: P, scoring: P };
        case 'analysis_complete':
            return { upload: C, ocr: C, translation: C, analysis: C, lineage: P, scoring: P };
        case 'analysis_failed':
            return { upload: C, ocr: C, translation: C, analysis: F, lineage: P, scoring: P };
        case 'lineage_complete':
            return { upload: C, ocr: C, translation: C, analysis: C, lineage: C, scoring: P };
        case 'lineage_failed':
            return { upload: C, ocr: C, translation: C, analysis: C, lineage: F, scoring: P };
        case 'scoring_complete':
            return { upload: C, ocr: C, translation: C, analysis: C, lineage: C, scoring: C };
        case 'scoring_failed':
            return { upload: C, ocr: C, translation: C, analysis: C, lineage: C, scoring: F };
        default:
            return { upload: P, ocr: P, translation: P, analysis: P, lineage: P, scoring: P };
    }
}
const IN_PROGRESS_STATUSES = new Set([
    'ocr_processing',
    'translation_processing',
    'analysis_processing',
]);
const FAILED_SUFFIX = '_failed';
/**
 * Derives the property-level status from the current document states.
 *
 * Feature: document-pipeline-status, Property 8: property status is derived from document states
 */
function derivePropertyStatus(documents) {
    if (documents.length === 0) {
        return 'pending';
    }
    const allScoringComplete = documents.every((d) => (d.processingStatus || 'pending') === 'scoring_complete');
    if (allScoringComplete) {
        return 'completed';
    }
    const anyFailed = documents.some((d) => (d.processingStatus || 'pending').endsWith(FAILED_SUFFIX));
    const anyInProgress = documents.some((d) => IN_PROGRESS_STATUSES.has(d.processingStatus || 'pending'));
    if (anyFailed && !anyInProgress) {
        return 'failed';
    }
    return 'processing';
}
/**
 * Lambda handler for getting property details
 * Retrieves property metadata, document list with pipeline progress, and derived status
 */
const handler = async (event) => {
    console.log('Get property request received:', JSON.stringify(event, null, 2));
    try {
        const userId = event.requestContext.authorizer?.userId ||
            event.requestContext.authorizer?.claims?.sub;
        const userRole = event.requestContext.authorizer?.role ||
            event.requestContext.authorizer?.claims?.['custom:role'];
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        const propertyId = event.pathParameters?.propertyId;
        if (!propertyId) {
            return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
        }
        const getCommand = new lib_dynamodb_1.GetCommand({
            TableName: PROPERTIES_TABLE_NAME,
            Key: { propertyId },
        });
        const result = await docClient.send(getCommand);
        if (!result.Item) {
            return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        }
        const property = result.Item;
        const isOwner = property.userId === userId;
        const isAdmin = userRole === 'Admin_User';
        if (!isOwner && !isAdmin) {
            return createErrorResponse(403, 'FORBIDDEN', 'You do not have permission to access this property');
        }
        const documentsQuery = new lib_dynamodb_1.QueryCommand({
            TableName: DOCUMENTS_TABLE_NAME,
            IndexName: 'propertyId-uploadedAt-index',
            KeyConditionExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId,
            },
        });
        const documentsResult = await docClient.send(documentsQuery);
        const rawDocuments = documentsResult.Items || [];
        const documents = rawDocuments.map((doc) => ({
            documentId: doc.documentId,
            fileName: doc.fileName,
            fileSize: doc.fileSize,
            processingStatus: doc.processingStatus || 'pending',
            uploadedAt: doc.uploadedAt,
            pipelineProgress: mapToPipelineProgress(doc.processingStatus || 'pending'),
            documentSummary: doc.documentSummary ?? null,
        }));
        const derivedStatus = derivePropertyStatus(rawDocuments);
        const responseBody = {
            ...property,
            status: derivedStatus,
            documentCount: property.documentCount ?? 0,
            documents,
        };
        console.log(`Retrieved property ${propertyId} for user ${userId}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify(responseBody),
        };
    }
    catch (error) {
        console.error('Get property error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while retrieving property details. Please try again.');
    }
};
exports.handler = handler;
/**
 * Create error response
 */
function createErrorResponse(statusCode, errorCode, message) {
    const errorResponse = {
        error: errorCode,
        message: message,
    };
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(errorResponse),
    };
}
//# sourceMappingURL=get-property.js.map