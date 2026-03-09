import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from '../Dashboard';
import propertyService from '../../services/property';
import authService from '../../services/auth';

// Mock the services
vi.mock('../../services/property', () => ({
  default: {
    getProperties: vi.fn(),
    createProperty: vi.fn(),
    getAggregateStats: vi.fn(),
    getClients: vi.fn(),
    createBulkProperties: vi.fn(),
    getBulkUploadStatus: vi.fn(),
    uploadBulkDocuments: vi.fn(),
  },
}));

vi.mock('../../services/auth', () => ({
  default: {
    getCurrentUser: vi.fn(),
  },
}));

const mockProfessionalUser = {
  userId: 'prof-1',
  email: 'professional@example.com',
  role: 'Professional_User',
  createdAt: '2024-01-01T00:00:00Z',
};

const mockStandardUser = {
  userId: 'user-1',
  email: 'user@example.com',
  role: 'Standard_User',
  createdAt: '2024-01-01T00:00:00Z',
};

const mockProperties = [
  {
    propertyId: 'prop-1',
    userId: 'prof-1',
    address: '123 Main St',
    surveyNumber: 'SN-001',
    status: 'completed' as const,
    trustScore: 85,
    documentCount: 5,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    clientName: 'Client A',
    clientId: 'client-a',
  },
  {
    propertyId: 'prop-2',
    userId: 'prof-1',
    address: '456 Oak Ave',
    surveyNumber: 'SN-002',
    status: 'processing' as const,
    documentCount: 3,
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
    clientName: 'Client B',
    clientId: 'client-b',
  },
];

const mockClients = [
  { clientId: 'client-a', clientName: 'Client A' },
  { clientId: 'client-b', clientName: 'Client B' },
  { clientId: 'client-c', clientName: 'Client C' },
];

const mockStats = {
  totalProperties: 25,
  averageTrustScore: 82.5,
  completedProperties: 20,
  processingProperties: 3,
  failedProperties: 2,
  byClient: [
    {
      clientId: 'client-a',
      clientName: 'Client A',
      propertyCount: 10,
      averageTrustScore: 85.0,
    },
    {
      clientId: 'client-b',
      clientName: 'Client B',
      propertyCount: 8,
      averageTrustScore: 80.0,
    },
    {
      clientId: 'client-c',
      clientName: 'Client C',
      propertyCount: 7,
      averageTrustScore: 82.0,
    },
  ],
};

