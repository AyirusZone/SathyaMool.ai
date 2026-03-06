/**
 * Unit tests for EC retrieval fallback logic
 * 
 * Tests portal availability detection and fallback to manual upload.
 * Requirements: 19.3
 */

import {
  determineECRetrievalStrategy,
  isManualUploadRequired,
  getECRetrievalMessage,
  getManualUploadInstructions,
  getECRetrievalInfo
} from '../ec-retrieval-fallback';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EC Retrieval Fallback Logic', () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.STATE_CONFIG_TABLE = 'SatyaMool-StatePortalConfigurations';
  });

  describe('determineECRetrievalStrategy', () => {
    it('should return portal strategy when integration is available', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: true,
          status: 'active',
          portalEndpoint: 'https://kaveri.karnataka.gov.in/api/ec'
        }
      });

      const result = await determineECRetrievalStrategy('Karnataka');

      expect(result.strategy).toBe('portal');
      expect(result.available).toBe(true);
      expect(result.message).toContain('available');
      expect(result.portalEndpoint).toBe('https://kaveri.karnataka.gov.in/api/ec');
    });

    it('should return manual strategy when integration is disabled', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: false,
          status: 'inactive',
          portalEndpoint: 'https://kaveri.karnataka.gov.in/api/ec'
        }
      });

      const result = await determineECRetrievalStrategy('Karnataka');

      expect(result.strategy).toBe('manual');
      expect(result.available).toBe(false);
      expect(result.message).toContain('not available');
      expect(result.fallbackReason).toBe('Portal integration is disabled');
    });

    it('should return manual strategy when portal is in maintenance', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: true,
          status: 'maintenance',
          portalEndpoint: 'https://kaveri.karnataka.gov.in/api/ec'
        }
      });

      const result = await determineECRetrievalStrategy('Karnataka');

      expect(result.strategy).toBe('manual');
      expect(result.available).toBe(false);
      expect(result.fallbackReason).toBe('Portal is in maintenance status');
    });

    it('should return manual strategy when no configuration exists', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await determineECRetrievalStrategy('UnknownState');

      expect(result.strategy).toBe('manual');
      expect(result.available).toBe(false);
      expect(result.fallbackReason).toBe('Portal integration not configured');
    });

    it('should return manual strategy on database error', async () => {
      ddbMock.on(GetCommand).rejects(new Error('Database error'));

      const result = await determineECRetrievalStrategy('Karnataka');

      expect(result.strategy).toBe('manual');
      expect(result.available).toBe(false);
      expect(result.fallbackReason).toBe('Error checking portal availability');
    });
  });

  describe('isManualUploadRequired', () => {
    it('should return false when portal is available', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: true,
          status: 'active'
        }
      });

      const result = await isManualUploadRequired('Karnataka');

      expect(result).toBe(false);
    });

    it('should return true when portal is unavailable', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: false,
          status: 'inactive'
        }
      });

      const result = await isManualUploadRequired('Karnataka');

      expect(result).toBe(true);
    });

    it('should return true when no configuration exists', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const result = await isManualUploadRequired('UnknownState');

      expect(result).toBe(true);
    });
  });

  describe('getECRetrievalMessage', () => {
    it('should return success message when portal is available', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: true,
          status: 'active'
        }
      });

      const message = await getECRetrievalMessage('Karnataka');

      expect(message).toContain('available');
      expect(message).toContain('Karnataka');
    });

    it('should return fallback message when portal is unavailable', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const message = await getECRetrievalMessage('Karnataka');

      expect(message).toContain('not available');
      expect(message).toContain('manually');
    });
  });

  describe('getManualUploadInstructions', () => {
    it('should return Karnataka-specific instructions', () => {
      const instructions = getManualUploadInstructions('Karnataka');

      expect(instructions).toContain('kaveri.karnataka.gov.in');
      expect(instructions).toContain('Encumbrance Certificate');
    });

    it('should return Tamil Nadu-specific instructions', () => {
      const instructions = getManualUploadInstructions('Tamil Nadu');

      expect(instructions).toContain('tnreginet.gov.in');
      expect(instructions).toContain('Encumbrance Certificate');
    });

    it('should return Maharashtra-specific instructions', () => {
      const instructions = getManualUploadInstructions('Maharashtra');

      expect(instructions).toContain('igrmaharashtra.gov.in');
      expect(instructions).toContain('Encumbrance Certificate');
    });

    it('should return generic instructions for unknown state', () => {
      const instructions = getManualUploadInstructions('UnknownState');

      expect(instructions).toContain('registration department');
      expect(instructions).toContain('Encumbrance Certificate');
    });

    it('should return instructions for all major states', () => {
      const states = [
        'Karnataka',
        'Tamil Nadu',
        'Maharashtra',
        'Telangana',
        'Andhra Pradesh',
        'Kerala',
        'Gujarat',
        'Rajasthan',
        'Madhya Pradesh',
        'Uttar Pradesh'
      ];

      states.forEach(state => {
        const instructions = getManualUploadInstructions(state);
        expect(instructions).toBeTruthy();
        expect(instructions).toContain('Encumbrance Certificate');
      });
    });
  });

  describe('getECRetrievalInfo', () => {
    it('should include manual upload instructions when portal is unavailable', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: false,
          status: 'inactive'
        }
      });

      const info = await getECRetrievalInfo('Karnataka');

      expect(info.strategy).toBe('manual');
      expect(info.manualUploadInstructions).toBeDefined();
      expect(info.manualUploadInstructions).toContain('kaveri.karnataka.gov.in');
    });

    it('should not include manual upload instructions when portal is available', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: true,
          status: 'active',
          portalEndpoint: 'https://kaveri.karnataka.gov.in/api/ec'
        }
      });

      const info = await getECRetrievalInfo('Karnataka');

      expect(info.strategy).toBe('portal');
      expect(info.manualUploadInstructions).toBeUndefined();
      expect(info.portalEndpoint).toBe('https://kaveri.karnataka.gov.in/api/ec');
    });

    it('should handle errors gracefully', async () => {
      ddbMock.on(GetCommand).rejects(new Error('Database error'));

      const info = await getECRetrievalInfo('Karnataka');

      expect(info.strategy).toBe('manual');
      expect(info.available).toBe(false);
      expect(info.manualUploadInstructions).toBeDefined();
    });
  });

  describe('Fallback Behavior', () => {
    it('should consistently fallback to manual when portal is unavailable', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      // Test multiple calls to ensure consistency
      const result1 = await determineECRetrievalStrategy('TestState');
      const result2 = await isManualUploadRequired('TestState');
      const result3 = await getECRetrievalInfo('TestState');

      expect(result1.strategy).toBe('manual');
      expect(result2).toBe(true);
      expect(result3.strategy).toBe('manual');
    });

    it('should provide actionable information in fallback scenario', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          state: 'Karnataka',
          enabled: false,
          status: 'inactive'
        }
      });

      const info = await getECRetrievalInfo('Karnataka');

      expect(info.message).toBeTruthy();
      expect(info.fallbackReason).toBeTruthy();
      expect(info.manualUploadInstructions).toBeTruthy();
      expect(info.manualUploadInstructions).toContain('http');
    });
  });
});
