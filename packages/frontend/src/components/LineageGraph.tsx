import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  NodeProps,
  MarkerType,
} from 'react-flow-renderer';
import {
  Box, Paper, Typography, Tooltip, Chip, Alert, Stack, Divider,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { LineageNode as LineageNodeType, LineageEdge as LineageEdgeType, LineageGraph as LineageGraphType } from '../services/property';

interface LineageGraphProps {
  nodes: LineageNodeType[];
  edges: LineageEdgeType[];
  metadata?: LineageGraphType['metadata'];
}

// ── Custom node: normal owner ──────────────────────────────────────────────
const OwnerNode: React.FC<NodeProps> = ({ data }) => {
  const borderColor =
    data.verificationStatus === 'gap' ? '#f44336'
    : data.verificationStatus === 'warning' ? '#ff9800'
    : data.isCurrentOwner ? '#1976d2'
    : '#4caf50';

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="subtitle2">{data.name}</Typography>
          {data.date && <Typography variant="caption">Date: {data.date}</Typography>}
          <Typography variant="caption" display="block">
            {data.verificationStatus === 'gap' ? '⚠ Gap — document missing'
              : data.verificationStatus === 'warning' ? '⚠ Low confidence'
              : '✓ Verified'}
          </Typography>
        </Box>
      }
      arrow
    >
      <Box
        sx={{
          px: 2, py: 1.5, borderRadius: 2,
          border: `3px solid ${borderColor}`,
          bgcolor: 'white', minWidth: 140, textAlign: 'center',
          cursor: 'pointer', '&:hover': { boxShadow: 3 },
        }}
      >
        <Typography variant="body2" fontWeight="bold">{data.name}</Typography>
        {data.date && (
          <Typography variant="caption" color="text.secondary">{data.date}</Typography>
        )}
        {data.isCurrentOwner && (
          <Chip label="Current" size="small" color="primary" sx={{ mt: 0.5 }} />
        )}
      </Box>
    </Tooltip>
  );
};

// ── Custom node: gap placeholder ───────────────────────────────────────────
const GapNode: React.FC<NodeProps> = ({ data }) => (
  <Tooltip title={data.description || 'Missing ownership link'} arrow>
    <Box
      sx={{
        px: 2, py: 1.5, borderRadius: 2,
        border: '3px dashed #f44336',
        bgcolor: '#fff5f5', minWidth: 140, textAlign: 'center',
        cursor: 'default',
      }}
    >
      <LinkOffIcon sx={{ color: '#f44336', fontSize: 18 }} />
      <Typography variant="body2" color="error" fontWeight="bold">
        {data.name}
      </Typography>
      <Typography variant="caption" color="error">Missing link</Typography>
    </Box>
  </Tooltip>
);

const nodeTypes = { owner: OwnerNode, gap: GapNode };

// ── Gap summary panel ──────────────────────────────────────────────────────
const GapSummary: React.FC<{ metadata: LineageGraphType['metadata'] }> = ({ metadata }) => {
  if (!metadata) return null;
  const gaps = metadata.gaps ?? [];
  const noExtraction = metadata.documentsWithoutExtraction ?? 0;
  const motherDeedMissing = metadata.motherDeed?.identification_method === 'not_found';

  if (gaps.length === 0 && noExtraction === 0 && !motherDeedMissing) return null;

  return (
    <Box
      sx={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        bgcolor: 'white', p: 2, borderRadius: 2, boxShadow: 3,
        maxWidth: 300, maxHeight: 400, overflowY: 'auto',
      }}
    >
      <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <WarningAmberIcon fontSize="small" color="warning" /> What's missing
      </Typography>
      <Divider sx={{ mb: 1 }} />
      <Stack spacing={1}>
        {motherDeedMissing && (
          <Alert severity="warning" icon={<ErrorOutlineIcon fontSize="small" />} sx={{ py: 0 }}>
            <Typography variant="caption">Mother Deed not identified</Typography>
          </Alert>
        )}
        {noExtraction > 0 && (
          <Alert severity="info" sx={{ py: 0 }}>
            <Typography variant="caption">
              {noExtraction} document{noExtraction > 1 ? 's' : ''} could not be extracted (AI skipped)
            </Typography>
          </Alert>
        )}
        {gaps.map((gap, i) => (
          <Alert
            key={i}
            severity={gap.severity === 'critical' || gap.severity === 'high' ? 'error' : 'warning'}
            sx={{ py: 0 }}
          >
            <Typography variant="caption">{gap.description}</Typography>
          </Alert>
        ))}
      </Stack>
    </Box>
  );
};

// ── Empty state ────────────────────────────────────────────────────────────
const EmptyLineage: React.FC<{ metadata?: LineageGraphType['metadata'] }> = ({ metadata }) => {
  const noExtraction = metadata?.documentsWithoutExtraction ?? 0;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2, p: 4 }}>
      <LinkOffIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
      <Typography variant="h6" color="text.secondary">No ownership chain available</Typography>
      {noExtraction > 0 ? (
        <Alert severity="warning" sx={{ maxWidth: 480 }}>
          {noExtraction} document{noExtraction > 1 ? 's were' : ' was'} processed without AI extraction
          (Bedrock model access not enabled). Enable Bedrock access and re-process to build the lineage graph.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ maxWidth: 480 }}>
          No ownership transfers could be extracted from the uploaded documents.
          Ensure sale deeds or mother deed documents are uploaded.
        </Alert>
      )}
      {metadata?.gaps && metadata.gaps.length > 0 && (
        <Stack spacing={1} sx={{ maxWidth: 480, width: '100%' }}>
          <Typography variant="subtitle2">Detected issues:</Typography>
          {metadata.gaps.map((gap, i) => (
            <Alert key={i} severity="error" sx={{ py: 0 }}>
              <Typography variant="caption">{gap.description}</Typography>
            </Alert>
          ))}
        </Stack>
      )}
    </Box>
  );
};

