/**
 * Minimal vscode module mock for unit and smoke tests.
 *
 * The built CJS bundle (dist/extension.js) requires 'vscode' at the top level.
 * In the VS Code runtime this is provided by the host. For Node.js tests we
 * register a lightweight stub so require('vscode') resolves without error.
 *
 * Usage: require this file before requiring dist/extension.js, or pass
 *        --require test/_setup/vscode-mock.cjs to node.
 */
'use strict';

const Module = require('module');
const path = require('path');

// Only install if not already present (e.g. running inside VS Code)
try {
  require.resolve('vscode');
} catch {
  /**
   * Minimal EventEmitter matching VS Code's vscode.EventEmitter interface.
   */
  class MockEventEmitter {
    constructor() {
      this._listeners = [];
      this._disposed = false;
      this.event = (listener) => {
        this._listeners.push(listener);
        return { dispose: () => {
          const idx = this._listeners.indexOf(listener);
          if (idx >= 0) this._listeners.splice(idx, 1);
        }};
      };
    }
    fire(data) {
      if (this._disposed) return;
      for (const listener of [...this._listeners]) {
        listener(data);
      }
    }
    dispose() {
      this._disposed = true;
      this._listeners.length = 0;
    }
  }

  /**
   * Mock FileSystemWatcher -- stores callbacks but never fires them
   * (test code drives changes explicitly via the store/watcher API).
   */
  class MockFileSystemWatcher {
    constructor() {
      this._onCreate = new MockEventEmitter();
      this._onChange = new MockEventEmitter();
      this._onDelete = new MockEventEmitter();
    }
    get onDidCreate() { return this._onCreate.event; }
    get onDidChange() { return this._onChange.event; }
    get onDidDelete() { return this._onDelete.event; }
    dispose() {
      this._onCreate.dispose();
      this._onChange.dispose();
      this._onDelete.dispose();
    }
  }

  // Track mock filesystem state for tests
  const _mockFiles = new Map();

  /**
   * Mock ThemeColor -- stores ID for assertion.
   */
  class MockThemeColor {
    constructor(id) {
      this.id = id;
    }
  }

  /**
   * Mock ThemeIcon -- stores ID and optional color for assertion.
   */
  class MockThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  }

  /**
   * Mock TreeItem -- base class for tree items.
   */
  class MockTreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const mock = {
    // Expose MockEventEmitter for direct construction in extension code
    EventEmitter: MockEventEmitter,

    // Expose RelativePattern as a simple constructor
    RelativePattern: function RelativePattern(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    },

    // Theme classes
    ThemeColor: MockThemeColor,
    ThemeIcon: MockThemeIcon,
    TreeItem: MockTreeItem,

    // TreeItemCollapsibleState enum
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },

    workspace: {
      workspaceFolders: undefined,
      createFileSystemWatcher: (_pattern, _ignoreCreate, _ignoreChange, _ignoreDelete) => {
        return new MockFileSystemWatcher();
      },
      fs: {
        stat: (uri) => {
          const p = typeof uri === 'string' ? uri : (uri.fsPath || uri.path || '');
          const entry = _mockFiles.get(p);
          if (entry) {
            return Promise.resolve({
              type: 1, // vscode.FileType.File
              ctime: entry.ctime || Date.now(),
              mtime: entry.mtime || Date.now(),
              size: entry.size || 0,
            });
          }
          return Promise.reject(new Error('mock: file not found: ' + p));
        },
        readFile: (uri) => {
          const p = typeof uri === 'string' ? uri : (uri.fsPath || uri.path || '');
          const entry = _mockFiles.get(p);
          if (entry && entry.content !== undefined) {
            // Return Uint8Array like VS Code does
            const buf = Buffer.from(entry.content, 'utf-8');
            return Promise.resolve(buf);
          }
          return Promise.reject(new Error('mock: file not found: ' + p));
        },
        readDirectory: (uri) => {
          // Return empty array -- tests populate via _mockFiles
          return Promise.resolve([]);
        },
      },
      // Expose mock file store for test setup
      _mockFiles,
    },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        dispose: () => {},
      }),
      showInformationMessage: () => Promise.resolve(undefined),
      showTextDocument: () => Promise.resolve(undefined),
      registerTreeDataProvider: () => ({ dispose: () => {} }),
    },
    commands: {
      registerCommand: () => ({ dispose: () => {} }),
      executeCommand: () => Promise.resolve(undefined),
    },
    env: {
      clipboard: {
        writeText: () => Promise.resolve(),
        readText: () => Promise.resolve(''),
      },
    },
    Uri: {
      file: (fsPath) => ({ fsPath, path: fsPath, scheme: 'file' }),
      joinPath: (base, ...parts) => {
        const basePath = typeof base === 'string' ? base : (base.fsPath || '');
        const joined = path.join(basePath, ...parts);
        return { fsPath: joined, path: joined, scheme: 'file' };
      },
    },
    extensions: {
      getExtension: () => undefined,
    },
    // File type enum stub
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64,
    },
  };

  // Inject into Node module cache so require('vscode') returns our mock
  const vscodeId = 'vscode';
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === vscodeId) {
      return vscodeId;
    }
    return resolveFilename.call(this, request, parent, isMain, options);
  };

  require.cache[vscodeId] = {
    id: vscodeId,
    filename: vscodeId,
    loaded: true,
    exports: mock,
    paths: [],
    children: [],
    parent: null,
  };
}
