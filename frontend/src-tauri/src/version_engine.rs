use std::fs;
use std::path::{Path, PathBuf};
use flate2::write::GzEncoder;
use flate2::read::GzDecoder;
use flate2::Compression;
use std::io::{Read, Write};
use crate::storage_manager::{StorageManager, FileRecord, Version};
use uuid::Uuid;
use chrono::Utc;
use fossil_delta;

pub struct VersionEngine;

impl VersionEngine {
    pub fn new() -> Self {
        VersionEngine {}
    }

    fn should_skip_gzip(ext: &str) -> bool {
        let skip = vec![
            "zip", "rar", "7z", "tar", "gz",
            "mp4", "mkv", "avi", "mov",
            "mp3", "flac", "aac",
            "jpg", "jpeg", "png", "gif", "webp"
        ];
        skip.contains(&ext)
    }

    pub fn process_event(
        sm: &mut StorageManager,
        action: &str,
        rel_path: &str,
    ) -> Result<(), String> {
        let wp = match &sm.config.watch_path {
            Some(p) => p.clone(),
            None => return Ok(()),
        };

        let full_path = Path::new(&wp).join(rel_path);
        let storage_dir = Path::new(&wp).join(".restorex").join("versions").join(Path::new(rel_path).parent().unwrap_or(Path::new("")));
        
        if action == "deleted" {
            let meta = sm.ensure_metadata(&wp);
            let timestamp = Utc::now().to_rfc3339();
            if let Some(file_record) = meta.files.get_mut(rel_path) {
                file_record.current_status = "deleted".to_string();
                file_record.last_seen = timestamp.clone();
                file_record.versions.push(Version {
                    version_id: Uuid::new_v4().to_string(),
                    timestamp: timestamp.clone(),
                    size: 0,
                    status: "deleted".to_string(),
                    storage_path: None,
                    restored_from: None,
                    encoding: None,
                    parent_version_id: None,
                });
                sm.save_meta();
            }
            return Ok(());
        }
        
        if action == "created" || action == "modified" {
            let metadata = match fs::metadata(&full_path) {
                Ok(m) => m,
                Err(_) => return Ok(()), // file might be deleted quickly
            };

            if !metadata.is_file() {
                return Ok(());
            }

            let _ = fs::create_dir_all(&storage_dir);
            let size = metadata.len();
            let timestamp = Utc::now().to_rfc3339();
            let safe_ts = timestamp.replace(":", "-").replace(".", "-");
            let file_name = Path::new(rel_path).file_name().unwrap().to_str().unwrap();
            let storage_name = format!("__{}__{}", safe_ts, file_name);
            let storage_path = storage_dir.join(storage_name);
            let version_id = Uuid::new_v4().to_string();

            // 1. Read current data
            let mut current_buffer = Vec::new();
            if let Ok(mut file) = fs::File::open(&full_path) {
                let _ = file.read_to_end(&mut current_buffer);
            } else {
                return Ok(());
            }

            // 2. Try to find the latest version to create a delta
            let mut encoding = "full".to_string();
            let mut parent_version_id = None;
            let mut storage_data = current_buffer.clone();

            let mut meta = sm.ensure_metadata(&wp);
            if let Some(file_record) = meta.files.get(rel_path) {
                if let Some(latest_v) = file_record.versions.last() {
                    // Try to reconstruct previous version to create a delta
                    if let Ok(prev_buffer) = Self::reconstruct_buffer(file_record, &latest_v.version_id) {
                        let delta_bytes = fossil_delta::delta(&prev_buffer, &current_buffer);
                        
                        // Check if delta is actually smaller (including GZIP consideration)
                        if delta_bytes.len() < current_buffer.len() / 2 {
                            storage_data = delta_bytes;
                            encoding = "delta".to_string();
                            parent_version_id = Some(latest_v.version_id.clone());
                        }
                    }
                }
            }

            // 3. Fallback to GZIP if still "full" and eligible
            let ext = Path::new(rel_path).extension().unwrap_or_default().to_str().unwrap_or("").to_lowercase();
            if encoding == "full" && size <= 200 * 1024 * 1024 && !Self::should_skip_gzip(&ext) {
                let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
                if encoder.write_all(&current_buffer).is_ok() {
                    if let Ok(gzipped) = encoder.finish() {
                        if gzipped.len() < current_buffer.len() {
                            storage_data = gzipped;
                            encoding = "gzip".to_string();
                        }
                    }
                }
            }

            // 4. Save to disk
            let _ = fs::write(&storage_path, &storage_data);

            // Update metadata
            let meta = sm.ensure_metadata(&wp);
            let file_record = meta.files.entry(rel_path.to_string()).or_insert(FileRecord {
                id: Uuid::new_v4().to_string(),
                name: file_name.to_string(),
                relative_path: rel_path.to_string(),
                current_status: "active".to_string(),
                size: Some(size),
                versions: vec![],
                last_seen: timestamp.clone(),
                last_restored_version_id: None,
            });

            file_record.versions.push(Version {
                version_id,
                timestamp: timestamp.clone(),
                size,
                status: action.to_string(),
                storage_path: Some(storage_path.to_str().unwrap().to_string()),
                restored_from: None,
                encoding: Some(encoding),
                parent_version_id,
            });

            file_record.current_status = action.to_string();
            file_record.last_seen = timestamp;
            file_record.size = Some(size);
            
            sm.save_meta();
        }

        Ok(())
    }

