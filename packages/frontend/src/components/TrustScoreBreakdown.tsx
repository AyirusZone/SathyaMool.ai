import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  ExpandMore as ExpandIcon,
  Add as AddIcon,
  Remove as RemoveIcon,
} from '@mui/icons-material';
import { TrustScore } from '../services/property';
import TrustScoreGauge from './TrustScoreGauge';

interface TrustScoreBreakdownProps {
  trustScore: TrustScore;
}

const TrustScoreBreakdown: React.FC<TrustScoreBreakdownProps> = ({ trustScore }) => {
  const [expanded, setExpanded] = useState<string | false>('panel1');

  const handleChange = (panel: string) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false);
  };

  const scoreComponents = [
    {
      id: 'base',
      label: 'Base Score',
      value: trustScore.scoreBreakdown.baseScore,
      description: 'Starting score for complete ownership chain',
      positive: true,
    },
    {
      id: 'gap',
      label: 'Gap Penalty',
      value: trustScore.scoreBreakdown.gapPenalty,
      description: 'Deduction for missing links in ownership chain (-15 per gap)',
      positive: false,
    },
    {
      id: 'inconsistency',
      label: 'Inconsistency Penalty',
      value: trustScore.scoreBreakdown.inconsistencyPenalty,
      description: 'Deduction for date inconsistencies or illogical sequences (-10 per issue)',
      positive: false,
    },
    {
      id: 'survey',
      label: 'Survey Number Mismatch',
      value: trustScore.scoreBreakdown.surveyNumberMismatch,
      description: 'Deduction for mismatched survey numbers across documents (-20)',
      positive: false,
    },
    {
      id: 'ec',
      label: 'EC Verification Bonus',
      value: trustScore.scoreBreakdown.ecBonus,
      description: 'Bonus for matching Encumbrance Certificate (+10)',
      positive: true,
    },
    {
      id: 'recency',
      label: 'Recency Bonus',
      value: trustScore.scoreBreakdown.recencyBonus,
      description: 'Bonus for documents less than 30 years old (+5)',
      positive: true,
    },
    {
      id: 'succession',
      label: 'Succession Bonus',
      value: trustScore.scoreBreakdown.successionBonus,
      description: 'Bonus for properly documented family succession (+5)',
      positive: true,
    },
  ];

  return (
    <Paper sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3 }}>
        <TrustScoreGauge score={trustScore.totalScore} size="large" />
        <Box>
          <Typography variant="h5" gutterBottom>
            Trust Score
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Calculated on {new Date(trustScore.calculatedAt).toLocaleString()}
          </Typography>
        </Box>
      </Box>

      <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
        Score Breakdown
      </Typography>

      {scoreComponents.map((component, index) => (
        <Accordion
          key={component.id}
          expanded={expanded === `panel${index}`}
          onChange={handleChange(`panel${index}`)}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
              <Typography sx={{ flexGrow: 1 }}>{component.label}</Typography>
              <Chip
                icon={component.positive ? <AddIcon /> : <RemoveIcon />}
                label={`${component.value >= 0 ? '+' : ''}${component.value}`}
                color={component.value > 0 ? 'success' : component.value < 0 ? 'error' : 'default'}
                size="small"
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" color="text.secondary">
              {component.description}
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}

      {trustScore.explanations && trustScore.explanations.length > 0 && (
        <>
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            Detailed Explanations
          </Typography>
          <List>
            {trustScore.explanations.map((explanation, index) => (
              <ListItem key={index}>
                <ListItemText
                  primary={explanation}
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Typography variant="caption" color="text.secondary">
          <strong>Score Interpretation:</strong>
          <br />
          80-100: Excellent - Clear title with minimal issues
          <br />
          60-79: Good - Minor issues that can be resolved
          <br />
          40-59: Fair - Significant issues requiring attention
          <br />
          0-39: Poor - Major issues, proceed with caution
        </Typography>
      </Box>
    </Paper>
  );
};

export default TrustScoreBreakdown;
