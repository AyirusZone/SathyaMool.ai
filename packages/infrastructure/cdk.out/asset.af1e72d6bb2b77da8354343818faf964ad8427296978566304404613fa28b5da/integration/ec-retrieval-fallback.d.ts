/**
 * EC Retrieval Fallback Logic
 *
 * Detects portal integration availability and falls back to manual EC upload
 * when government portal integration is unavailable.
 *
 * Requirements: 19.3
 */
/**
 * EC retrieval strategy
 */
export type ECRetrievalStrategy = 'portal' | 'manual';
/**
 * EC retrieval result
 */
export interface ECRetrievalResult {
    strategy: ECRetrievalStrategy;
    available: boolean;
    message: string;
    portalEndpoint?: string;
    fallbackReason?: string;
}
/**
 * Determine EC retrieval strategy for a given state
 *
 * This function checks if government portal integration is available
 * and returns the appropriate strategy (portal or manual).
 *
 * Requirements: 19.3
 */
export declare function determineECRetrievalStrategy(state: string): Promise<ECRetrievalResult>;
/**
 * Check if manual EC upload is required
 */
export declare function isManualUploadRequired(state: string): Promise<boolean>;
/**
 * Get user-friendly message for EC retrieval
 */
export declare function getECRetrievalMessage(state: string): Promise<string>;
/**
 * Get fallback instructions for manual upload
 */
export declare function getManualUploadInstructions(state: string): string;
/**
 * Enhanced EC retrieval result with fallback instructions
 */
export interface EnhancedECRetrievalResult extends ECRetrievalResult {
    manualUploadInstructions?: string;
    portalUrl?: string;
}
/**
 * Get comprehensive EC retrieval information
 */
export declare function getECRetrievalInfo(state: string): Promise<EnhancedECRetrievalResult>;
