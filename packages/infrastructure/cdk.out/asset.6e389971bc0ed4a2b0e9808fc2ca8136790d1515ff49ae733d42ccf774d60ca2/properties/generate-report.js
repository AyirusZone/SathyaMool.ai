"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const PDFDocument = require("pdfkit");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
});
const PROPERTIES_TABLE_NAME = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const LINEAGE_TABLE_NAME = process.env.LINEAGE_TABLE_NAME || 'SatyaMool-Lineage';
const TRUST_SCORES_TABLE_NAME = process.env.TRUST_SCORES_TABLE_NAME || 'SatyaMool-TrustScores';
const DOCUMENTS_TABLE_NAME = process.env.DOCUMENTS_TABLE_NAME || 'SatyaMool-Documents';
const REPORTS_BUCKET_NAME = process.env.REPORTS_BUCKET_NAME || 'satyamool-reports';
/**
 * Lambda handler for generating PDF reports
 * Generates PDF report on demand with property data, lineage graph, and Trust Score
 * Stores PDF in S3 with 7-day expiration and returns presigned URL (15-minute expiration)
 */
const handler = async (event) => {
    console.log('Generate report request received:', JSON.stringify(event, null, 2));
    try {
        // Extract userId and role from authorizer context
        // The authorizer puts userId and role in the context, not in claims
        const userId = event.requestContext.authorizer?.userId || event.requestContext.authorizer?.claims?.sub;
        const userRole = event.requestContext.authorizer?.role || event.requestContext.authorizer?.claims?.['custom:role'];
        if (!userId) {
            return createErrorResponse(401, 'UNAUTHORIZED', 'User authentication required');
        }
        // Extract propertyId from path parameters
        const propertyId = event.pathParameters?.id;
        if (!propertyId) {
            return createErrorResponse(400, 'MISSING_PROPERTY_ID', 'Property ID is required');
        }
        // Check property ownership
        const propertyQuery = new lib_dynamodb_1.QueryCommand({
            TableName: PROPERTIES_TABLE_NAME,
            KeyConditionExpression: 'propertyId = :propertyId',
            ExpressionAttributeValues: {
                ':propertyId': propertyId,
            },
            Limit: 1,
        });
        const propertyResult = await docClient.send(propertyQuery);
        if (!propertyResult.Items || propertyResult.Items.length === 0) {
            return createErrorResponse(404, 'PROPERTY_NOT_FOUND', 'Property not found');
        }
        const property = propertyResult.Items[0];
        // Authorization check: user owns property or is admin
        const isOwner = property.userId === userId;
        const isAdmin = userRole === 'Admin_User';
        if (!isOwner && !isAdmin) {
            return createErrorResponse(403, 'FORBIDDEN', 'You do not have permission to access this property');
        }
        // Check if property processing is complete
        if (property.status !== 'completed') {
            return createErrorResponse(400, 'PROCESSING_INCOMPLETE', 'Property verification is not yet complete. Please wait for processing to finish.');
        }
        // Retrieve all required data
        const [lineageData, trustScoreData, documents] = await Promise.all([
            getLineageData(propertyId),
            getTrustScoreData(propertyId),
            getDocuments(propertyId),
        ]);
        if (!lineageData) {
            return createErrorResponse(404, 'LINEAGE_NOT_FOUND', 'Lineage data not found');
        }
        if (!trustScoreData) {
            return createErrorResponse(404, 'TRUST_SCORE_NOT_FOUND', 'Trust Score not found');
        }
        // Generate PDF
        const pdfBuffer = await generatePDF(property, lineageData, trustScoreData, documents);
        // Upload PDF to S3 with 7-day expiration
        const reportKey = `reports/${propertyId}/${Date.now()}.pdf`;
        await s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: REPORTS_BUCKET_NAME,
            Key: reportKey,
            Body: pdfBuffer,
            ContentType: 'application/pdf',
            Metadata: {
                propertyId: propertyId,
                userId: userId,
                generatedAt: new Date().toISOString(),
            },
            // S3 lifecycle policy will handle deletion after 7 days
        }));
        // Generate presigned URL with 15-minute expiration
        const presignedUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, new client_s3_1.PutObjectCommand({
            Bucket: REPORTS_BUCKET_NAME,
            Key: reportKey,
        }), { expiresIn: 900 } // 15 minutes
        );
        console.log(`Generated PDF report for property ${propertyId}`);
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            },
            body: JSON.stringify({
                reportUrl: presignedUrl,
                expiresIn: 900,
                generatedAt: new Date().toISOString(),
            }),
        };
    }
    catch (error) {
        console.error('Generate report error:', error);
        return createErrorResponse(500, 'INTERNAL_ERROR', 'An error occurred while generating the report. Please try again.');
    }
};
exports.handler = handler;
/**
 * Get lineage data from DynamoDB
 */
