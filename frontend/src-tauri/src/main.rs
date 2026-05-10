// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod storage_manager;
mod version_engine;

use std::sync::Mutex;
use tauri::State;
use storage_manager::{StorageManager, Config, FileRecord, Version};
use serde::{Deserialize, Serialize};
use notify::{Watcher, RecommendedWatcher, RecursiveMode, EventKind};
use tauri::{Manager, Emitter};

pub struct AppState {
    pub storage: Mutex<StorageManager>,
    pub is_watching: Mutex<bool>,
    pub watcher: Mutex<Option<notify::RecommendedWatcher>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub total_files: usize,
    pub total_folders: usize,
    pub total_versions: usize,
    pub deleted_files: usize,
    pub modified_files: usize,
    pub top_extensions: Vec<String>,
    pub watching: bool,
    pub watch_path: Option<String>,
    pub using_cpp: bool,
    pub syncing: bool,
}

#[tauri::command]
fn get_stats(state: State<AppState>) -> Result<Stats, String> {
    let mut storage = state.storage.lock().unwrap();
    let config = storage.config.clone();
    let is_watching = *state.is_watching.lock().unwrap();
    
    let mut total_files = 0;
    let mut deleted_files = 0;
    let mut modified_files = 0;
    let mut total_versions = 0;

    if let Some(wp) = &config.watch_path {
        let meta = storage.ensure_metadata(wp);
        for (_, f) in meta.files.iter() {
            total_files += 1;
            total_versions += f.versions.len();
            if f.current_status == "deleted" { deleted_files += 1; }
            if f.current_status == "modified" { modified_files += 1; }
        }
    }

    Ok(Stats {
        total_files,
        total_folders: 0,
        total_versions,
        deleted_files,
        modified_files,
        top_extensions: vec![],
        watching: is_watching,
        watch_path: config.watch_path,
        using_cpp: false,
        syncing: false,
    })
}

#[tauri::command]
fn get_files(
    state: State<AppState>, 
    search: Option<String>, 
    status: Option<String>, 
    ext: Option<String>
) -> Result<Vec<FileRecord>, String> {
    let mut storage = state.storage.lock().unwrap();
    let config = storage.config.clone();
    
    if let Some(wp) = &config.watch_path {
        let meta = storage.ensure_metadata(wp);
        let mut files: Vec<FileRecord> = meta.files.values()
            .filter(|f| {
                let mut matches = true;
                if let Some(s) = &search {
                    if !s.trim().is_empty() {
                        let q = s.to_lowercase();
                        matches = matches && (f.name.to_lowercase().contains(&q) || f.relative_path.to_lowercase().contains(&q));
                    }
                }
                if let Some(st) = &status {
                    if !st.trim().is_empty() {
                        matches = matches && (f.current_status == *st);
                    }
                }
                if let Some(e) = &ext {
                    if !e.trim().is_empty() {
                        matches = matches && f.name.to_lowercase().ends_with(&format!(".{}", e.to_lowercase()));
                    }
                }
                matches
            })
            .cloned()
            .collect();
        files.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
        return Ok(files);
    }
    
    Ok(vec![])
}

#[derive(Serialize)]
pub struct VersionsResponse {
    pub versions: Vec<Version>,
    pub file: Option<FileRecord>,
}

#[tauri::command]
fn get_versions(state: State<AppState>, id: String) -> Result<VersionsResponse, String> {
    let mut storage = state.storage.lock().unwrap();
    let config = storage.config.clone();
    
    if let Some(wp) = &config.watch_path {
        let meta = storage.ensure_metadata(wp);
        if let Some(file) = meta.files.values().find(|f| f.id == id) {
            let mut versions = file.versions.clone();
            versions.reverse();
            return Ok(VersionsResponse {
                versions,
                file: Some(file.clone()),
            });
        }
    }
    
    Ok(VersionsResponse {
        versions: vec![],
        file: None,
    })
}

