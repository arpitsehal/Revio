import React, { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import toast from 'react-hot-toast';
import { useStats, useFiles, useVersions } from '../hooks';
import { formatSize } from '../utils';
import FileList from '../components/FileList';
import VersionTimeline from '../components/VersionTimeline';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Modified', value: 'modified' },
  { label: 'Deleted', value: 'deleted' },
];

export default function Dashboard() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [currentDir, setCurrentDir] = useState('');

  const { stats } = useStats(3000);
  const { files, loading, refresh } = useFiles({ search, status: statusFilter });
  const { versions, file: versionFile, loading: vLoading } = useVersions(selectedFile?.id);

  const handleFileSelect = useCallback((f) => {
    setSelectedFile(f);
  }, []);

  const handleFolderClick = useCallback((dir) => {
    setCurrentDir(dir);
    setSelectedFile(null);
  }, []);

  const handleRestored = useCallback(() => {
    refresh();
  }, [refresh]);

  const breadcrumbs = currentDir ? currentDir.split(/[/\\]/).filter(Boolean) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Split Panel */}
      <div className="panel-split" style={{ flex: 1 }}>
        {/* Left: File List */}
        <div className="panel-left">
          {/* Search */}
          <div className="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              className="search-input"
              placeholder="Search files…"
              value={search}
              onChange={e => { setSearch(e.target.value); setCurrentDir(''); }}
            />
          </div>

          {/* Breadcrumbs / Back */}
          {currentDir && (
            <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }}>
              <span
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => setCurrentDir('')}
              >
                root
              </span>
              {breadcrumbs.map((b, i) => (
                <React.Fragment key={i}>
                  <span>/</span>
                  <span
                    style={{ cursor: 'pointer', textDecoration: i < breadcrumbs.length - 1 ? 'underline' : 'none' }}
                    onClick={() => setCurrentDir(breadcrumbs.slice(0, i + 1).join('/'))}
                  >
                    {b}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Status Filter / Bulk Actions */}
          {!search && (
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.value}
                    className={`filter-tab ${statusFilter === f.value ? 'active' : ''}`}
                    onClick={() => setStatusFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {currentDir && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 10, padding: '4px 10px', height: 'auto' }}
                  onClick={async () => {
                    if (window.confirm(`Restore all deleted files in "${currentDir}"?`)) {
                      const loadToast = toast.loading('Restoring all files...');
                      try {
                        await invoke('restore_folder', { folderPath: currentDir });
                        toast.success('All files restored successfully!', { id: loadToast });
                        refresh();
                      } catch (e) {
                        toast.error(e || 'Restore failed', { id: loadToast });
                      }
                    }
                  }}
                >
                  RESTORE ALL
                </button>
              )}
            </div>
          )}

          <FileList
            files={files}
            loading={loading}
            selected={selectedFile}
            onSelect={handleFileSelect}
            currentDir={currentDir}
            onFolderClick={handleFolderClick}
            isSearching={!!search}
          />
        </div>

        {/* Right: Version Timeline */}
        <div className="panel-right">
          <VersionTimeline
            file={versionFile || selectedFile}
            versions={versions}
            loading={vLoading}
            onRestored={handleRestored}
          />
        </div>
      </div>
    </div>
  );
}
