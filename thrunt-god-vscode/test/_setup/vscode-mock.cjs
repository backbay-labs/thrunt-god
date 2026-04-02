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
  // Create a minimal mock of the vscode API surface used by the extension
  const mock = {
    workspace: {
      workspaceFolders: undefined,
      fs: {
        stat: () => Promise.reject(new Error('mock: no filesystem')),
      },
    },
    window: {
      createOutputChannel: () => ({
        appendLine: () => {},
        dispose: () => {},
      }),
      showInformationMessage: () => Promise.resolve(undefined),
    },
    commands: {
      registerCommand: () => ({ dispose: () => {} }),
    },
    Uri: {
      joinPath: (...parts) => ({ fsPath: parts.join('/') }),
    },
    extensions: {
      getExtension: () => undefined,
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
