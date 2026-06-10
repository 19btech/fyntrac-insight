import React, { useEffect, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import SearchSelect from '../shared/SearchSelect';
import MonacoEditor from '@monaco-editor/react';
import AIQuerySuggestions from '../ai/AIQuerySuggestions';
import VariablePanel from './VariablePanel';
import api from '../../hooks/useQuery';

/** Extract {{variable_name}} placeholders from a JSON string */
function extractVariables(pipelineStr) {
  const matches = pipelineStr.matchAll(/\{\{(\w+)\}\}/g);
  return [...new Set([...matches].map((m) => m[1]))];
}

export default function PipelineEditor({
  value, onChange, collection, onCollectionChange, variables, onVariablesChange,
}) {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detectedVars, setDetectedVars] = useState([]);

  useEffect(() => {
    api.get('/schema/collections')
      .then((r) => setCollections(r.data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setDetectedVars(extractVariables(value));
  }, [value]);

  return (
    <Box>
      {/* Collection selector */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <SearchSelect
          value={collection}
          onChange={onCollectionChange}
          options={collections.map((c) => ({ value: c, label: c }))}
          label="Collection"
          width={220}
          disabled={loading}
        />
      </Box>

      {/* AI suggestions */}
      {collection && (
        <AIQuerySuggestions collection={collection} onSelect={onChange} />
      )}

      {/* Monaco editor */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', mb: 2 }}>
        <Typography variant="body2" sx={{ px: 1.5, py: 0.75, bgcolor: '#f5f5f5', borderBottom: '1px solid', borderColor: 'divider', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'text.secondary' }}>
          Pipeline (JSON array of aggregation stages)
        </Typography>
        <MonacoEditor
          height="240px"
          language="json"
          value={value}
          onChange={(v) => onChange(v || '[]')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            formatOnPaste: true,
          }}
          theme="light"
        />
      </Box>

      {/* Variable panel */}
      {detectedVars.length > 0 && (
        <VariablePanel
          variables={detectedVars}
          values={variables}
          onChange={onVariablesChange}
        />
      )}
    </Box>
  );
}
