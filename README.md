# Revio 🕒

> **🚀 High-Performance Release**: Revio has been fully migrated to a native **Rust/Tauri** architecture for maximum speed and security.

**Revio** is a robust, local-first file versioning and restoration system. Think of it as "Git for everyone"—it allows you to track changes in any local directory and restore previous versions of files or entire folders with a single click. No accounts, no cloud, just pure local protection.

## 🚀 Key Features

- **Native Rust Engine**: The core logic is written in Rust, providing near-instant delta reconstruction and high-performance file monitoring.
- **Real-time Syncing**: Native `notify` watcher detects file changes instantly with microscopic CPU overhead.
- **Visual Version Timeline**: Browse through snapshots of your files with a clean, intuitive history view.
- **Smart Restoration**: Accidentally deleted a file? Restore individual files or use the **"Restore All"** function for entire directory structures to any previous point in time.
- **Local-First Architecture**: All versions are stored in a hidden `.restorex` folder inside your directory. Your data never leaves your machine.
- **Premium UI**: A modern, minimalist glassmorphic dashboard built for speed and clarity.

## ⚡ Storage Optimizations

Revio employs a native dual-layer compression engine to minimize disk usage:
- **Binary Delta Engine**: When you edit a tracked file, Revio computes the exact binary differences using the Fossil SCM algorithm and saves a microscopic "delta" file (often reducing backup sizes by over 99%).
- **Native GZIP Compression**: Large baselines are compressed using the high-speed `flate2` Rust library.
- **Smart Bypassing**: Already-compressed media (like `.zip`, `.mp4`, `.jpg`) automatically bypass the compression engines to save CPU cycles.

## 🛠️ Technology Stack

- **Core Engine**: Rust (Native binary)
- **Desktop Framework**: [Tauri v2](https://tauri.app/)
- **Frontend**: React + Vite
- **Delta Algorithm**: [Fossil Delta](https://docs.rs/fossil-delta/latest/fossil_delta/)
- **Persistence**: JSON-based native metadata cache

## 🏁 Getting Started

### Prerequisites

- **Rust**: [Install Rust](https://www.rust-lang.org/tools/install) (latest stable)
- **Node.js**: v18 or higher
- **npm**: for frontend dependency management

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/arpitsehal/restore.git
   ```

2. Install frontend dependencies:
   ```bash
   cd Revio/frontend
   npm install
   ```

### Running the App

To launch the native desktop application in development mode:

```bash
npm run dev
```

To build the final optimized executable:

```bash
npm run build
```

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests to help improve the system.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
