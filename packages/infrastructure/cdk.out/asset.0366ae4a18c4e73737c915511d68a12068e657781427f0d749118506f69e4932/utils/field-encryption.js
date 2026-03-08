"use strict";
/**
 * Field-Level Encryption Utility
 *
 * Uses AWS Encryption SDK for client-side encryption of sensitive fields
 * before storing in DynamoDB.
 *
 * Requirements: 13.3 - Field-level encryption for sensitive data
 *
 * NOTE: Temporarily disabled - requires @aws-crypto/client-node dependency
 * Currently returns plaintext values (encryption disabled)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SENSITIVE_FIELDS = void 0;
exports.encryptField = encryptField;
exports.decryptField = decryptField;
exports.encryptUserFields = encryptUserFields;
exports.decryptUserFields = decryptUserFields;
exports.encryptPropertyFields = encryptPropertyFields;
exports.decryptPropertyFields = decryptPropertyFields;
exports.encryptDocumentFields = encryptDocumentFields;
exports.decryptDocumentFields = decryptDocumentFields;
exports.encryptFieldsBatch = encryptFieldsBatch;
exports.decryptFieldsBatch = decryptFieldsBatch;
/**
 * Sensitive fields that require encryption
 */
exports.SENSITIVE_FIELDS = {
    // User table
    USER: ['email', 'phoneNumber', 'fullName'],
    // Properties table
    PROPERTY: ['address', 'ownerName'],
    // Documents table
    DOCUMENT: ['extractedData.buyerName', 'extractedData.sellerName', 'extractedData.ownerName'],
};
/**
 * Encrypt a single field value (STUB - returns plaintext)
 */
async function encryptField(plaintext, context = {}) {
    // TODO: Implement actual encryption with @aws-crypto/client-node
    return plaintext;
}
/**
 * Decrypt a single field value (STUB - returns ciphertext as-is)
 */
async function decryptField(ciphertext, context = {}) {
    // TODO: Implement actual decryption with @aws-crypto/client-node
    return ciphertext;
}
/**
 * Encrypt sensitive fields in a user object (STUB - returns unchanged)
 */
async function encryptUserFields(user) {
    return user;
}
/**
 * Decrypt sensitive fields in a user object (STUB - returns unchanged)
 */
async function decryptUserFields(user) {
    return user;
}
/**
 * Encrypt sensitive fields in a property object (STUB - returns unchanged)
 */
async function encryptPropertyFields(property) {
    return property;
}
/**
 * Decrypt sensitive fields in a property object (STUB - returns unchanged)
 */
async function decryptPropertyFields(property) {
    return property;
}
/**
 * Encrypt sensitive fields in extracted document data (STUB - returns unchanged)
 */
async function encryptDocumentFields(documentId, extractedData) {
    return extractedData;
}
/**
 * Decrypt sensitive fields in extracted document data (STUB - returns unchanged)
 */
async function decryptDocumentFields(documentId, extractedData) {
    return extractedData;
}
/**
 * Batch encrypt multiple fields (STUB - returns unchanged)
 */
async function encryptFieldsBatch(fields, context) {
    return fields;
}
/**
 * Batch decrypt multiple fields (STUB - returns unchanged)
 */
async function decryptFieldsBatch(fields, context) {
    return fields;
}
//# sourceMappingURL=field-encryption.js.map