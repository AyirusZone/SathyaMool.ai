"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ses_1 = require("@aws-sdk/client-ses");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const sesClient = new client_ses_1.SESClient({});
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'SatyaMool-Users';
const PROPERTIES_TABLE = process.env.PROPERTIES_TABLE_NAME || 'SatyaMool-Properties';
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE_NAME || 'SatyaMool-Notifications';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@satyamool.com';
/**
 * Main Lambda handler for processing DynamoDB Stream events
 * Triggered by changes to Properties and Documents tables
 */
const handler = async (event) => {
    console.log('Processing DynamoDB Stream event:', JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        try {
            await processRecord(record);
        }
        catch (error) {
            console.error('Error processing record:', error);
            // Continue processing other records even if one fails
        }
    }
};
exports.handler = handler;
/**
 * Process individual DynamoDB Stream record
 */
async function processRecord(record) {
    if (!record.dynamodb?.NewImage) {
        console.log('No new image in record, skipping');
        return;
    }
    const newImage = (0, util_dynamodb_1.unmarshall)(record.dynamodb.NewImage);
    const oldImage = record.dynamodb.OldImage ? (0, util_dynamodb_1.unmarshall)(record.dynamodb.OldImage) : null;
    // Determine if this is a Property or Document record
    if (newImage.propertyId && newImage.userId && newImage.status) {
        // This is a Property record
        await handlePropertyStatusChange(newImage, oldImage);
    }
    else if (newImage.documentId && newImage.propertyId && newImage.processingStatus) {
        // This is a Document record
        await handleDocumentStatusChange(newImage, oldImage);
    }
}
/**
 * Handle property status changes
 */
async function handlePropertyStatusChange(property, oldProperty) {
    const statusChanged = !oldProperty || oldProperty.status !== property.status;
    if (!statusChanged) {
        return;
    }
    console.log(`Property ${property.propertyId} status changed: ${oldProperty?.status} -> ${property.status}`);
    // Handle completion notification
    if (property.status === 'completed') {
        await sendCompletionNotification(property);
    }
    // Handle failure notification
    if (property.status === 'failed') {
        await sendFailureNotification(property);
    }
}
/**
 * Handle document status changes
 */
async function handleDocumentStatusChange(document, oldDocument) {
    const statusChanged = !oldDocument || oldDocument.processingStatus !== document.processingStatus;
    if (!statusChanged) {
        return;
    }
    console.log(`Document ${document.documentId} status changed: ${oldDocument?.processingStatus} -> ${document.processingStatus}`);
    // Handle OCR quality warnings
    if (document.processingStatus === 'ocr_complete' && document.ocrConfidence && document.ocrConfidence < 70) {
        await sendQualityWarningNotification(document, 'ocr');
    }
    // Handle translation failure warnings
    if (document.processingStatus === 'translation_failed' || document.translationStatus === 'failed') {
        await sendQualityWarningNotification(document, 'translation');
    }
    // Handle document processing failure
    if (document.processingStatus === 'failed') {
        await sendDocumentFailureNotification(document);
    }
}
/**
 * Send completion notification when property verification completes
 */
async function sendCompletionNotification(property) {
    const user = await getUserById(property.userId);
    if (!user || !user.email) {
        console.error(`User ${property.userId} not found or has no email`);
        return;
    }
    const subject = 'Property Verification Complete - SatyaMool';
    const trustScoreText = property.trustScore !== undefined
        ? `Trust Score: ${property.trustScore}/100`
        : 'Trust Score: Calculating...';
    const htmlBody = `
    <html>
      <body>
        <h2>Property Verification Complete</h2>
        <p>Your property verification for <strong>${property.address}</strong> has been completed successfully.</p>
        <p><strong>${trustScoreText}</strong></p>
        <p>You can now view the detailed lineage graph and download your property report.</p>
        <p><a href="${getPropertyUrl(property.propertyId)}">View Property Details</a></p>
        <br>
        <p>Thank you for using SatyaMool!</p>
      </body>
    </html>
  `;
    const textBody = `
Property Verification Complete

Your property verification for ${property.address} has been completed successfully.

${trustScoreText}

You can now view the detailed lineage graph and download your property report.

View Property Details: ${getPropertyUrl(property.propertyId)}

Thank you for using SatyaMool!
  `;
    await sendEmail(user.email, subject, htmlBody, textBody);
    await storeNotification(property.userId, property.propertyId, 'completion', subject, textBody);
}
/**
 * Send failure notification when property verification fails
 */
