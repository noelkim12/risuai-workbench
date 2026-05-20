/**
 * Webview nonce helper boundary tests.
 * @file packages/vscode/tests/e2e/webview-nonce-boundary.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const { createWebviewNonce } = localRequire(
  path.join(vscodeDistRoot, 'shared', 'webviewNonce.js'),
) as { createWebviewNonce: () => string };

test('createWebviewNonce returns a non-empty string', () => {
  const nonce = createWebviewNonce();
  assert.ok(typeof nonce === 'string', 'nonce should be a string');
  assert.ok(nonce.length > 0, 'nonce should not be empty');
});

test('createWebviewNonce produces unique values on successive calls', () => {
  const nonces = new Set<string>();
  for (let i = 0; i < 50; i++) {
    nonces.add(createWebviewNonce());
  }
  assert.equal(nonces.size, 50, 'each nonce should be unique');
});

test('createWebviewNonce output is valid base64', () => {
  const nonce = createWebviewNonce();
  assert.ok(/^[A-Za-z0-9+/]+=*$/.test(nonce), `nonce should be valid base64, got: ${nonce}`);
});
