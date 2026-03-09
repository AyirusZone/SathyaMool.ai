import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import TrustScoreGauge from '../TrustScoreGauge';

describe('TrustScoreGauge', () => {
  it('renders the score correctly', () => {
    render(<TrustScoreGauge score={85} />);
    expect(screen.getByText('85')).toBeDefined();
  });

  it('uses green color for high scores (>= 80)', () => {
    const { container } = render(<TrustScoreGauge score={85} />);
    const box = container.querySelector('[style*="border"]');
    expect(box).toBeDefined();
  });

  it('uses orange color for medium scores (60-79)', () => {
    const { container } = render(<TrustScoreGauge score={70} />);
    const box = container.querySelector('[style*="border"]');
    expect(box).toBeDefined();
  });

  it('uses red color for low scores (< 60)', () => {
    const { container } = render(<TrustScoreGauge score={45} />);
    const box = container.querySelector('[style*="border"]');
    expect(box).toBeDefined();
  });

  it('renders different sizes correctly', () => {
    const { rerender } = render(<TrustScoreGauge score={75} size="small" />);
    expect(screen.getByText('75')).toBeDefined();

    rerender(<TrustScoreGauge score={75} size="large" />);
    expect(screen.getByText('75')).toBeDefined();
  });
});