async function getLineageData(propertyId) {
    const command = new lib_dynamodb_1.GetCommand({
        TableName: LINEAGE_TABLE_NAME,
        Key: { propertyId },
    });
    const result = await docClient.send(command);
    return result.Item;
}
/**
 * Get Trust Score data from DynamoDB
 */
async function getTrustScoreData(propertyId) {
    const command = new lib_dynamodb_1.GetCommand({
        TableName: TRUST_SCORES_TABLE_NAME,
        Key: { propertyId },
    });
    const result = await docClient.send(command);
    return result.Item;
}
/**
 * Get documents from DynamoDB
 */
async function getDocuments(propertyId) {
    const command = new lib_dynamodb_1.QueryCommand({
        TableName: DOCUMENTS_TABLE_NAME,
        IndexName: 'propertyId-uploadedAt-index',
        KeyConditionExpression: 'propertyId = :propertyId',
        ExpressionAttributeValues: {
            ':propertyId': propertyId,
        },
    });
    const result = await docClient.send(command);
    return result.Items || [];
}
/**
 * Generate PDF report
 */
async function generatePDF(property, lineageData, trustScoreData, documents) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
        });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        // Generate report content
        generateCoverPage(doc, property, trustScoreData);
        doc.addPage();
        generateTrustScoreBreakdown(doc, trustScoreData);
        doc.addPage();
        generateLineageVisualization(doc, lineageData);
        doc.addPage();
        generateExtractedDataSummary(doc, documents);
        doc.addPage();
        generateDocumentReferences(doc, documents);
        doc.end();
    });
}
/**
 * Generate cover page with property summary and Trust Score
 */
function generateCoverPage(doc, property, trustScoreData) {
    // Title
    doc.fontSize(28).font('Helvetica-Bold').text('Property Verification Report', {
        align: 'center',
    });
    doc.moveDown(2);
    // Trust Score - Large and prominent
    const score = trustScoreData.totalScore;
    const scoreColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#FFC107' : '#F44336';
    doc.fontSize(72).fillColor(scoreColor).text(score.toString(), {
        align: 'center',
    });
    doc.fontSize(18).fillColor('#000000').text('Trust Score', {
        align: 'center',
    });
    doc.moveDown(2);
    // Property details
    doc.fontSize(14).font('Helvetica-Bold').text('Property Details', {
        underline: true,
    });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    if (property.address) {
        doc.text(`Address: ${property.address}`);
    }
    if (property.surveyNumber) {
        doc.text(`Survey Number: ${property.surveyNumber}`);
    }
    doc.text(`Property ID: ${property.propertyId}`);
    doc.text(`Verification Date: ${new Date(trustScoreData.calculatedAt).toLocaleDateString()}`);
    doc.text(`Status: ${property.status}`);
    doc.moveDown(2);
    // Summary
    doc.fontSize(14).font('Helvetica-Bold').text('Summary', {
        underline: true,
    });
    doc.moveDown(0.5);
    doc.fontSize(12).font('Helvetica');
    const summary = generateSummaryText(trustScoreData);
    doc.text(summary, {
        align: 'justify',
    });
    // Footer
    doc.fontSize(10).fillColor('#666666').text('Generated by SatyaMool - Property Verification Platform', 50, doc.page.height - 70, {
        align: 'center',
    });
}
/**
 * Generate summary text based on Trust Score
 */
function generateSummaryText(trustScoreData) {
    const score = trustScoreData.totalScore;
    if (score >= 80) {
        return 'This property has a high Trust Score, indicating a clear and well-documented ownership chain. The verification process found minimal issues, and the property appears to have a strong legal foundation.';
    }
    else if (score >= 60) {
        return 'This property has a moderate Trust Score. While the ownership chain is generally traceable, there are some concerns that should be reviewed carefully. Additional due diligence is recommended.';
    }
    else {
        return 'This property has a low Trust Score, indicating significant concerns with the ownership chain or documentation. Careful legal review is strongly recommended before proceeding with any transaction.';
    }
}
/**
 * Generate Trust Score breakdown with explanations
 */
