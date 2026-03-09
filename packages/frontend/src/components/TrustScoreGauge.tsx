import React from 'react';
import { Box, Typography } from '@mui/material';

interface TrustScoreGaugeProps {
  score: number;
  size?: 'small' | 'medium' | 'large';
}

const TrustScoreGauge: React.FC<TrustScoreGaugeProps> = ({ score, size = 'medium' }) => {
  const getColor = (score: number) => {
    if (score >= 80) return '#4caf50';
    if (score >= 60) return '#ff9800';
    return '#f44336';
  };

  const sizes = {
    small: { width: 50, height: 50, fontSize: '0.875rem' },
    medium: { width: 80, height: 80, fontSize: '1.25rem' },
    large: { width: 120, height: 120, fontSize: '2rem' },
  };

  const { width, height, fontSize } = sizes[size];
  const color = getColor(score);

  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: '50%',
        border: `4px solid ${color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="h6" sx={{ fontSize, fontWeight: 'bold', color }}>
        {score}
      </Typography>
    </Box>
  );
};

export default TrustScoreGauge;
