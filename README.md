# Revio 🕒

> **⚠️ Work in Progress**: This project is currently under active development. Expect frequent updates and experimental features.

**Revio** is a robust, local-first file versioning and restoration system. Think of it as "Git for everyone"—it allows you to track changes in any local directory and restore previous versions of files or entire folders with a single click. No accounts, no cloud, just pure local protection.

## 🚀 Key Features

- **Real-time Syncing**: High-performance watcher detects file changes instantly and protects your work as you go.
- **Dynamic File Status**: Real-time status badges visually indicate whether files are synced, created, or modified.
- **Visual Version Timeline**: Browse through snapshots of your files with a clean, intuitive history view.
- **Smart Restoration**: Accidentally deleted a file? Modified something you shouldn't have? Restore individual files or use the **"Restore All"** function for entire directory structures to any previous point in time.
- **Immediate Feedback**: Seamless toast notifications provide real-time updates on restoration success and errors.
- **Local-First Architecture**: All versions are stored in a hidden `.restorex` folder inside your directory. Your data never leaves your machine.
- **Premium UI**: A modern, minimalist glassmorphic dashboard built for speed and clarity.

## 🛠️ Technology Stack

- **Frontend**: React + Vite (Vanilla CSS for styling)
- **Backend**: Node.js + Express
- **Desktop Wrapper**: Electron
- **Native Core**: Custom C++ implementation for low-latency file monitoring

## 📂 How It Works

When you start syncing a folder, the app creates a hidden `.restorex` directory:
- `versions/`: Stores compressed/full copies of your files timestamped for recovery.
- `metadata.json`: A local database tracking every change, version ID, and file status.

## 🏁 Getting Started

### Prerequisites

- **Node.js**: v16 or higher
- **npm**: for dependency management
- **C++ Compiler**: (Optional) if you wish to rebuild the native watcher component

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/arpitsehal/restore.git
   ```

2. Install dependencies for all components:
   ```bash
   npm install
   cd frontend && npm install
   cd ../backend && npm install
   cd ../electron && npm install
   ```

### Running the App

To launch the full development environment (Frontend, Backend, and Electron):

```bash
./start-dev.bat
```

## 🤝 Contributing

Contributions are welcome! Since this is a work in progress, feel free to open issues or submit pull requests to help improve the system.

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.


