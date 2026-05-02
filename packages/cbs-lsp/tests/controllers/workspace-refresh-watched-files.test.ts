/**
 * Watched-file refresh request adapter tests.
 * @file packages/cbs-lsp/tests/controllers/workspace-refresh-watched-files.test.ts
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { FileChangeType } from 'vscode-languageserver/node';
import { afterEach, describe, expect, it } from 'vitest';

import {
  collectWorkspaceWatchedFileChanges,
  toWatchedFileRefreshRequests,
} from '../../src/controllers/workspace-refresh/watchedFileRefreshRequests';

const roots: string[] = [];

function createWorkspaceRoot(): string {
  const rootPath = path.join(tmpdir(), `cbs-lsp-watched-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  roots.push(rootPath);
  return rootPath;
}

function createWorkspaceUri(rootPath: string, relativePath: string): string {
  const filePath = path.join(rootPath, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  return pathToFileURL(filePath).toString();
}

describe('watchedFileRefreshRequests', () => {
  afterEach(() => {
    for (const rootPath of roots.splice(0)) {
      rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it('filters non-workspace URIs and preserves first-seen reason order', () => {
    const rootPath = createWorkspaceRoot();
    const changedB = createWorkspaceUri(rootPath, 'lorebooks/b.risulorebook');
    const changedA = createWorkspaceUri(rootPath, 'lorebooks/a.risulorebook');
    const deleted = createWorkspaceUri(rootPath, 'lua/main.risulua');
    const created = createWorkspaceUri(rootPath, 'regex/new.risuregex');

    const requests = toWatchedFileRefreshRequests({
      changes: [
        { uri: changedB, type: FileChangeType.Changed },
        { uri: 'file:///outside.txt', type: FileChangeType.Created },
        { uri: deleted, type: FileChangeType.Deleted },
        { uri: changedA, type: FileChangeType.Changed },
        { uri: created, type: FileChangeType.Created },
      ],
    });

    expect(requests).toEqual([
      { reason: 'watched-file-change', changedUris: [changedA, changedB] },
      { reason: 'watched-file-delete', changedUris: [deleted] },
      { reason: 'watched-file-create', changedUris: [created] },
    ]);
  });

  it('returns workspace changes for controller trace payloads', () => {
    const uri = createWorkspaceUri(createWorkspaceRoot(), 'lorebooks/entry.risulorebook');

    expect(
      collectWorkspaceWatchedFileChanges({
        changes: [
          { uri: 'file:///outside.txt', type: FileChangeType.Changed },
          { uri, type: FileChangeType.Created },
        ],
      }),
    ).toEqual([{ uri, type: FileChangeType.Created }]);
  });
});