    pub fn restore_version(
        sm: &mut StorageManager,
        file_id: &str,
        version_id: &str,
        as_copy: bool,
    ) -> Result<String, String> {
        let wp = sm.config.watch_path.clone().ok_or("No watch path configured")?;
        let meta = sm.ensure_metadata(&wp);
        
        let file_record = meta.files.values().find(|f| f.id == file_id)
            .ok_or_else(|| format!("File not found in metadata: {}", file_id))?.clone();
            
        let mut current_vid = version_id.to_string();
        let mut patch_stack = Vec::new();
        
        // 1. Follow the delta chain upwards to the baseline
        loop {
            let v = file_record.versions.iter().find(|v| v.version_id == current_vid)
                .ok_or_else(|| format!("Version {} not found in timeline", current_vid))?;
            
            patch_stack.push(v.clone());
            
            if let Some(parent_id) = &v.parent_version_id {
                current_vid = parent_id.clone();
            } else {
                break; // Found the baseline (full file or gzip)
            }
        }
        
        // 2. Load and process baseline (the last item in stack)
        let baseline_v = patch_stack.pop().unwrap();
        let mut current_buffer = Vec::new();
        
        if let Some(sp) = baseline_v.storage_path {
            let bytes = fs::read(&sp).map_err(|e| format!("Failed to read baseline: {}", e))?;
            if baseline_v.encoding.as_deref() == Some("gzip") {
                let mut decoder = GzDecoder::new(&bytes[..]);
                let mut decoded = Vec::new();
                decoder.read_to_end(&mut decoded).map_err(|e| format!("Gzip decode failed: {}", e))?;
                current_buffer = decoded;
            } else {
                current_buffer = bytes;
            }
        } else {
            return Err("Baseline version has no storage path".into());
        }
        
        // 3. Apply patches in reverse order (bottom-up from baseline)
        patch_stack.reverse();
        for p in patch_stack {
            if let Some(sp) = p.storage_path {
                let delta_bytes = fs::read(&sp).map_err(|e| format!("Failed to read delta: {}", e))?;
                current_buffer = fossil_delta::apply(&current_buffer, &delta_bytes).map_err(|e| format!("Delta apply failed: {:?}", e))?;
            }
        }
        
        // 4. Determine destination path
        let dest_path = if as_copy {
            let original_name = &file_record.name;
            let stem = Path::new(original_name).file_stem().unwrap_or_default().to_str().unwrap_or("restored");
            let ext = Path::new(original_name).extension().unwrap_or_default().to_str().unwrap_or("");
            let ts = Utc::now().timestamp();
            Path::new(&wp).join(format!("{}_restored_{}.{}", stem, ts, ext))
        } else {
            Path::new(&wp).join(&file_record.relative_path)
        };
        
        // 5. Write the reconstructed file
        if let Some(parent) = dest_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        fs::write(&dest_path, current_buffer).map_err(|e| format!("Failed to write restored file: {}", e))?;
        
        // 6. Update metadata with a "restored" event if not a copy
        if !as_copy {
            let timestamp = Utc::now().to_rfc3339();
            let wp = sm.config.watch_path.clone().unwrap_or_default();
            let meta = sm.ensure_metadata(&wp);
            if let Some(file_record) = meta.files.get_mut(&file_record.relative_path) {
                file_record.current_status = "restored".to_string();
                file_record.last_seen = timestamp.clone();
                file_record.last_restored_version_id = Some(version_id.to_string());
                file_record.versions.push(Version {
                    version_id: Uuid::new_v4().to_string(),
                    timestamp: timestamp.clone(),
                    size: file_record.size.unwrap_or(0),
                    status: "restored".to_string(),
                    storage_path: None,
                    restored_from: Some(version_id.to_string()),
                    encoding: None,
                    parent_version_id: None,
                });
                sm.save_meta();
            }
        }

        Ok(format!("Successfully restored to {}", dest_path.display()))
    }

