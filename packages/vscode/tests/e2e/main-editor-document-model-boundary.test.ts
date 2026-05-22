/**
 * Main editor document-model boundary tests.
 * @file packages/vscode/tests/e2e/main-editor-document-model-boundary.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

interface BuiltMainEditorTypesModule {
  MAIN_EDITOR_PROTOCOL: string;
  MAIN_EDITOR_PROTOCOL_VERSION: number;
  isMainEditorStructuredEditMessage: (message: unknown) => boolean;
}

function importBuiltModule<T>(relativePath: string): T {
  return localRequire(path.join(vscodeDistRoot, relativePath)) as T;
}

test('main editor protocol guards accept structured model payloads', () => {
  const module = importBuiltModule<BuiltMainEditorTypesModule>('editors/mainEditor/mainEditorTypes.js');

  assert.equal(module.isMainEditorStructuredEditMessage({}), false);
  assert.equal(
    module.isMainEditorStructuredEditMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/structuredEdit',
      payload: {
        requestId: 'req-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        baseVersion: 3,
        formatKind: 'lorebook',
        state: {
          frontmatter: { name: 'Entry' },
          unknownFrontmatter: [],
          keysText: 'alpha',
          secondaryKeysText: '',
          contentText: 'Body',
          hasSecondaryKeysSection: false,
        },
      },
    }),
    true,
  );
  assert.equal(
    module.isMainEditorStructuredEditMessage({
      protocol: module.MAIN_EDITOR_PROTOCOL,
      version: module.MAIN_EDITOR_PROTOCOL_VERSION,
      type: 'main-editor/structuredEdit',
      payload: {
        requestId: 'req-1',
        documentUri: 'file:///tmp/entry.risulorebook',
        baseVersion: 3,
        formatKind: 'lorebook',
        state: { contentText: 'missing required fields' },
      },
    }),
    false,
  );
});
