/**
 * Focused launch-plan checks for the standalone CBS language server.
 * @file packages/vscode/tests/e2e/cbs-language-server-launch.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCbsLanguageServerLaunch } from '../../src/lsp/cbsLanguageServerLaunch';

test('npx install mode launches the scoped package without an interactive prompt', () => {
  const plan = resolveCbsLanguageServerLaunch({
    extensionRootPath: '/extension',
    platform: 'linux',
    settings: {
      installMode: 'npx',
      launchMode: 'standalone',
      luaLsPath: '',
      pathOverride: '',
    },
    workspaceRootPath: '/workspace',
  });

  assert.equal(plan.kind, 'standalone');
  if (plan.kind !== 'standalone') return;
  assert.equal(plan.command, 'npx');
  assert.deepEqual(plan.args, [
    '--yes',
    '--package',
    '@risuai-workbench/cbs-language-server',
    'cbs-language-server',
    '--stdio',
  ]);
});