#[tauri::command]
fn watch_folder(state: State<AppState>, watch_path: String) -> Result<String, String> {
    let mut storage = state.storage.lock().unwrap();
    
    if let Some(old_path) = &storage.config.watch_path {
        if let Some(w) = state.watcher.lock().unwrap().as_mut() {
            let _ = w.unwatch(std::path::Path::new(old_path));
        }
    }
    
    storage.config.watch_path = Some(watch_path.clone());
    storage.save_config();
    *state.is_watching.lock().unwrap() = true;
    
    if let Some(w) = state.watcher.lock().unwrap().as_mut() {
        if let Err(e) = w.watch(std::path::Path::new(&watch_path), RecursiveMode::Recursive) {
            println!("Failed to watch: {:?}", e);
        }
    }
    
    println!("Watching folder: {}", watch_path);
    Ok("Watching started".to_string())
}

#[tauri::command]
fn stop_watching(state: State<AppState>) -> Result<String, String> {
    *state.is_watching.lock().unwrap() = false;
    println!("Watching stopped");
    Ok("Watching stopped".to_string())
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Result<Config, String> {
    let storage = state.storage.lock().unwrap();
    Ok(storage.config.clone())
}

#[tauri::command]
fn update_settings(state: State<AppState>, updates: Config) -> Result<String, String> {
    let mut storage = state.storage.lock().unwrap();
    storage.config = updates;
    storage.save_config();
    Ok("Settings updated".to_string())
}

#[tauri::command]
fn restore_version(state: State<AppState>, id: String, version_id: String, as_copy: bool) -> Result<String, String> {
    let mut storage = state.storage.lock().unwrap();
    version_engine::VersionEngine::restore_version(&mut storage, &id, &version_id, as_copy)
}

#[tauri::command]
fn restore_folder(state: State<AppState>, folder_path: String) -> Result<String, String> {
    let mut storage = state.storage.lock().unwrap();
    version_engine::VersionEngine::restore_folder(&mut storage, &folder_path)
}

fn main() {
    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();

    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle().clone();

            std::thread::spawn(move || {
                for res in rx {
                    match res {
                        Ok(event) => {
                            let state = app_handle.state::<AppState>();
                            let is_watching = *state.is_watching.lock().unwrap();
                            if !is_watching { continue; }

                            if let EventKind::Modify(_) | EventKind::Create(_) | EventKind::Remove(_) = event.kind {
                                let mut storage = state.storage.lock().unwrap();
                                let root_path = match &storage.config.watch_path {
                                    Some(p) => p.clone(),
                                    None => continue,
                                };

                                for path in event.paths {
                                    let mut path_str = path.to_string_lossy().replace("\\", "/");
                                    if path_str.starts_with("//?/") { path_str = path_str[4..].to_string(); }
                                    
                                    let mut root_str = root_path.replace("\\", "/");
                                    if root_str.starts_with("//?/") { root_str = root_str[4..].to_string(); }
                                    
                                    if path_str.contains(".restorex") { continue; }

                                    let path_lower = path_str.to_lowercase();
                                    let root_lower = root_str.to_lowercase();

                                    if path_lower.starts_with(&root_lower) {
                                        let rel_path = path_str[root_str.len()..].trim_start_matches('/');
                                        if rel_path.is_empty() { continue; }
                                        
                                        let action = match event.kind {
                                            EventKind::Remove(_) => "deleted",
                                            EventKind::Create(_) => "created",
                                            _ => "modified",
                                        };
                                        println!("Detected {} on {}", action, rel_path);
                                        let _ = version_engine::VersionEngine::process_event(&mut storage, action, rel_path);
                                        let _ = app_handle.emit("file-changed", ());
                                    } else {
                                        println!("Ignoring event for path not in root: {}", path_str);
                                    }
                                }
                            }
                        },
                        Err(e) => println!("watch error: {:?}", e),
                    }
                }
            });

            let watcher = notify::RecommendedWatcher::new(tx, notify::Config::default()).unwrap();
            let state = app.state::<AppState>();
            *state.watcher.lock().unwrap() = Some(watcher);

            let watch_path = state.storage.lock().unwrap().config.watch_path.clone();
            if let Some(path) = watch_path {
                if let Some(w) = state.watcher.lock().unwrap().as_mut() {
                    let _ = w.watch(std::path::Path::new(&path), RecursiveMode::Recursive);
                }
            }

            Ok(())
        })
        .manage(AppState {
            storage: Mutex::new(StorageManager::new()),
            is_watching: Mutex::new(false),
            watcher: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            get_stats,
            get_files,
            get_versions,
            watch_folder,
            stop_watching,
            get_settings,
            update_settings,
            restore_version,
            restore_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
