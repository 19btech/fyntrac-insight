import React, { useEffect, useState } from 'react';
import api from '../../hooks/useQuery';
import SearchSelect from '../shared/SearchSelect';

const _schemaCache = new Map();
const _schemaPending = new Map();

export default function FieldPicker({ collection, datasetId, value, onChange, label = 'Field', extraFields = [] }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // When the report is built on a dataset, the selectable columns are the
    // dataset's OUTPUT (Prism SQL columns / build-step transforms), not the raw
    // source collection — resolve them via the unified source-fields endpoint.
    if (!collection && !datasetId) { setFields([]); return; }
    const cacheKey = datasetId ? `dataset:${datasetId}` : `collection:${collection}`;
    if (_schemaCache.has(cacheKey)) { setFields(_schemaCache.get(cacheKey)); return; }
    let pending = _schemaPending.get(cacheKey);
    if (!pending) {
      pending = (datasetId
        ? api.get('/schema/source/fields', { params: { kind: 'dataset', id: datasetId } })
        : api.get(`/schema/collections/${collection}/fields`)
      ).then((r) => r.data);
      _schemaPending.set(cacheKey, pending);
    }
    setLoading(true);
    pending
      .then((result) => { _schemaCache.set(cacheKey, result); setFields(result); })
      .catch(() => setFields([]))
      .finally(() => { _schemaPending.delete(cacheKey); setLoading(false); });
  }, [collection, datasetId]);

  const options = [
    ...fields.map((f) => ({ value: f.name, label: f.name, description: f.semanticType || f.type })),
    ...extraFields.map((f) => ({ value: f.name, label: f.name, description: f.source ? `from ${f.source}` : 'computed' })),
  ];

  return (
    <SearchSelect
      value={value || ''}
      onChange={onChange}
      options={options}
      label={label}
      width={240}
      disabled={loading || (!collection && !datasetId)}
    />
  );
}
