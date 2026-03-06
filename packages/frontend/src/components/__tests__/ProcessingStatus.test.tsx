import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import ProcessingStatus from '../ProcessingStatus';

describe('ProcessingStatus', () => {
  it('renders pending status correctly', () => {
    render(<ProcessingStatus status="pending" documentCount={5} />);
    expect(screen.getByText('PENDING')).toBeDefined();
  });

  it('renders processing status with progress', () => {
    render(<ProcessingStatus status="processing" documentCount={10} processedCount={5} />);
    expect(screen.getByText('PROCESSING')).toBeDefined();
    expect(screen.getByText(/5 \/ 10/)).toBeDefined();
  });

  it('renders completed status correctly', () => {
    render(<ProcessingStatus status="completed" documentCount={10} processedCount={10} />);
    expect(screen.getByText('COMPLETED')).toBeDefined();
  });

  it('renders failed status correctly', () => {
    render(<ProcessingStatus status="failed" documentCount={5} />);
    expect(screen.getByText('FAILED')).toBeDefined();
  });

  it('shows auto-refresh message for processing status', () => {
    render(<ProcessingStatus status="processing" documentCount={10} processedCount={5} />);
    expect(screen.getByText(/Status updates every 10 seconds/)).toBeDefined();
  });
});
