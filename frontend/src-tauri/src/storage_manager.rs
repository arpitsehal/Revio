use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use chrono::Utc;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub watch_path: Option<String>,
    pub max_versions: usize,
    #[serde(default)]
    pub ignored_patterns: Vec<String>,
    #[serde(default)]
    pub auto_start: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            watch_path: None,
            max_versions: 50,
            ignored_patterns: vec![],
            auto_start: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    pub version_id: String,
    pub timestamp: String,
    pub size: u64,
    pub status: String,
    pub storage_path: Option<String>,
    pub restored_from: Option<String>,
    pub encoding: Option<String>,
    pub parent_version_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
    pub id: String,
    pub name: String,
    pub relative_path: String,
    pub current_status: String,
    pub size: Option<u64>,
    pub versions: Vec<Version>,
    pub last_seen: String,
    pub last_restored_version_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Metadata {
    pub files: HashMap<String, FileRecord>,
}

pub struct StorageManager {
    pub config: Config,
    pub meta_cache: HashMap<String, Metadata>,
}

impl StorageManager {
    pub fn new() -> Self {
        let app_data = dirs::data_dir().unwrap().join(".restorex");
        let _ = fs::create_dir_all(&app_data);
        
        let config_file = app_data.join("config.json");
        let config = if config_file.exists() {
            let data = fs::read_to_string(&config_file).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Config::default()
        };

        StorageManager {
            config,
            meta_cache: HashMap::new(),
        }
    }

    pub fn save_config(&self) {
        let app_data = dirs::data_dir().unwrap().join(".restorex");
        let config_file = app_data.join("config.json");
        if let Ok(json) = serde_json::to_string_pretty(&self.config) {
            let _ = fs::write(config_file, json);
        }
    }

    pub fn get_meta_file(watch_path: &str) -> PathBuf {
        Path::new(watch_path).join(".restorex").join("metadata.json")
    }

    pub fn ensure_metadata(&mut self, watch_path: &str) -> &mut Metadata {
        let wp = watch_path.to_lowercase();
        if self.meta_cache.contains_key(&wp) {
            return self.meta_cache.get_mut(&wp).unwrap();
        }

        let mf = Self::get_meta_file(&wp);
        let meta = if mf.exists() {
            let data = fs::read_to_string(&mf).unwrap_or_default();
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            let meta = Metadata::default();
            let _ = fs::create_dir_all(mf.parent().unwrap());
            if let Ok(json) = serde_json::to_string_pretty(&meta) {
                let _ = fs::write(&mf, json);
            }
            meta
        };

        self.meta_cache.insert(wp.clone(), meta);
        self.meta_cache.get_mut(&wp).unwrap()
    }

    pub fn save_meta(&self) {
        if let Some(wp) = &self.config.watch_path {
            let wpl = wp.to_lowercase();
            if let Some(meta) = self.meta_cache.get(&wpl) {
                let mf = Self::get_meta_file(&wpl);
                let _ = fs::create_dir_all(mf.parent().unwrap());
                if let Ok(json) = serde_json::to_string_pretty(meta) {
                    let _ = fs::write(&mf, json);
                }
            }
        }
    }

    pub fn get_file(&self, rel_path: &str) -> Option<FileRecord> {
        if let Some(wp) = &self.config.watch_path {
            if let Some(meta) = self.meta_cache.get(&wp.to_lowercase()) {
                return meta.files.get(rel_path).cloned();
            }
        }
        None
    }
}
