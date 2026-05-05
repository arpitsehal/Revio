import { useState } from 'react';
import { getFileIcon, formatTs, formatSize, statusClass } from '../utils';
import RestoreModal from './RestoreModal';

export default function VersionTimeline({ file, versions, loading, onRestored }) {
  const [restoring, setRestoring] = useState(null); // { file, version }

  if (!file) {
    return (
      <div className="empty-state">
        <div className="empty-title">Select a file</div>
        <div className="empty-desc">Click any file on the left to view its version history and restore options.</div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex-center" style={{ height: 200 }}><div className="spinner" /></div>;
  }

  const dotClass = (status) => {
    if (status === 'modified') return 'modified';
    if (status === 'deleted') return 'deleted';
    return 'created';
  };

  return (
    <div>
      <div className="timeline-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 24 }}>{getFileIcon(file.name)}</span>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {file.name}
              {file.currentStatus === 'deleted' && (
                <button 
                  className="btn btn-primary btn-xs" 
                  style={{ fontSize: 10, padding: '2px 8px' }}
                  onClick={() => {
                    const latestValid = versions.find(v => v.storagePath);
                    if (latestValid) setRestoring({ file, version: latestValid });
                  }}
                >
                  RESTORE
                </button>
              )}
            </h2>
            <p className="timeline-header p mono">{file.relativePath}</p>
          </div>
          <span className={statusClass(file.currentStatus)} style={{ marginLeft: 'auto' }}>
            {file.currentStatus}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text2)' }}>
          <span>Versions: {versions.length}</span>
        </div>
      </div>

      <hr className="divider" />

      {versions.length === 0 ? (
        <div className="empty-state" style={{ height: 180 }}>
          <div className="empty-title">No versions yet</div>
        </div>
      ) : (
        <div className="timeline">
          {versions.map((v, i) => (
            <div key={v.versionId} className="timeline-item">
              <div className={`timeline-dot ${dotClass(v.status)}`} />
              <div className="timeline-card">
                <div className="timeline-card-top">
                  <div>
                    <span className={statusClass(v.status)}>{v.status}</span>
                    <div className="timeline-time" style={{ marginTop: 4 }}>{formatTs(v.timestamp)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="timeline-size">{formatSize(v.size)}</div>
                    {i === 0 && <div style={{ fontSize: 10, color: 'var(--accent2)', marginTop: 2 }}>LATEST</div>}
                  </div>
                </div>
                {v.storagePath && (
                  <div className="timeline-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setRestoring({ file, version: v })}
                    >
                      Restore
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRestoring({ file, version: { ...v, _asCopy: true } })}
                    >
                      Restore as copy
                    </button>
                  </div>
                )}
                {!v.storagePath && v.status === 'deleted' && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)' }}>
                    Note: Deletion event — recover using the version above
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {restoring && (
        <RestoreModal
          file={restoring.file}
          version={restoring.version}
          onClose={() => setRestoring(null)}
          onSuccess={() => { setRestoring(null); onRestored?.(); }}
        />
      )}
    </div>
  );
}
