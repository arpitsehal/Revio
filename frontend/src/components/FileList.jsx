import { getFileIcon, formatRelative, statusClass } from '../utils';

export default function FileList({ files, loading, selected, onSelect, currentDir, onFolderClick, isSearching }) {
  if (loading) {
    return (
      <div className="flex-center" style={{ height: 200 }}>
        <div className="spinner" />
      </div>
    );
  }

  // If searching, show flat list
  if (isSearching) {
    return (
      <div className="file-list">
        {files.map(file => (
          <FileItem key={file.id} file={file} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  // Group by current folder
  const currentItems = [];
  const folderNames = new Set();

  files.forEach(file => {
    // Normalize to use forward slashes for easier splitting
    const rel = file.relativePath.replace(/\\/g, '/');
    
    // If we are in currentDir, check if file is direct child or in a subfolder
    const normalizedDir = currentDir.replace(/\\/g, '/');

    if (normalizedDir && !rel.startsWith(normalizedDir + '/')) return;
    
    if (!normalizedDir && rel.includes('/')) {
        // In root, and file is in a folder
        const folderName = rel.split('/')[0];
        folderNames.add(folderName);
    } else if (normalizedDir) {
        // In a subfolder
        const sub = rel.substring(normalizedDir.length + 1);
        if (sub.includes('/')) {
            const folderName = sub.split('/')[0];
            folderNames.add(folderName);
        } else {
            currentItems.push(file);
        }
    } else {
        // In root, direct file
        currentItems.push(file);
    }
  });

  const folders = Array.from(folderNames).sort().map(name => ({
    id: `folder-${name}`,
    name,
    isFolder: true,
    fullPath: currentDir ? `${currentDir}/${name}` : name
  }));

  const allItems = [...folders, ...currentItems];

  if (!allItems.length) {
    return (
      <div className="empty-state" style={{ height: 240 }}>
        <div className="empty-title">Folder is empty</div>
      </div>
    );
  }

  return (
    <div className="file-list">
      {allItems.map(item => {
        if (item.isFolder) {
          return (
            <div
              key={item.id}
              className="file-item"
              onClick={() => onFolderClick(item.fullPath)}
            >
              <div className="file-item-top">
                <span className="file-icon" style={{ fontSize: 10, opacity: 0.5 }}>DIR</span>
                <div className="file-info">
                  <div className="file-name" style={{ fontWeight: 600 }}>{item.name}</div>
                </div>
              </div>
            </div>
          );
        }
        return <FileItem key={item.id} file={item} selected={selected} onSelect={onSelect} />;
      })}
    </div>
  );
}

function FileItem({ file, selected, onSelect }) {
  return (
    <div
      className={`file-item ${selected?.id === file.id ? 'selected' : ''}`}
      onClick={() => onSelect(file)}
    >
      <div className="file-item-top">
        <span className="file-icon">{getFileIcon(file.name)}</span>
        <div className="file-info">
          <div className="file-name">{file.name}</div>
          <div className="file-path">{file.relativePath}</div>
        </div>
      </div>
      <div className="file-meta">
        {file.currentStatus !== 'active' && (
          <span className={statusClass(file.currentStatus)}>{file.currentStatus}</span>
        )}
        <span className="file-time">{formatRelative(file.lastSeen)}</span>
        <span className="file-versions">{file.versions.length} version{file.versions.length !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