// ── Main component ─────────────────────────────────────────────────────────
const LineageGraph: React.FC<LineageGraphProps> = ({ nodes: initialNodes, edges: initialEdges, metadata }) => {
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);

  // Map raw nodes to ReactFlow nodes, defaulting type to 'owner'
  const rfNodes: Node[] = initialNodes.map((node, index) => ({
    id: node.id || `node-${index}`,
    type: (node.data as any)?.isGapNode ? 'gap' : 'owner',
    data: {
      ...node.data,
      verificationStatus: (node.data as any).verificationStatus ?? (node.data.verified ? 'verified' : 'warning'),
    },
    position: node.position?.x !== undefined ? node.position : { x: index * 220, y: Math.floor(index / 5) * 160 },
  }));

  // Map raw edges to ReactFlow edges
  const rfEdges: Edge[] = initialEdges.map((edge, index) => ({
    id: edge.id || `edge-${index}`,
    source: String(edge.source ?? (edge as any).from),
    target: String(edge.target ?? (edge as any).to),
    animated: !(edge.data as any)?.isGap,
    style: {
      stroke: (edge.data as any)?.isGap ? '#f44336' : '#4caf50',
      strokeDasharray: (edge.data as any)?.isGap ? '6 3' : undefined,
      strokeWidth: 2,
    },
    markerEnd: { type: MarkerType.ArrowClosed },
    label: edge.data?.transferType || edge.data?.date || undefined,
    data: edge.data,
  }));

  const [nodes, , onNodesChange] = useNodesState(rfNodes);
  const [edges, , onEdgesChange] = useEdgesState(rfEdges);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node); setSelectedEdge(null);
  }, []);
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge); setSelectedNode(null);
  }, []);

  const isEmpty = nodes.length === 0;

  return (
    <Paper sx={{ height: 600, position: 'relative', overflow: 'hidden' }}>
      {isEmpty ? (
        <EmptyLineage metadata={metadata} />
      ) : (
        <>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-left"
          >
            <Background />
            <Controls />
            {nodes.length > 20 && <MiniMap />}
          </ReactFlow>

          <GapSummary metadata={metadata} />

          {/* Selected node detail */}
          {selectedNode && (
            <Box sx={{ position: 'absolute', top: 12, left: 12, bgcolor: 'white', p: 2, borderRadius: 2, boxShadow: 3, maxWidth: 260, zIndex: 10 }}>
              <Typography variant="subtitle2" gutterBottom>Owner Details</Typography>
              <Typography variant="body2"><strong>Name:</strong> {selectedNode.data.name}</Typography>
              {selectedNode.data.date && <Typography variant="body2"><strong>Date:</strong> {selectedNode.data.date}</Typography>}
              <Typography variant="body2">
                <strong>Status:</strong>{' '}
                <Chip
                  label={selectedNode.data.verificationStatus ?? (selectedNode.data.verified ? 'Verified' : 'Unverified')}
                  size="small"
                  color={selectedNode.data.verificationStatus === 'verified' ? 'success' : selectedNode.data.verificationStatus === 'gap' ? 'error' : 'warning'}
                />
              </Typography>
            </Box>
          )}

          {/* Selected edge detail */}
          {selectedEdge && (
            <Box sx={{ position: 'absolute', top: 12, left: 12, bgcolor: 'white', p: 2, borderRadius: 2, boxShadow: 3, maxWidth: 260, zIndex: 10 }}>
              <Typography variant="subtitle2" gutterBottom>Transfer Details</Typography>
              {selectedEdge.data?.transferType && <Typography variant="body2"><strong>Type:</strong> {selectedEdge.data.transferType}</Typography>}
              {selectedEdge.data?.date && <Typography variant="body2"><strong>Date:</strong> {selectedEdge.data.date}</Typography>}
              {selectedEdge.data?.documentId && <Typography variant="body2"><strong>Doc ID:</strong> {selectedEdge.data.documentId}</Typography>}
              {selectedEdge.data?.isGap && <Alert severity="error" sx={{ mt: 1, py: 0 }}><Typography variant="caption">Missing document link</Typography></Alert>}
            </Box>
          )}

          {/* Legend */}
          <Box sx={{ position: 'absolute', bottom: 12, left: 12, bgcolor: 'white', p: 1.5, borderRadius: 2, boxShadow: 2, zIndex: 10 }}>
            <Typography variant="caption" display="block" gutterBottom><strong>Legend</strong></Typography>
            <Stack direction="row" spacing={1.5} flexWrap="wrap">
              {[
                { color: '#4caf50', label: 'Verified' },
                { color: '#ff9800', label: 'Warning' },
                { color: '#1976d2', label: 'Current Owner' },
                { color: '#f44336', label: 'Gap / Missing', dashed: true },
              ].map(({ color, label, dashed }) => (
                <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 16, height: 16, bgcolor: dashed ? 'transparent' : color, border: dashed ? `2px dashed ${color}` : 'none', borderRadius: 1 }} />
                  <Typography variant="caption">{label}</Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </>
      )}
    </Paper>
  );
};

export default LineageGraph;
