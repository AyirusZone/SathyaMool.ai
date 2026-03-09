/**
 * EC Retrieval Fallback Logic
 * 
 * Detects portal integration availability and falls back to manual EC upload
 * when government portal integration is unavailable.
 * 
 * Requirements: 19.3
 */

import { isStatePortalAvailable, getStatePortalConfig } from './state-portal-config';

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
export async function determineECRetrievalStrategy(
  state: string
): Promise<ECRetrievalResult> {
  try {
    // Check if state portal integration is available
    const isAvailable = await isStatePortalAvailable(state);

    if (isAvailable) {
      // Portal integration is available
      const config = await getStatePortalConfig(state);

      return {
        strategy: 'portal',
        available: true,
        message: `Government portal integration is available for ${state}. EC will be retrieved automatically.`,
        portalEndpoint: config?.portalEndpoint
      };
    } else {
      // Portal integration is not available - fallback to manual
      const config = await getStatePortalConfig(state);
      let fallbackReason = 'Portal integration not configured';

      if (config) {
        if (!config.enabled) {
          fallbackReason = 'Portal integration is disabled';
        } else if (config.status !== 'active') {
          fallbackReason = `Portal is in ${config.status} status`;
        }
      }

      return {
        strategy: 'manual',
        available: false,
        message: `Government portal integration is not available for ${state}. Please upload Encumbrance Certificate manually.`,
        fallbackReason
      };
    }
  } catch (error) {
    console.error(`Error determining EC retrieval strategy for ${state}:`, error);

    // On error, fallback to manual upload
    return {
      strategy: 'manual',
      available: false,
      message: `Unable to check portal availability for ${state}. Please upload Encumbrance Certificate manually.`,
      fallbackReason: 'Error checking portal availability'
    };
  }
}

/**
 * Check if manual EC upload is required
 */
export async function isManualUploadRequired(state: string): Promise<boolean> {
  const result = await determineECRetrievalStrategy(state);
  return result.strategy === 'manual';
}

/**
 * Get user-friendly message for EC retrieval
 */
export async function getECRetrievalMessage(state: string): Promise<string> {
  const result = await determineECRetrievalStrategy(state);
  return result.message;
}

/**
 * Get fallback instructions for manual upload
 */
export function getManualUploadInstructions(state: string): string {
  const stateSpecificInstructions: Record<string, string> = {
    'Karnataka': 'Visit https://kaveri.karnataka.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Tamil Nadu': 'Visit https://tnreginet.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Maharashtra': 'Visit https://igrmaharashtra.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Telangana': 'Visit https://registration.telangana.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Andhra Pradesh': 'Visit https://registration.ap.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Kerala': 'Visit https://eregistration.kerala.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Gujarat': 'Visit https://igrsgujarat.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Rajasthan': 'Visit https://igrsrajasthan.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Madhya Pradesh': 'Visit https://mpigr.gov.in to obtain your Encumbrance Certificate, then upload it here.',
    'Uttar Pradesh': 'Visit https://igrsup.gov.in to obtain your Encumbrance Certificate, then upload it here.'
  };

  return stateSpecificInstructions[state] || 
    'Please obtain your Encumbrance Certificate from your state\'s registration department and upload it here.';
}

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
export async function getECRetrievalInfo(state: string): Promise<EnhancedECRetrievalResult> {
  const result = await determineECRetrievalStrategy(state);

  if (result.strategy === 'manual') {
    return {
      ...result,
      manualUploadInstructions: getManualUploadInstructions(state)
    };
  }

  return result;
}