function generateTrustScoreBreakdown(doc, trustScoreData) {
    doc.fontSize(20).font('Helvetica-Bold').text('Trust Score Breakdown', {
        underline: true,
    });
    doc.moveDown(1);
    const components = trustScoreData.scoreBreakdown?.components || [];
    components.forEach((component, index) => {
        doc.fontSize(14).font('Helvetica-Bold').text(component.component);
        doc.fontSize(12).font('Helvetica');
        doc.text(`Score: ${component.score > 0 ? '+' : ''}${component.score}`);
        doc.text(`Explanation: ${component.explanation}`);
        if (index < components.length - 1) {
            doc.moveDown(1);
        }
    });
    doc.moveDown(1);
    // Factors
    if (trustScoreData.factors && trustScoreData.factors.length > 0) {
        doc.fontSize(14).font('Helvetica-Bold').text('Key Factors:');
        doc.fontSize(12).font('Helvetica');
        trustScoreData.factors.forEach((factor) => {
            doc.text(`• ${factor}`);
        });
    }
}
/**
 * Generate lineage visualization as text representation
 */
function generateLineageVisualization(doc, lineageData) {
    doc.fontSize(20).font('Helvetica-Bold').text('Ownership Lineage', {
        underline: true,
    });
    doc.moveDown(1);
    const nodes = lineageData.nodes || [];
    const edges = lineageData.edges || [];
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Owners: ${nodes.length}`);
    doc.text(`Total Transfers: ${edges.length}`);
    doc.text(`Gaps Detected: ${lineageData.gaps?.length || 0}`);
    doc.moveDown(1);
    // Mother Deed
    if (lineageData.motherDeed) {
        doc.fontSize(14).font('Helvetica-Bold').text('Mother Deed:');
        doc.fontSize(12).font('Helvetica');
        doc.text(`Owner: ${lineageData.motherDeed.name || 'Unknown'}`);
        doc.text(`Date: ${lineageData.motherDeed.date || 'Unknown'}`);
        doc.moveDown(1);
    }
    // Ownership chain
    doc.fontSize(14).font('Helvetica-Bold').text('Ownership Chain:');
    doc.fontSize(12).font('Helvetica');
    // Sort nodes by date if available
    const sortedNodes = [...nodes].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateA - dateB;
    });
    sortedNodes.forEach((node, index) => {
        const status = node.isGap ? '⚠️ GAP' : node.hasWarning ? '⚠️ WARNING' : '✓';
        doc.text(`${index + 1}. ${status} ${node.name || 'Unknown'} (${node.date || 'Date unknown'})`);
    });
    // Gaps
    if (lineageData.gaps && lineageData.gaps.length > 0) {
        doc.moveDown(1);
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#F44336').text('Gaps in Ownership:');
        doc.fontSize(12).font('Helvetica').fillColor('#000000');
        lineageData.gaps.forEach((gap, index) => {
            doc.text(`${index + 1}. ${gap.description || 'Gap detected in ownership chain'}`);
        });
    }
}
/**
 * Generate extracted data summary table
 */
function generateExtractedDataSummary(doc, documents) {
    doc.fontSize(20).font('Helvetica-Bold').text('Extracted Data Summary', {
        underline: true,
    });
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Total Documents: ${documents.length}`);
    doc.moveDown(1);
    documents.forEach((document, index) => {
        doc.fontSize(12).font('Helvetica-Bold').text(`Document ${index + 1}: ${document.documentType || 'Unknown Type'}`);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Uploaded: ${new Date(document.uploadedAt).toLocaleDateString()}`);
        doc.text(`Status: ${document.processingStatus}`);
        if (document.extractedData) {
            const data = document.extractedData;
            if (data.buyerName)
                doc.text(`Buyer: ${data.buyerName}`);
            if (data.sellerName)
                doc.text(`Seller: ${data.sellerName}`);
            if (data.transactionDate)
                doc.text(`Date: ${data.transactionDate}`);
            if (data.surveyNumber)
                doc.text(`Survey Number: ${data.surveyNumber}`);
            if (data.saleConsideration)
                doc.text(`Sale Consideration: ${data.saleConsideration}`);
        }
        if (index < documents.length - 1) {
            doc.moveDown(0.5);
        }
    });
}
/**
 * Generate document references
 */
function generateDocumentReferences(doc, documents) {
    doc.fontSize(20).font('Helvetica-Bold').text('Document References', {
        underline: true,
    });
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica');
    documents.forEach((document, index) => {
        doc.text(`[${index + 1}] ${document.documentType || 'Unknown'} - ${document.documentId}`);
        doc.text(`    S3 Key: ${document.s3Key}`);
        doc.text(`    Uploaded: ${new Date(document.uploadedAt).toISOString()}`);
        if (index < documents.length - 1) {
            doc.moveDown(0.3);
        }
    });
}
/**
 * Create error response
 */
function createErrorResponse(statusCode, errorCode, message) {
    const errorResponse = {
        error: errorCode,
        message: message,
    };
    return {
        statusCode: statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': true,
        },
        body: JSON.stringify(errorResponse),
    };
}
//# sourceMappingURL=generate-report.js.map