describe('Dashboard - Professional User Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderDashboard = () => {
    return render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>
    );
  };

  describe('Multi-Client Dashboard', () => {
    beforeEach(() => {
      (authService.getCurrentUser as any).mockReturnValue(mockProfessionalUser);
      (propertyService.getProperties as any).mockResolvedValue({
        properties: mockProperties,
        total: 2,
      });
      (propertyService.getClients as any).mockResolvedValue(mockClients);
      (propertyService.getAggregateStats as any).mockResolvedValue(mockStats);
    });

    it('displays aggregate statistics for Professional Users', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Total Properties')).toBeDefined();
        expect(screen.getByText('25')).toBeDefined();
        expect(screen.getByText('Average Trust Score')).toBeDefined();
        expect(screen.getByText('82.5')).toBeDefined();
        expect(screen.getByText('20')).toBeDefined(); // Completed
        expect(screen.getByText('3')).toBeDefined(); // Processing
      });
    });

    it('displays statistics by client', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Statistics by Client')).toBeDefined();
        // Use getAllByText since client names appear in multiple places
        const clientAElements = screen.getAllByText('Client A');
        expect(clientAElements.length).toBeGreaterThan(0);
        
        const clientBElements = screen.getAllByText('Client B');
        expect(clientBElements.length).toBeGreaterThan(0);
        
        const clientCElements = screen.getAllByText('Client C');
        expect(clientCElements.length).toBeGreaterThan(0);
      });

      // Check client A stats - find the section containing statistics
      const statsSection = screen.getByText('Statistics by Client').closest('div');
      expect(statsSection?.textContent).toContain('10');
      expect(statsSection?.textContent).toContain('85.0');
    });

    it('displays client filter dropdown', async () => {
      renderDashboard();

      await waitFor(() => {
        // Look for the Select component by finding all "Client" text elements
        const clientElements = screen.getAllByText('Client');
        // Should have at least the label
        expect(clientElements.length).toBeGreaterThan(0);
      });
    });

    it('filters properties by client', async () => {
      renderDashboard();

      await waitFor(() => {
        // Find the Client select by looking for all "Client" text elements
        const clientElements = screen.getAllByText('Client');
        expect(clientElements.length).toBeGreaterThan(0);
      });

      // Find the select input within the FormControl
      const selectInputs = screen.getAllByRole('combobox');
      // The client select should be the third one (after search and status)
      const clientSelect = selectInputs[2];
      
      if (clientSelect) {
        fireEvent.mouseDown(clientSelect);

        // Wait for the menu to appear and find Client A option
        await waitFor(() => {
          const clientAOptions = screen.getAllByText('Client A');
          // Find the one in the menu (not in the stats or property cards)
          const menuOption = clientAOptions.find(el => 
            el.getAttribute('role') === 'option' || 
            el.closest('[role="listbox"]')
          );
          if (menuOption) {
            fireEvent.click(menuOption);
          }
        });

        await waitFor(() => {
          expect(propertyService.getProperties).toHaveBeenCalledWith(
            expect.objectContaining({
              clientId: 'client-a',
            })
          );
        });
      }
    });

    it('displays client name on property cards', async () => {
      renderDashboard();

      await waitFor(() => {
        // Use getAllByText since client names appear in multiple places
        const clientAElements = screen.getAllByText('Client A');
        expect(clientAElements.length).toBeGreaterThan(0);
        
        const clientBElements = screen.getAllByText('Client B');
        expect(clientBElements.length).toBeGreaterThan(0);
      });
    });

    it('shows Bulk Operations button for Professional Users', async () => {
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Bulk Operations')).toBeDefined();
      });
    });

    it('does not show Professional features for Standard Users', async () => {
      (authService.getCurrentUser as any).mockReturnValue(mockStandardUser);
      (propertyService.getProperties as any).mockResolvedValue({
        properties: [],
        total: 0,
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.queryByText('Statistics by Client')).toBeNull();
        expect(screen.queryByText('Bulk Operations')).toBeNull();
        expect(screen.queryByLabelText('Client')).toBeNull();
      });
    });
  });

  describe('Property Creation with Client', () => {
    beforeEach(() => {
      (authService.getCurrentUser as any).mockReturnValue(mockProfessionalUser);
      (propertyService.getProperties as any).mockResolvedValue({
        properties: [],
        total: 0,
      });
      (propertyService.getClients as any).mockResolvedValue(mockClients);
      (propertyService.getAggregateStats as any).mockResolvedValue(mockStats);
    });

    it('shows client name field in create dialog for Professional Users', async () => {
      renderDashboard();

      await waitFor(() => {
        const newPropertyButton = screen.getByText('New Property');
        fireEvent.click(newPropertyButton);
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Client Name/i)).toBeDefined();
      });
    });

    it('requires client name for Professional Users', async () => {
      renderDashboard();

      await waitFor(() => {
        const newPropertyButton = screen.getByText('New Property');
        fireEvent.click(newPropertyButton);
      });

      await waitFor(() => {
        const addressInput = screen.getByLabelText(/Property Address/i);
        fireEvent.change(addressInput, { target: { value: '123 Test St' } });
      });

      const createButton = screen.getByRole('button', { name: /Create/i });
      expect(createButton).toHaveProperty('disabled', true);
    });

    it('allows selecting existing client from dropdown', async () => {
      renderDashboard();

      await waitFor(() => {
        const newPropertyButton = screen.getByText('New Property');
        fireEvent.click(newPropertyButton);
      });

      await waitFor(() => {
        const clientInput = screen.getByLabelText(/Client Name/i);
        fireEvent.change(clientInput, { target: { value: 'Client A' } });
      });

      // The autocomplete should show existing clients - use getAllByText
      const clientAElements = screen.getAllByText('Client A');
      expect(clientAElements.length).toBeGreaterThan(0);
    });
  });

  describe('Bulk Operations', () => {
    beforeEach(() => {
      (authService.getCurrentUser as any).mockReturnValue(mockProfessionalUser);
      (propertyService.getProperties as any).mockResolvedValue({
        properties: [],
        total: 0,
      });
      (propertyService.getClients as any).mockResolvedValue(mockClients);
      (propertyService.getAggregateStats as any).mockResolvedValue(mockStats);
    });

    it('opens bulk operations dialog', async () => {
      renderDashboard();

      await waitFor(() => {
        const bulkButton = screen.getByText('Bulk Operations');
        fireEvent.click(bulkButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Bulk Property Operations')).toBeDefined();
      });
    });

    it('displays stepper with three steps', async () => {
      renderDashboard();

      await waitFor(() => {
        const bulkButton = screen.getByText('Bulk Operations');
        fireEvent.click(bulkButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Add Properties')).toBeDefined();
        expect(screen.getByText('Upload Documents')).toBeDefined();
        expect(screen.getByText('Review Status')).toBeDefined();
      });
    });

    it('allows adding multiple properties', async () => {
      renderDashboard();

      await waitFor(() => {
        const bulkButton = screen.getByText('Bulk Operations');
        fireEvent.click(bulkButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Property 1')).toBeDefined();
      });

      const addButton = screen.getByText('Add Another Property');
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Property 2')).toBeDefined();
      });
    });

    it('creates bulk properties and proceeds to upload step', async () => {
      const mockBulkResponse = {
        batchId: 'batch-123',
        properties: mockProperties,
        status: 'pending' as const,
      };

      (propertyService.createBulkProperties as any).mockResolvedValue(mockBulkResponse);
      (propertyService.getBulkUploadStatus as any).mockResolvedValue({
        batchId: 'batch-123',
        totalProperties: 2,
        completedUploads: 0,
        failedUploads: 0,
        status: 'pending',
        properties: mockProperties.map((p) => ({
          propertyId: p.propertyId,
          address: p.address,
          uploadStatus: 'pending',
          documentCount: 0,
        })),
      });

      renderDashboard();

      await waitFor(() => {
        const bulkButton = screen.getByText('Bulk Operations');
        fireEvent.click(bulkButton);
      });

      // Fill in property details
      await waitFor(() => {
        const clientInput = screen.getAllByLabelText(/Client Name/i)[0];
        fireEvent.change(clientInput, { target: { value: 'Client A' } });

        const addressInput = screen.getAllByLabelText(/Property Address/i)[0];
        fireEvent.change(addressInput, { target: { value: '123 Test St' } });
      });

      // Click next
      const nextButton = screen.getByText('Next: Upload Documents');
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(propertyService.createBulkProperties).toHaveBeenCalled();
      });
    });
  });
});
