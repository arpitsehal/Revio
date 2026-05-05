import { formatDistanceToNow, format } from 'date-fns';

export function getFileIcon(name) {
  return '•';
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTs(ts) {
  try {
    return format(new Date(ts), 'MMM d, yyyy · HH:mm:ss');
  } catch { return ts; }
}

export function formatRelative(ts) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch { return ts; }
}

export function statusClass(status) {
  const map = { active:'active', modified:'modified', deleted:'deleted', created:'created' };
  return `badge badge-${map[status] || 'active'}`;
}