async function sendFailureNotification(property) {
    const user = await getUserById(property.userId);
    if (!user || !user.email) {
        console.error(`User ${property.userId} not found or has no email`);
        return;
    }
    const subject = 'Property Verification Failed - SatyaMool';
    const htmlBody = `
    <html>
      <body>
        <h2>Property Verification Failed</h2>
        <p>Unfortunately, the verification for <strong>${property.address}</strong> has failed.</p>
        <h3>Suggested Actions:</h3>
        <ul>
          <li>Check if all required documents were uploaded correctly</li>
          <li>Ensure documents are clear and readable</li>
          <li>Verify that documents are in supported formats (PDF, JPEG, PNG, TIFF)</li>
          <li>Try re-uploading the documents</li>
        </ul>
        <p>If the problem persists, please contact our support team.</p>
        <p><a href="${getPropertyUrl(property.propertyId)}">View Property Details</a></p>
      </body>
    </html>
  `;
    const textBody = `
Property Verification Failed

Unfortunately, the verification for ${property.address} has failed.

Suggested Actions:
- Check if all required documents were uploaded correctly
- Ensure documents are clear and readable
- Verify that documents are in supported formats (PDF, JPEG, PNG, TIFF)
- Try re-uploading the documents

If the problem persists, please contact our support team.

View Property Details: ${getPropertyUrl(property.propertyId)}
  `;
    await sendEmail(user.email, subject, htmlBody, textBody);
    await storeNotification(property.userId, property.propertyId, 'failure', subject, textBody);
}
/**
 * Send quality warning notification for OCR or translation issues
 */
async function sendQualityWarningNotification(document, type) {
    // Get property to find user
    const property = await getPropertyById(document.propertyId);
    if (!property) {
        console.error(`Property ${document.propertyId} not found`);
        return;
    }
    const user = await getUserById(property.userId);
    if (!user || !user.email) {
        console.error(`User ${property.userId} not found or has no email`);
        return;
    }
    let subject;
    let htmlBody;
    let textBody;
    if (type === 'ocr') {
        subject = 'Document Quality Warning - SatyaMool';
        htmlBody = `
      <html>
        <body>
          <h2>Document Quality Warning</h2>
          <p>We detected low OCR confidence (below 70%) for a document in your property verification for <strong>${property.address}</strong>.</p>
          <p>This may be due to:</p>
          <ul>
            <li>Faded or damaged document</li>
            <li>Poor scan quality</li>
            <li>Handwritten text</li>
            <li>Low resolution image</li>
          </ul>
          <h3>Recommended Actions:</h3>
          <ul>
            <li>Re-scan the document with higher quality settings</li>
            <li>Ensure good lighting and contrast</li>
            <li>Consider re-uploading a clearer version</li>
            <li>Manual review may be required for accuracy</li>
          </ul>
          <p><a href="${getPropertyUrl(property.propertyId)}">View Property Details</a></p>
        </body>
      </html>
    `;
        textBody = `
Document Quality Warning

We detected low OCR confidence (below 70%) for a document in your property verification for ${property.address}.

This may be due to:
- Faded or damaged document
- Poor scan quality
- Handwritten text
- Low resolution image

Recommended Actions:
- Re-scan the document with higher quality settings
- Ensure good lighting and contrast
- Consider re-uploading a clearer version
- Manual review may be required for accuracy

View Property Details: ${getPropertyUrl(property.propertyId)}
    `;
    }
    else {
        subject = 'Translation Failed - SatyaMool';
        htmlBody = `
      <html>
        <body>
          <h2>Translation Failed</h2>
          <p>We were unable to translate a document in your property verification for <strong>${property.address}</strong>.</p>
          <h3>Recommended Actions:</h3>
          <ul>
            <li>The original OCR text is available for manual review</li>
            <li>Consider re-uploading a clearer version of the document</li>
            <li>Contact support if you need assistance with translation</li>
          </ul>
          <p><a href="${getPropertyUrl(property.propertyId)}">View Property Details</a></p>
        </body>
      </html>
    `;
        textBody = `
Translation Failed

We were unable to translate a document in your property verification for ${property.address}.

Recommended Actions:
- The original OCR text is available for manual review
- Consider re-uploading a clearer version of the document
- Contact support if you need assistance with translation

View Property Details: ${getPropertyUrl(property.propertyId)}
    `;
    }
    await sendEmail(user.email, subject, htmlBody, textBody);
    await storeNotification(property.userId, property.propertyId, 'quality_warning', subject, textBody);
}
/**
 * Send notification when document processing fails
 */