    pub fn restore_folder(
        sm: &mut StorageManager,
        folder_path: &str,
    ) -> Result<String, String> {
        let wp = sm.config.watch_path.clone().ok_or("No watch path")?;
        let meta = sm.ensure_metadata(&wp).clone(); // Clone to avoid borrow issues in loop
        
        let files_to_restore: Vec<String> = meta.files.values()
            .filter(|f| f.relative_path.starts_with(folder_path) && f.current_status == "deleted")
            .map(|f| f.id.clone())
            .collect();

        if files_to_restore.is_empty() {
            return Ok("No deleted files found in this folder".into());
        }

        let mut count = 0;
        for fid in files_to_restore {
            let file = meta.files.values().find(|f| f.id == fid).unwrap();
            // Find latest version with storage
            if let Some(v) = file.versions.iter().rev().find(|v| v.storage_path.is_some()) {
                if let Ok(_) = Self::restore_version(sm, &fid, &v.version_id, false) {
                    count += 1;
                }
            }
        }

        Ok(format!("Successfully restored {} files in {}", count, folder_path))
    }

    // Helper to reconstruct buffer for internal use
    fn reconstruct_buffer(file_record: &FileRecord, version_id: &str) -> Result<Vec<u8>, String> {
        let mut current_vid = version_id.to_string();
        let mut patch_stack = Vec::new();
        
        loop {
            let v = file_record.versions.iter().find(|v| v.version_id == current_vid)
                .ok_or_else(|| format!("Version {} not found", current_vid))?;
            
            patch_stack.push(v.clone());
            
            if let Some(parent_id) = &v.parent_version_id {
                current_vid = parent_id.clone();
            } else {
                break;
            }
        }
        
        let baseline_v = patch_stack.pop().unwrap();
        let mut current_buffer = Vec::new();
        
        if let Some(sp) = baseline_v.storage_path {
            let bytes = fs::read(&sp).map_err(|e| e.to_string())?;
            if baseline_v.encoding.as_deref() == Some("gzip") {
                let mut decoder = GzDecoder::new(&bytes[..]);
                let _ = decoder.read_to_end(&mut current_buffer);
            } else {
                current_buffer = bytes;
            }
        } else {
            return Err("No baseline".into());
        }
        
        patch_stack.reverse();
        for p in patch_stack {
            if let Some(sp) = p.storage_path {
                let delta_bytes = fs::read(&sp).map_err(|e| e.to_string())?;
                current_buffer = fossil_delta::apply(&current_buffer, &delta_bytes).map_err(|e| format!("{:?}", e))?;
            }
        }
        
        Ok(current_buffer)
    }
}
