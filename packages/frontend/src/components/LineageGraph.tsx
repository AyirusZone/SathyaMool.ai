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
  EdgeProps,
} from 'react-flow-renderer';
import { Box, Paper, Typography, Tooltip, Chip } from '@mui/material';
import { LineageNode as LineageNodeType, LineageEdge as LineageEdgeType } from '../services/property';

interface LineageGraphProps {
  nodes: LineageNodeType[];
  edges: LineageEdgeType[];
}

const CustomNode: React.FC<NodeProps> = ({ data }) => {
  const getNodeColor = () => {
    if (data.isCurrentOwner) return '#1976d2';
    if (data.verified) return '#4caf50';
    return '#ff9800';
  };

  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="subtitle2">{data.name}</Typography>
          {data.date && (
            <Typography variant="caption">Date: {data.date}</Typography>
          )}
          <Typography variant="caption" display="block">
            Status: {data.verified ? 'Verified' : 'Unverified'}
          </Typography>
        </Box>
      }
      arrow
    >
      <Box
        sx={{
          padding: 2,
          borderRadius: 2,
          border: `3px solid ${getNodeColor()}`,
          bgcolor: 'white',
          minWidth: 150,
          textAlign: 'center',
          cursor: 'pointer',
          '&:hover': {
            boxShadow: 3,
          },
        }}
      >
        <Typography variant="body2" fontWeight="bold">
          {data.name}
        </Typography>
        {data.date && (
          <Typography variant="caption" color="text.secondary">
            {data.date}
          </Typography>
        )}
        {data.isCurrentOwner && (
          <Chip label="Current" size="small" color="primary" sx={{ mt: 0.5 }} />
        )}
      </Box>
    </Tooltip>
  );
};

const CustomEdge: React.FC<EdgeProps> = ({ data, ...props }) => {
  return (
    <g>
      <path
        {...props}
        style={{
          stroke: data?.verified ? '#4caf50' : '#ff9800',
          strokeWidth: 2,
        }}
      />
    </g>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

const LineageGraph: React.FC<LineageGraphProps> = ({ nodes: initialNodes, edges: initialEdges }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes.map((node) => ({
      ...node,
      type: 'custom',
    }))
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges.map((edge) => ({
      ...edge,
      type: 'custom',
      animated: true,
    }))
  );

  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [selectedEdge, setSelectedEdge] = useState<any>(null);

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);

  const showMiniMap = nodes.length > 20;

  return (
    <Paper sx={{ height: 600, position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
        {showMiniMap && <MiniMap />}
      </ReactFlow>

      {selectedNode && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            bgcolor: 'white',
            p: 2,
            borderRadius: 2,
            boxShadow: 3,
            maxWidth: 300,
            zIndex: 10,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Owner Details
          </Typography>
          <Typography variant="body2">
            <strong>Name:</strong> {selectedNode.data.name}
          </Typography>
          {selectedNode.data.date && (
            <Typography variant="body2">
              <strong>Date:</strong> {selectedNode.data.date}
            </Typography>
          )}
          <Typography variant="body2">
            <strong>Status:</strong>{' '}
            <Chip
              label={selectedNode.data.verified ? 'Verified' : 'Unverified'}
              size="small"
              color={selectedNode.data.verified ? 'success' : 'warning'}
            />
          </Typography>
        </Box>
      )}

      {selectedEdge && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            bgcolor: 'white',
            p: 2,
            borderRadius: 2,
            boxShadow: 3,
            maxWidth: 300,
            zIndex: 10,
          }}
        >
          <Typography variant="h6" gutterBottom>
            Transfer Details
          </Typography>
          <Typography variant="body2">
            <strong>Type:</strong> {selectedEdge.data.transferType}
          </Typography>
          <Typography variant="body2">
            <strong>Date:</strong> {selectedEdge.data.date}
          </Typography>
          <Typography variant="body2">
            <strong>Document ID:</strong> {selectedEdge.data.documentId}
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          bgcolor: 'white',
          p: 1.5,
          borderRadius: 2,
          boxShadow: 2,
          zIndex: 10,
        }}
      >
        <Typography variant="caption" display="block" gutterBottom>
          <strong>Legend:</strong>
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 16, height: 16, bgcolor: '#4caf50', borderRadius: 1 }} />
            <Typography variant="caption">Verified</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 16, height: 16, bgcolor: '#ff9800', borderRadius: 1 }} />
            <Typography variant="caption">Warning</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 16, height: 16, bgcolor: '#1976d2', borderRadius: 1 }} />
            <Typography variant="caption">Current Owner</Typography>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
};

export default LineageGraph;
