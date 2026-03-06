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
/**
 * Sensitive fields that require encryption
 */
export declare const SENSITIVE_FIELDS: {
    USER: string[];
    PROPERTY: string[];
    DOCUMENT: string[];
};
/**
 * Encrypt a single field value (STUB - returns plaintext)
 */
export declare function encryptField(plaintext: string, context?: Record<string, string>): Promise<string>;
/**
 * Decrypt a single field value (STUB - returns ciphertext as-is)
 */
export declare function decryptField(ciphertext: string, context?: Record<string, string>): Promise<string>;
/**
 * Encrypt sensitive fields in a user object (STUB - returns unchanged)
 */
export declare function encryptUserFields(user: any): Promise<any>;
/**
 * Decrypt sensitive fields in a user object (STUB - returns unchanged)
 */
export declare function decryptUserFields(user: any): Promise<any>;
/**
 * Encrypt sensitive fields in a property object (STUB - returns unchanged)
 */
export declare function encryptPropertyFields(property: any): Promise<any>;
/**
 * Decrypt sensitive fields in a property object (STUB - returns unchanged)
 */
export declare function decryptPropertyFields(property: any): Promise<any>;
/**
 * Encrypt sensitive fields in extracted document data (STUB - returns unchanged)
 */
export declare function encryptDocumentFields(documentId: string, extractedData: any): Promise<any>;
/**
 * Decrypt sensitive fields in extracted document data (STUB - returns unchanged)
 */
export declare function decryptDocumentFields(documentId: string, extractedData: any): Promise<any>;
/**
 * Batch encrypt multiple fields (STUB - returns unchanged)
 */
export declare function encryptFieldsBatch(fields: string[], context: Record<string, string>): Promise<string[]>;
/**
 * Batch decrypt multiple fields (STUB - returns unchanged)
 */
export declare function decryptFieldsBatch(fields: string[], context: Record<string, string>): Promise<string[]>;
