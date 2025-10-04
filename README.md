# Context Keeper

![Build Status](https://img.shields.io/badge/build-passing-brightgreen) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)

A sophisticated Chrome extension designed to preserve a user's web surfing context, ensuring a seamless and continuous intellectual workflow.

This project was approached with the discipline and architecture of a significant software initiative, focusing on robustness, scalability, and user experience.

## Core Concepts

The fundamental problem we solve is **cognitive load reduction**. Users navigating complex information landscapes (e.g., technical documentation, research papers, long-form articles) expend significant mental energy re-establishing context after interruptions. Context Keeper mitigates this by creating persistent sessions for web pages, saving not just the scroll position but also enabling active knowledge capture through highlighting and memos.

Our UX philosophy is a hybrid approach:
- **Keyboard-First for Power Users:** Core actions like saving (`Ctrl+Shift+S`) and deleting (`Ctrl+Shift+X`) are optimized for speed and minimal disruption.
- **Visual Management:** A comprehensive popup UI serves as a dashboard for organizing, searching, and analyzing saved sessions. It features a card-based layout, user-selectable sorting (by date, title, time), time-based filtering, and pagination for efficient handling of large lists.

## Tech Stack

- **Bundler:** Vite (`^7.1.9`) - For a fast, modern build process.
- **Language:** JavaScript (ESM) - Leveraging modern JS features.
- **Target:** Chrome Manifest V3 - Adhering to the latest extension platform standards.
- **Core APIs:** `chrome.storage`, `chrome.commands`, `chrome.tabs`, `chrome.scripting`

## Project Structure

The codebase is organized to clearly separate concerns between the different components of a Chrome extension.

```
context-keeper/
├── dist/                # Build output, this is loaded into Chrome
├── images/              # Static icon assets
├── js/                  # Core JavaScript source files
│   ├── background.js    # Service worker: handles state, alarms, context menus
│   ├── content.js       # Entry point for scripts injected into web pages
│   ├── highlighter.js   # DOM manipulation logic for highlighting/memos
│   ├── popup.js         # UI logic for the extension popup
│   ├── range-serializer.js # Robust XPath serialization for highlights
│   └── storage.js       # Abstraction layer for chrome.storage.local
├── popup/               # HTML and CSS for the popup
├── .gitignore
├── manifest.json        # The extension manifest
├── package.json
└── vite.config.js       # Vite build configuration
```

## Development Workflow

### Prerequisites
- Node.js (v18+)
- npm

### Getting Started

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Build for Production:**
    The build process, powered by Vite, bundles all necessary scripts and assets into the `/dist` directory.
    ```bash
    npm run build
    ```

3.  **Loading the Extension:**
    - Open Chrome and navigate to `chrome://extensions`.
    - Enable "Developer mode".
    - Click "Load unpacked".
    - Select the `dist` directory from this project.

## Key Architectural Decisions

1.  **Bundling Strategy:** All content scripts (`content.js`, `highlighter.js`, `range-serializer.js`) are bundled into a single `dist/js/content.js` file. This is managed by Vite by defining a single entry point in `vite.config.js` and using ES module `import` statements to create a dependency graph. This avoids issues with module loading in the content script environment.

2.  **Highlight Serialization:** To ensure highlights are restored reliably across page loads and on dynamic websites, we do not save the selected text itself as an anchor. Instead, we serialize the DOM `Range` object to a robust XPath. The `range-serializer.js` module is specifically designed to handle both Element nodes and Text nodes, making it resilient to changes in page structure.

3.  **State Management:** All application state (saved sessions, highlights, settings) is stored in `chrome.storage.local`. The `storage.js` module provides a simple promise-based API for all storage interactions. The `background.js` service worker acts as the central authority for state modification.

## Contribution Guidelines

- **Commits:** Please adhere to the [Conventional Commits](https://www.conventionalcommits.org/) specification.
- **Branching:** Follow a simplified Git Flow: branch from `main` for features (`feat/...`) or fixes (`fix/...`), and open a pull request back to `main`.
