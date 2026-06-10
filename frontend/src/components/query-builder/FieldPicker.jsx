import React, { useEffect, useState } from 'react';
import api from '../../hooks/useQuery';
import SearchSelect from '../shared/SearchSelect';

const _schemaCache = new Map();
const _schemaPending = new Map();

export default function FieldPicker({ collection, value, onChange, label = 'Field', extraFields = [] }) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collection) { setFields([]); return; }
    if (_schemaCache.has(collection)) { setFields(_schemaCache.get(collection)); return; }
    let pending = _schemaPending.get(collection);
    if (!pending) {
      pending = api.get(`/schema/collections/${collection}/fields`).then((r) => r.data);
      _schemaPending.set(collection, pending);
    }
    setLoading(true);
    pending
      .then((result) => { _schemaCache.set(collection, result); setFields(result); })
      .catch(() => setFields([]))
      .finally(() => { _schemaPending.delete(collection); setLoading(false); });
  }, [collection]);

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
      disabled={loading || !collection}
    />
  );
}