async function sendDocumentFailureNotification(document) {
    const property = await getPropertyById(document.propertyId);
    if (!property) {
        console.error(`Property ${document.propertyId} not found`);
        return;
    }
    const user = await getUserById(property.userId);
    if (!user || !user.email) {
        console.error(`User ${property.userId} not found or has no email`);
        return;
    }
    const subject = 'Document Processing Failed - SatyaMool';
    const errorDetails = document.errorMessage || 'Unknown error occurred';
    const htmlBody = `
    <html>
      <body>
        <h2>Document Processing Failed</h2>
        <p>A document in your property verification for <strong>${property.address}</strong> failed to process.</p>
        <p><strong>Error Details:</strong> ${errorDetails}</p>
        <h3>Suggested Actions:</h3>
        <ul>
          <li>Verify the document is in a supported format (PDF, JPEG, PNG, TIFF)</li>
          <li>Ensure the document is not corrupted</li>
          <li>Check that the file size is under 50MB</li>
          <li>Try re-uploading the document</li>
        </ul>
        <p><a href="${getPropertyUrl(property.propertyId)}">View Property Details</a></p>
      </body>
    </html>
  `;
    const textBody = `
Document Processing Failed

A document in your property verification for ${property.address} failed to process.

Error Details: ${errorDetails}

Suggested Actions:
- Verify the document is in a supported format (PDF, JPEG, PNG, TIFF)
- Ensure the document is not corrupted
- Check that the file size is under 50MB
- Try re-uploading the document

View Property Details: ${getPropertyUrl(property.propertyId)}
  `;
    await sendEmail(user.email, subject, htmlBody, textBody);
    await storeNotification(property.userId, property.propertyId, 'document_failure', subject, textBody);
}
/**
 * Send email using AWS SES
 */
async function sendEmail(toEmail, subject, htmlBody, textBody) {
    try {
        const command = new client_ses_1.SendEmailCommand({
            Source: FROM_EMAIL,
            Destination: {
                ToAddresses: [toEmail],
            },
            Message: {
                Subject: {
                    Data: subject,
                    Charset: 'UTF-8',
                },
                Body: {
                    Html: {
                        Data: htmlBody,
                        Charset: 'UTF-8',
                    },
                    Text: {
                        Data: textBody,
                        Charset: 'UTF-8',
                    },
                },
            },
        });
        await sesClient.send(command);
        console.log(`Email sent successfully to ${toEmail}`);
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
/**
 * Store notification in DynamoDB for in-app notification history
 */
async function storeNotification(userId, propertyId, type, subject, message) {
    try {
        const notificationId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const timestamp = new Date().toISOString();
        const command = new lib_dynamodb_1.PutCommand({
            TableName: NOTIFICATIONS_TABLE,
            Item: {
                notificationId,
                userId,
                propertyId,
                type,
                subject,
                message,
                read: false,
                createdAt: timestamp,
            },
        });
        await docClient.send(command);
        console.log(`Notification stored: ${notificationId}`);
    }
    catch (error) {
        console.error('Error storing notification:', error);
        // Don't throw - notification storage failure shouldn't block email sending
    }
}
/**
 * Get user by ID from DynamoDB
 */
async function getUserById(userId) {
    try {
        const command = new lib_dynamodb_1.GetCommand({
            TableName: USERS_TABLE,
            Key: { userId },
        });
        const response = await docClient.send(command);
        return response.Item;
    }
    catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}
/**
 * Get property by ID from DynamoDB
 */
async function getPropertyById(propertyId) {
    try {
        const command = new lib_dynamodb_1.GetCommand({
            TableName: PROPERTIES_TABLE,
            Key: { propertyId },
        });
        const response = await docClient.send(command);
        return response.Item;
    }
    catch (error) {
        console.error('Error getting property:', error);
        return null;
    }
}
/**
 * Generate property URL for email links
 */
function getPropertyUrl(propertyId) {
    const baseUrl = process.env.FRONTEND_URL || 'https://app.satyamool.com';
    return `${baseUrl}/properties/${propertyId}`;
}
//# sourceMappingURL=index.js.map