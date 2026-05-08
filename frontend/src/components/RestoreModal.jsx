import { useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { formatTs, formatSize, statusClass } from '../utils';

export default function RestoreModal({ file, version, onClose, onSuccess }) {
  const [asCopy, setAsCopy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!file || !version) return null;

  const [success, setSuccess] = useState(false);

  const handleRestore = async () => {
    setLoading(true); setError('');
    const loadToast = toast.loading(asCopy ? 'Creating copy...' : 'Restoring file...');
    try {
      await axios.post(`/api/files/${file.id}/restore`, { versionId: version.versionId, asCopy });
      setSuccess(true);
      toast.success(asCopy ? 'Copy created successfully!' : 'File restored successfully!', { id: loadToast });
      onSuccess?.();
      setTimeout(onClose, 1500);
    } catch (e) {
      const msg = e.response?.data?.error || 'Restore failed';
      setError(msg);
      toast.error(msg, { id: loadToast });
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ textAlign: success ? 'center' : 'left', padding: success ? '40px 20px' : '20px' }}>
        {success ? (
          <div>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
            <h3 style={{ marginBottom: 8 }}>File successfully restored!</h3>
            <p style={{ opacity: 0.7 }}>The file is now back at its original location.</p>
          </div>
        ) : (
          <>
            <h3>Restore File</h3>
            <p>You are about to restore a previous version of <strong>{file.name}</strong>.</p>

            <div className="modal-info">
              <div>Date: {formatTs(version.timestamp)}</div>
              <div style={{ marginTop: 4 }}>Size: {formatSize(version.size)}</div>
              <div style={{ marginTop: 4 }}>
                Status: <span className={statusClass(version.status)}>{version.status}</span>
              </div>
              {version.status === 'deleted' && !version.storagePath && (
                <div style={{ marginTop: 8, color: 'var(--red)', fontSize: 11 }}>
                  Note: This is a deletion marker — the last known version before deletion will be restored.
                </div>
              )}
            </div>

            <div className="setting-row" style={{ background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 20 }}>
              <div>
                <div className="setting-label" style={{ fontSize: 13 }}>Restore as a copy</div>
                <div className="setting-desc">Creates a copy instead of overwriting the original</div>
              </div>
              <div className={`toggle ${asCopy ? 'on' : ''}`} onClick={() => setAsCopy(!asCopy)} />
            </div>

            {error && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>Error: {error}</div>}

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRestore} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Restore'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
