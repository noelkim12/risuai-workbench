import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  defaultCbsLanguageServerSettings,
  getEmbeddedCbsServerModulePath,
  getWorkspaceLocalCbsBinaryPath,
  resolveCbsLanguageServerLaunch,
} from '../../src/lsp/cbsLanguageServerLaunch';

const extensionRootPath = path.resolve('isolated-extension');
const packagedServer = path.join(
  extensionRootPath, 'node_modules', '@risuai-workbench', 'cbs-language-server', 'dist', 'embedded.js',
);

test('installed VSIX resolves its own server without an open workspace', () => {
  const plan = resolveCbsLanguageServerLaunch({
    extensionRootPath,
    workspaceRootPath: null,
    settings: defaultCbsLanguageServerSettings(),
    exists: (candidate) => candidate === packagedServer,
  });
  assert.equal(plan.kind, 'embedded');
  if (plan.kind === 'embedded') assert.equal(plan.modulePath, packagedServer);
});

test('packaged server takes precedence over the monorepo development fallback', () => {
  assert.equal(getEmbeddedCbsServerModulePath(extensionRootPath, () => true), packagedServer);
  assert.equal(
    getEmbeddedCbsServerModulePath(extensionRootPath, () => false),
    path.join(extensionRootPath, '..', 'cbs-lsp', 'dist', 'embedded.js'),
  );
});

test('workspace server retains precedence over the packaged server in auto mode', () => {
  const workspaceRootPath = path.resolve('author-workspace');
  const binary = getWorkspaceLocalCbsBinaryPath(workspaceRootPath);
  const plan = resolveCbsLanguageServerLaunch({
    extensionRootPath,
    workspaceRootPath,
    settings: defaultCbsLanguageServerSettings(),
    exists: (candidate) => candidate === packagedServer || candidate === binary,
  });
  assert.equal(plan.kind, 'standalone');
  if (plan.kind === 'standalone') assert.equal(plan.command, binary);
});

test('a missing explicit server override is not hidden by the packaged server', () => {
  const plan = resolveCbsLanguageServerLaunch({
    extensionRootPath,
    workspaceRootPath: null,
    settings: { ...defaultCbsLanguageServerSettings(), pathOverride: './missing-server' },
    exists: (candidate) => candidate === packagedServer,
  });
  assert.equal(plan.kind, 'failure');
});
