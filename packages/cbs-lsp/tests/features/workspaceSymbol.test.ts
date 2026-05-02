import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { SymbolKind, type WorkspaceSymbolParams } from 'vscode-languageserver/node';

import {
  createWorkspaceScanFileFromText,
  buildWorkspaceScanResult,
  ElementRegistry,
  IncrementalRebuilder,
  UnifiedVariableGraph,
} from '../../src/indexer';
import { ActivationChainService, VariableFlowService, type WorkspaceSnapshotState } from '../../src/services';
import type { WorkspaceDiagnosticsState } from '../../src/helpers/server-workspace-helper';
import { FragmentAnalysisService } from '../../src/core';
import { WorkspaceSymbolProvider } from '../../src/features/symbols';
import {
  serializeWorkspaceSymbolsEnvelopeForGolden,
  snapshotWorkspaceSymbolsEnvelope,
} from '../fixtures/fixture-corpus';

function createParams(query: string): WorkspaceSymbolParams {
  return { query };
}

function lorebookDocument(bodyLines: readonly string[]): string {
  return ['---', 'name: Hero Entry', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
}

function promptDocument(sections: Readonly<Record<string, readonly string[]>>): string {
  const lines = ['---', 'type: plain', '---'];
  for (const [section, bodyLines] of Object.entries(sections)) {
    lines.push(`@@@ ${section}`, ...bodyLines);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * createWorkspaceState 함수.
 * workspace symbol 테스트용 Layer 1/3 state를 실제 구현으로 조립함.
 *
 * @param workspaceRoot - 테스트 workspace root 경로
 * @param files - 생성할 in-memory workspace 파일 목록
 * @returns WorkspaceSymbolProvider가 읽을 workspace diagnostics state
 */
function createWorkspaceState(
  workspaceRoot: string,
  files: readonly { relativePath: string; text: string }[],
): WorkspaceDiagnosticsState {
  const scanResult = buildWorkspaceScanResult(
    workspaceRoot,
    files.map((file) =>
      createWorkspaceScanFileFromText({
        workspaceRoot,
        absolutePath: path.join(workspaceRoot, file.relativePath),
        text: file.text,
      }),
    ),
  );
  const registry = ElementRegistry.fromScanResult(scanResult);
  const graph = UnifiedVariableGraph.fromRegistry(registry);
  const workspaceSnapshot: WorkspaceSnapshotState = {
    rootPath: workspaceRoot,
    snapshotVersion: 1,
    documentVersions: new Map(),
  };

  return {
    rootPath: workspaceRoot,
    workspaceSnapshot,
    scanResult,
    registry,
    graph,
    incrementalRebuilder: new IncrementalRebuilder({ scanResult, registry, graph }),
    variableFlowService: VariableFlowService.fromRegistry(registry, { graph }),
    activationChainService: ActivationChainService.fromRegistry(registry),
  };
}

describe('WorkspaceSymbolProvider', () => {
  it('exposes variables, CBS local functions, lorebook entries, and prompt sections', () => {
    const workspaceState = createWorkspaceState('/workspace', [
      {
        relativePath: 'lorebooks/hero.risulorebook',
        text: lorebookDocument(['{{setvar::affection::10}}', '{{#func greetFriend target}}Hello{{/func}}']),
      },
      {
        relativePath: 'prompts/dialog.risuprompt',
        text: promptDocument({
          TEXT: ['{{getvar::affection}}'],
          INNER_FORMAT: ['plain'],
        }),
      },
    ]);
    const provider = new WorkspaceSymbolProvider({
      analysisService: new FragmentAnalysisService(),
      resolveWorkspaceStates: () => [workspaceState],
    });

    const symbols = provider.provide(createParams(''));

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'affection',
          kind: SymbolKind.Variable,
          containerName: 'lorebooks/hero.risulorebook',
        }),
        expect.objectContaining({
          name: 'greetFriend',
          kind: SymbolKind.Function,
          containerName: 'lorebooks/hero.risulorebook#CONTENT',
        }),
        expect.objectContaining({
          name: 'Hero Entry',
          kind: SymbolKind.Namespace,
          containerName: 'lorebooks/hero.risulorebook',
        }),
        expect.objectContaining({
          name: 'TEXT',
          kind: SymbolKind.Module,
          containerName: 'prompts/dialog.risuprompt',
        }),
        expect.objectContaining({
          name: 'INNER_FORMAT',
          kind: SymbolKind.Module,
          containerName: 'prompts/dialog.risuprompt',
        }),
      ]),
    );

    const snapshot = snapshotWorkspaceSymbolsEnvelope(symbols);
    expect(snapshot).toEqual({
      schema: 'cbs-lsp-agent-contract',
      schemaVersion: '1.0.0',
      availability: expect.objectContaining({
        features: expect.arrayContaining([
          expect.objectContaining({ key: 'workspaceSymbol', scope: 'local-first' }),
        ]),
      }),
      provenance: {
        reason: 'contextual-inference',
        source: 'workspace-symbol:workspace-builder',
        detail:
          'Workspace symbol snapshots are derived from ElementRegistry, UnifiedVariableGraph, ActivationChainService, and fragment analysis. They expose workspace-wide variables, CBS local functions, lorebook entries, and prompt sections while preserving deterministic prefix/fuzzy query ordering.',
      },
      symbols: expect.arrayContaining([
        expect.objectContaining({ name: 'affection', symbolKind: 'variable' }),
        expect.objectContaining({ name: 'greetFriend', symbolKind: 'function' }),
        expect.objectContaining({ name: 'Hero Entry', symbolKind: 'namespace' }),
        expect.objectContaining({ name: 'TEXT', symbolKind: 'module' }),
      ]),
    });
  });

  it('prefers prefix matches ahead of fuzzy matches and keeps deterministic ordering', () => {
    const workspaceState = createWorkspaceState('/workspace', [
      {
        relativePath: 'lorebooks/hero.risulorebook',
        text: lorebookDocument(['{{#func gfAlpha target}}Hello{{/func}}', '{{#func greetFriend target}}Glow{{/func}}']),
      },
    ]);
    const provider = new WorkspaceSymbolProvider({
      analysisService: new FragmentAnalysisService(),
      resolveWorkspaceStates: () => [workspaceState],
    });

    const symbols = provider.provide(createParams('gf'));

    expect(symbols.map((symbol) => symbol.name)).toEqual(['gfAlpha', 'greetFriend']);
    expect(serializeWorkspaceSymbolsEnvelopeForGolden(snapshotWorkspaceSymbolsEnvelope(symbols))).toBe(
      serializeWorkspaceSymbolsEnvelopeForGolden(
        snapshotWorkspaceSymbolsEnvelope([...(provider.provide(createParams('gf')))].reverse()),
      ),
    );
  });

  it('degrades to empty results when no workspace state is available', () => {
    const provider = new WorkspaceSymbolProvider({
      analysisService: new FragmentAnalysisService(),
      resolveWorkspaceStates: () => [],
    });

    expect(provider.provide(createParams('aff'))).toEqual([]);
  });
});
