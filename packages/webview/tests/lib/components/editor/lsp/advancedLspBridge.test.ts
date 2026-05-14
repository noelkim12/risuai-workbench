/**
 * Advanced LSP bridge webview helper tests.
 * @file packages/webview/tests/lib/components/editor/lsp/advancedLspBridge.test.ts
 */

import { describe, expect, it, vi } from 'vitest';
import { createAdvancedLspRequestController, normalizeWorkspaceSymbolQuery } from '../../../../../src/lib/components/editor/lsp/advancedLspBridge';

describe('advanced LSP request controller', () => {
  it('resolves a matching response and ignores stale response ids', async () => {
    const postMessage = vi.fn();
    const controller = createAdvancedLspRequestController({ postMessage, requestTimeoutMs: 1000 });

    const promise = controller.requestReferences({
      requestId: 'refs-1',
      documentUri: 'file:///tmp/entry.risulorebook',
      documentVersion: 5,
      formatKind: 'lorebook',
      sectionName: 'CONTENT',
      position: { lineNumber: 1, column: 8 },
      includeDeclaration: true,
    });

    controller.handleExtensionMessage({
      protocol: 'risu-workbench.main-editor',
      version: 1,
      type: 'main-editor/lspReferencesResult',
      payload: { requestId: 'other', locations: [] },
    });
    controller.handleExtensionMessage({
      protocol: 'risu-workbench.main-editor',
      version: 1,
      type: 'main-editor/lspReferencesResult',
      payload: {
        requestId: 'refs-1',
        locations: [{ uri: 'file:///tmp/entry.risulorebook', sourceRange: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } }],
      },
    });

    await expect(promise).resolves.toHaveLength(1);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'main-editor/lspReferences' }));
    controller.dispose();
  });

  it('rejects pending requests on disposal', async () => {
    const controller = createAdvancedLspRequestController({ postMessage: vi.fn(), requestTimeoutMs: 1000 });
    const promise = controller.requestWorkspaceSymbols({ requestId: 'symbols-1', query: 'mood', limit: 20 });

    controller.dispose();

    await expect(promise).rejects.toThrow(/disposed/);
  });
});

describe('workspace symbol search', () => {
  it('trims query and clamps limit', () => {
    expect(normalizeWorkspaceSymbolQuery({ query: '  mood  ', limit: 200 })).toEqual({ query: 'mood', limit: 50 });
    expect(normalizeWorkspaceSymbolQuery({ query: '', limit: 20 })).toEqual({ query: '', limit: 20 });
  });
});
