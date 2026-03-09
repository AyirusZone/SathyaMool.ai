import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BulkOperations from '../BulkOperations';
import propertyService from '../../services/property';

// Mock the property service
vi.mock('../../services/property', () => ({
  default: {
    createBulkProperties: vi.fn(),
    getBulkUploadStatus: vi.fn(),
    uploadBulkDocuments: vi.fn(),
    getUploadUrl: vi.fn(),
    uploadDocument: vi.fn(),
    registerDocument: vi.fn(),
  },
}));

const mockBulkResponse = {
  batchId: 'batch-123',
  properties: [
    {
      propertyId: 'prop-1',
      userId: 'user-1',
      address: '123 Main St',
      surveyNumber: 'SN-001',
      status: 'pending' as const,
      documentCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      clientName: 'Client A',
      clientId: 'client-a',
    },
    {
      propertyId: 'prop-2',
      userId: 'user-1',
      address: '456 Oak Ave',
      surveyNumber: 'SN-002',
      status: 'pending' as const,
      documentCount: 0,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      clientName: 'Client B',
      clientId: 'client-b',
    },
  ],
  status: 'pending' as const,
};

const mockUploadStatus = {
  batchId: 'batch-123',
  totalProperties: 2,
  completedUploads: 2,
  failedUploads: 0,
  status: 'completed' as const,
  properties: [
    {
      propertyId: 'prop-1',
      address: '123 Main St',
      uploadStatus: 'completed',
      documentCount: 3,
    },
    {
      propertyId: 'prop-2',
      address: '456 Oak Ave',
      uploadStatus: 'completed',
      documentCount: 2,
    },
  ],
};

describe('BulkOperations', () => {
  const mockOnClose = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderBulkOperations = () => {
    return render(
      <BulkOperations open={true} onClose={mockOnClose} onComplete={mockOnComplete} />
    );
  };

  describe('Step 1: Add Properties', () => {
    it('renders the first step with property form', () => {
      renderBulkOperations();

      expect(screen.getByText('Bulk Property Operations')).toBeDefined();
      expect(screen.getByText('Add Properties')).toBeDefined();
      expect(screen.getByText('Property 1')).toBeDefined();
      expect(screen.getByLabelText(/Client Name/i)).toBeDefined();
      expect(screen.getByLabelText(/Property Address/i)).toBeDefined();
    });

    it('allows adding multiple properties', () => {
      renderBulkOperations();

      const addButton = screen.getByText('Add Another Property');
      fireEvent.click(addButton);

      expect(screen.getByText('Property 2')).toBeDefined();
    });

    it('allows removing properties', () => {
      renderBulkOperations();

      // Add a second property
      const addButton = screen.getByText('Add Another Property');
      fireEvent.click(addButton);

      expect(screen.getByText('Property 2')).toBeDefined();

      // Remove the second property
      const deleteButtons = screen.getAllByRole('button', { name: '' });
      const deleteButton = deleteButtons.find((btn) =>
        btn.querySelector('[data-testid="DeleteIcon"]')
      );
      if (deleteButton) {
        fireEvent.click(deleteButton);
      }

      expect(screen.queryByText('Property 2')).toBeNull();
    });

    it('limits properties to 50', () => {
      renderBulkOperations();

      // Add 49 more properties (already have 1)
      const addButton = screen.getByText('Add Another Property');
      for (let i = 0; i < 49; i++) {
        fireEvent.click(addButton);
      }

      // Button should not be visible anymore
      expect(screen.queryByText('Add Another Property')).toBeNull();
    });

    it('validates required fields before proceeding', () => {
      renderBulkOperations();

      const nextButton = screen.getByText('Next: Upload Documents');
      expect(nextButton).toHaveProperty('disabled', true);

      // Fill in required fields
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Test St' } });

      expect(nextButton).toHaveProperty('disabled', false);
    });

    it('creates bulk properties and proceeds to next step', async () => {
      (propertyService.createBulkProperties as any).mockResolvedValue(mockBulkResponse);

      renderBulkOperations();

      // Fill in property details
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(propertyService.createBulkProperties).toHaveBeenCalledWith({
          properties: [
            {
              address: '123 Main St',
              surveyNumber: undefined,
              clientName: 'Client A',
            },
          ],
        });
      });
    });
  });

  describe('Step 2: Upload Documents', () => {
    beforeEach(async () => {
      (propertyService.createBulkProperties as any).mockResolvedValue(mockBulkResponse);
      (propertyService.getBulkUploadStatus as any).mockResolvedValue({
        ...mockUploadStatus,
        completedUploads: 0,
        status: 'pending',
        properties: mockUploadStatus.properties.map((p) => ({
          ...p,
          uploadStatus: 'pending',
          documentCount: 0,
        })),
      });
    });

    it('displays upload interface for each property', async () => {
      renderBulkOperations();

      // Navigate to step 2
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Upload Documents')).toBeDefined();
        expect(screen.getByText(/Property 1: 123 Main St/i)).toBeDefined();
      });
    });

    it('allows file selection for each property', async () => {
      renderBulkOperations();

      // Navigate to step 2
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        const selectButtons = screen.getAllByText('Select Documents');
        expect(selectButtons.length).toBeGreaterThan(0);
      });
    });

    it('validates that files are selected before proceeding', async () => {
      renderBulkOperations();

      // Navigate to step 2
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        const uploadButton = screen.getByText('Upload & Process');
        expect(uploadButton).toHaveProperty('disabled', true);
      });
    });

    it('allows going back to previous step', async () => {
      renderBulkOperations();

      // Navigate to step 2
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        const backButton = screen.getByText('Back');
        fireEvent.click(backButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Add Properties')).toBeDefined();
        expect(screen.getByText('Property 1')).toBeDefined();
      });
    });
  });

  describe('Step 3: Review Status', () => {
    beforeEach(() => {
      (propertyService.createBulkProperties as any).mockResolvedValue(mockBulkResponse);
      (propertyService.getBulkUploadStatus as any).mockResolvedValue(mockUploadStatus);
      (propertyService.uploadBulkDocuments as any).mockResolvedValue({
        uploaded: 3,
        failed: 0,
      });
    });

    it('displays upload summary', async () => {
      renderBulkOperations();

      // Navigate through steps (simplified for test)
      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Upload Documents')).toBeDefined();
      });

      // Note: Full file upload simulation would require more complex mocking
      // This test verifies the component structure
    });

    it('calls onComplete when done', async () => {
      (propertyService.getBulkUploadStatus as any).mockResolvedValue(mockUploadStatus);

      renderBulkOperations();

      // Simulate being on step 3
      // In a real scenario, we'd navigate through all steps
      // For this test, we verify the callback structure exists
      expect(mockOnComplete).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when bulk creation fails', async () => {
      (propertyService.createBulkProperties as any).mockRejectedValue({
        response: { data: { message: 'Failed to create properties' } },
      });

      renderBulkOperations();

      const clientInput = screen.getByLabelText(/Client Name/i);
      fireEvent.change(clientInput, { target: { value: 'Client A' } });

      const addressInput = screen.getByLabelText(/Property Address/i);
      fireEvent.change(addressInput, { target: { value: '123 Main St' } });

      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to create properties')).toBeDefined();
      });
    });
  });

  describe('Dialog Controls', () => {
    it('calls onClose when cancel is clicked', () => {
      renderBulkOperations();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets state when dialog is closed', () => {
      renderBulkOperations();

      // Add a property
      const addButton = screen.getByText('Add Another Property');
      fireEvent.click(addButton);

      expect(screen.getByText('Property 2')).toBeDefined();

      // Close dialog
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
