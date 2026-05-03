import { useState, useEffect } from 'react';
import api from './useQuery';

export function useCollections() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/schema/collections')
      .then((r) => setCollections(r.data))
      .finally(() => setLoading(false));
  }, []);

  return { collections, loading };
}

export function useCollectionFields(collectionName) {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!collectionName) { setFields([]); return; }
    setLoading(true);
    api.get(`/schema/collections/${collectionName}/fields`)
      .then((r) => setFields(r.data))
      .finally(() => setLoading(false));
  }, [collectionName]);

  return { fields, loading };
}
