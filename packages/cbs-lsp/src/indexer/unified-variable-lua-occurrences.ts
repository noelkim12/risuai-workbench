/**
 * UnifiedVariableGraph Lua occurrence extraction helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-lua-occurrences.ts
 */

import type { Range, StateAccessOccurrence } from 'risu-workbench-core';
import type { ElementRegistryGraphSeed } from './element-registry';
import { offsetToPosition } from './unified-variable-coordinates';
import { buildOccurrenceId } from './unified-variable-occurrence-policy';
import type { UnifiedVariableOccurrence } from './unified-variable-graph';

/**
 * buildLuaUnifiedOccurrence 함수.
 * Lua state access occurrence를 host-document 좌표의 unified occurrence로 변환함.
 *
 * @param luaOccurrence - core Lua 분석에서 나온 state access occurrence
 * @param seed - Lua element의 graph seed
 * @param documentContent - Lua host document 전체 텍스트
 * @returns Unified variable occurrence 한 건
 */
export function buildLuaUnifiedOccurrence(
  luaOccurrence: StateAccessOccurrence,
  seed: ElementRegistryGraphSeed,
  documentContent: string,
): UnifiedVariableOccurrence {
  // Lua occurrences already have byte offsets (argStart/argEnd)
  const hostStartOffset = luaOccurrence.argStart;
  const hostEndOffset = luaOccurrence.argEnd;

  // Convert byte offsets to Range positions
  const hostRange: Range = {
    start: offsetToPosition(documentContent, hostStartOffset),
    end: offsetToPosition(documentContent, hostEndOffset),
  };

  return {
    occurrenceId: buildOccurrenceId(
      seed.elementId,
      luaOccurrence.direction,
      hostStartOffset,
      hostEndOffset,
      luaOccurrence.key,
    ),
    variableName: luaOccurrence.key,
    direction: luaOccurrence.direction,
    sourceKind: 'lua-state-api',
    sourceName: luaOccurrence.apiName,
    uri: seed.uri,
    relativePath: seed.relativePath,
    artifact: seed.artifact,
    artifactClass: seed.artifactClass,
    elementId: seed.elementId,
    elementName: seed.elementName,
    fragmentSection: null,
    analysisKind: seed.analysisKind,
    hostRange,
    hostStartOffset,
    hostEndOffset,
    argumentRange: hostRange, // For Lua, the key range is the argument range
    metadata: {
      containingFunction: luaOccurrence.containingFunction,
      line: luaOccurrence.line,
    },
  };
}

/**
 * buildLuaUnifiedOccurrences 함수.
 * Lua state access occurrence 목록을 unified occurrence 목록으로 변환함.
 *
 * @param occurrences - core Lua 분석에서 나온 state access occurrence 목록
 * @param seed - Lua element의 graph seed
 * @param documentContent - Lua host document 전체 텍스트
 * @returns Unified variable occurrence 목록
 */
export function buildLuaUnifiedOccurrences(
  occurrences: readonly StateAccessOccurrence[],
  seed: ElementRegistryGraphSeed,
  documentContent: string,
): UnifiedVariableOccurrence[] {
  return occurrences.map((luaOccurrence) => buildLuaUnifiedOccurrence(luaOccurrence, seed, documentContent));
}
