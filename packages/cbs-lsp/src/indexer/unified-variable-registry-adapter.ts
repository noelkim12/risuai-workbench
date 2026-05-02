/**
 * ElementRegistry to UnifiedVariableGraph adapter helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-registry-adapter.ts
 */

import type {
  ElementRegistry,
  ElementRegistryFragmentElement,
  ElementRegistryLuaElement,
} from './element-registry';
import { UnifiedVariableGraph, type UnifiedVariableOccurrence } from './unified-variable-graph';
import { extractCbsOccurrencesFromFragment } from './unified-variable-cbs-occurrences';
import { buildLuaUnifiedOccurrences } from './unified-variable-lua-occurrences';
import { shouldExcludeArtifact } from './unified-variable-occurrence-policy';
import { sortOccurrencesDeterministically } from './unified-variable-snapshot';

/**
 * buildOccurrencesForUri 함수.
 * registry의 단일 URI만 다시 읽어 부분 갱신용 occurrence 목록을 계산함.
 *
 * @param registry - source-of-truth registry
 * @param uri - 부분 갱신할 file URI
 * @returns 해당 URI의 최신 occurrence 목록
 */
export function buildOccurrencesForUri(
  registry: ElementRegistry,
  uri: string,
): readonly UnifiedVariableOccurrence[] {
  const file = registry.getFileByUri(uri);
  if (!file || shouldExcludeArtifact(file.artifact) || !file.cbsBearingArtifact) {
    return [];
  }

  if (file.artifact !== 'lua' && !file.hasCbsFragments) {
    return [];
  }

  const hostDocumentContent = file.text;
  const elements = registry.getElementsByUri(file.uri);
  const occurrences: UnifiedVariableOccurrence[] = [];

  for (const element of elements) {
    if (element.analysisKind === 'cbs-fragment') {
      occurrences.push(
        ...extractCbsOccurrencesFromFragment(element as ElementRegistryFragmentElement, hostDocumentContent),
      );
      continue;
    }

    const luaElement = element as ElementRegistryLuaElement;
    const luaArtifact = registry.getLuaArtifactByUri(file.uri);
    if (!luaArtifact) {
      continue;
    }

    occurrences.push(
      ...buildLuaUnifiedOccurrences(
        luaArtifact.serialized.stateAccessOccurrences,
        luaElement.graphSeed,
        luaArtifact.sourceText ?? hostDocumentContent,
      ),
    );
  }

  return sortOccurrencesDeterministically(occurrences);
}

/**
 * buildOccurrencesFromRegistry 함수.
 * ElementRegistry 전체에서 CBS/Lua occurrence 배열을 분리해 구성함.
 *
 * @param registry - occurrence source-of-truth registry
 * @returns CBS occurrence와 Lua occurrence 배열 묶음
 */
function buildOccurrencesFromRegistry(registry: ElementRegistry): {
  cbsOccurrences: UnifiedVariableOccurrence[];
  luaOccurrences: UnifiedVariableOccurrence[];
} {
  const cbsOccurrences: UnifiedVariableOccurrence[] = [];
  const luaOccurrences: UnifiedVariableOccurrence[] = [];

  const snapshot = registry.getSnapshot();

  for (const file of snapshot.files) {
    for (const occurrence of buildOccurrencesForUri(registry, file.uri)) {
      if (occurrence.sourceKind === 'lua-state-api') {
        luaOccurrences.push(occurrence);
      } else {
        cbsOccurrences.push(occurrence);
      }
    }
  }

  return { cbsOccurrences, luaOccurrences };
}

/**
 * buildUnifiedVariableGraphFromRegistry 함수.
 * ElementRegistry에서 UnifiedVariableGraph를 직접 생성함.
 *
 * @param registry - Layer 1 source-of-truth registry
 * @returns registry occurrence로 구성한 graph 인스턴스
 */
export function buildUnifiedVariableGraphFromRegistry(
  registry: ElementRegistry,
): UnifiedVariableGraph {
  const { cbsOccurrences, luaOccurrences } = buildOccurrencesFromRegistry(registry);

  return UnifiedVariableGraph.build({
    rootPath: registry.getRootPath(),
    cbsOccurrences,
    luaOccurrences,
  });
}
