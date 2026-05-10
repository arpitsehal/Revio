import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function useStats(refreshMs = 3000) {
  const [stats, setStats] = useState(null);
  const fetch = useCallback(async () => {
    try { const data = await invoke('get_stats'); setStats(data); } catch {}
  }, []);
  useEffect(() => { 
    fetch(); 
    const id = setInterval(fetch, refreshMs); 
    let unlisten;
    listen('file-changed', fetch).then(fn => unlisten = fn);
    
    return () => {
      clearInterval(id);
      if (unlisten) unlisten();
    };
  }, [fetch, refreshMs]);
  return { stats, refresh: fetch };
}

export function useFiles(query = {}) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('get_files', { search: query.search || null, status: query.status || null, ext: query.ext || null });
      setFiles(data || []);
    } catch {} finally { setLoading(false); }
  }, [query.search, query.status, query.ext]);
  useEffect(() => { 
    fetch(); 
    let unlisten;
    listen('file-changed', fetch).then(fn => unlisten = fn);
    return () => { if (unlisten) unlisten(); };
  }, [fetch]);
  return { files, loading, refresh: fetch };
}

export function useVersions(fileId) {
  const [versions, setVersions] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!fileId) { setVersions([]); setFile(null); return; }
    setLoading(true);
    invoke('get_versions', { id: fileId })
      .then((data) => { setVersions(data.versions || []); setFile(data.file || null); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);
  return { versions, file, loading };
}
