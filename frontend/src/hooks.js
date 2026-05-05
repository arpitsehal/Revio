import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const BASE = '/api';

export function useStats(refreshMs = 3000) {
  const [stats, setStats] = useState(null);
  const fetch = useCallback(async () => {
    try { const { data } = await axios.get(`${BASE}/stats`); setStats(data); } catch {}
  }, []);
  useEffect(() => { fetch(); const id = setInterval(fetch, refreshMs); return () => clearInterval(id); }, [fetch, refreshMs]);
  return { stats, refresh: fetch };
}

export function useFiles(query = {}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.search) params.set('search', query.search);
      if (query.status) params.set('status', query.status);
      if (query.ext)    params.set('ext', query.ext);
      const { data } = await axios.get(`${BASE}/files?${params}`);
      setFiles(data.files || []);
    } catch {} finally { setLoading(false); }
  }, [query.search, query.status, query.ext]);
  useEffect(() => { fetch(); }, [fetch]);
  return { files, loading, refresh: fetch };
}

export function useVersions(fileId) {
  const [versions, setVersions] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fileId) { setVersions([]); setFile(null); return; }
    setLoading(true);
    axios.get(`${BASE}/files/${fileId}/versions`)
      .then(({ data }) => { setVersions(data.versions || []); setFile(data.file || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);
  return { versions, file, loading };
}
