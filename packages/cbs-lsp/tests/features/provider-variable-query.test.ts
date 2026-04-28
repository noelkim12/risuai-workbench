/**
 * Provider-neutral variable query helper tests.
 * @file packages/cbs-lsp/tests/features/provider-variable-query.test.ts
 */

import type { Range } from 'risu-workbench-core';
import { describe, expect, it, vi } from 'vitest';

import {
  collectProviderWorkspaceVariableSegments,
  mergeProviderVariableSegments,
  shouldAllowDefaultDefinitionForProvider,
} from '../../src/features/shared';
import type { VariableFlowService } from '../../src/services';
import {
  createVariableFlowQueryResult,
  createVariableOccurrence,
} from './variable-flow-test-helpers';

function range(line: number, start: number, end: number): Range {
  return {
    start: { line, character: start },
    end: { line, character: end },
  };
}

describe('provider variable query helper', () => {
  it('keeps local-first precedence while sorting each segment', () => {
    const merged = mergeProviderVariableSegments([
      [
        { uri: 'file:///b.risulorebook', range: range(3, 2, 5), source: 'local-reference' },
        { uri: 'file:///a.risulorebook', range: range(1, 4, 7), source: 'local-definition' },
      ],
      [
        { uri: 'file:///a.risulorebook', range: range(1, 4, 7), source: 'workspace-writer' },
        { uri: 'file:///c.risuregex', range: range(0, 1, 6), source: 'workspace-reader' },
      ],
    ]);

    expect(merged).toEqual([
      { uri: 'file:///a.risulorebook', range: range(1, 4, 7), source: 'local-definition' },
      { uri: 'file:///b.risulorebook', range: range(3, 2, 5), source: 'local-reference' },
      { uri: 'file:///c.risuregex', range: range(0, 1, 6), source: 'workspace-reader' },
    ]);
  });

  it('uses one default-definition policy across providers', () => {
    expect(shouldAllowDefaultDefinitionForProvider('definition', true)).toBe(true);
    expect(shouldAllowDefaultDefinitionForProvider('references', true)).toBe(true);
    expect(shouldAllowDefaultDefinitionForProvider('references', false)).toBe(false);
    expect(shouldAllowDefaultDefinitionForProvider('hover', true)).toBe(false);
    expect(shouldAllowDefaultDefinitionForProvider('rename', true)).toBe(false);
  });

  it('collects workspace writers, readers, and defaults using caller policy', () => {
    const defaultRange = range(2, 0, 6);
    const writer = createVariableOccurrence({
      variableName: 'mood',
      direction: 'write',
      uri: 'file:///writer.risulorebook',
      relativePath: 'writer.risulorebook',
      range: range(4, 8, 12),
      sourceName: 'setvar',
    });
    const reader = createVariableOccurrence({
      variableName: 'mood',
      direction: 'read',
      uri: 'file:///reader.risuregex',
      relativePath: 'reader.risuregex',
      range: range(5, 1, 5),
      sourceName: 'getvar',
    });
    const query = createVariableFlowQueryResult('mood', [writer], [reader]);
    const service = {
      queryVariable: vi.fn(() => query),
      getDefaultVariableDefinitions: vi.fn(() => [
        { uri: 'file:///variables/main.risuvar', range: defaultRange, value: 'happy' },
      ]),
    } as unknown as VariableFlowService;

    const segments = collectProviderWorkspaceVariableSegments({
      variableFlowService: service,
      variableName: 'mood',
      includeWriters: true,
      includeReaders: true,
      includeDefaultDefinitions: true,
    });

    expect(segments).toEqual({
      writers: [{ uri: 'file:///writer.risulorebook', range: range(4, 8, 12), source: 'workspace-writer' }],
      readers: [{ uri: 'file:///reader.risuregex', range: range(5, 1, 5), source: 'workspace-reader' }],
      defaultDefinitions: [
        { uri: 'file:///variables/main.risuvar', range: defaultRange, source: 'default-definition' },
      ],
      query,
    });
  });
});
