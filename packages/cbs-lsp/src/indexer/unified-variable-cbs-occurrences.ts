/**
 * UnifiedVariableGraph CBS occurrence extraction helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-cbs-occurrences.ts
 */

import {
  CBSParser,
  extractCBSVariableOccurrences,
  type CBSVariableOccurrence,
  type BlockNode,
  type Range,
} from 'risu-workbench-core';
import { extractEachLoopBinding, isStaticEachIteratorIdentifier } from '../analyzer/block-header';
import type { ElementRegistryFragmentElement, ElementRegistryGraphSeed } from './element-registry';
import { positionToOffset, rebaseRangeToHost } from './unified-variable-coordinates';
import { buildOccurrenceId } from './unified-variable-occurrence-policy';
import type { UnifiedVariableOccurrence } from './unified-variable-graph';

/**
 * buildCbsUnifiedOccurrence 함수.
 * CBS fragment-local occurrence를 host document 좌표의 unified occurrence로 변환함.
 *
 * @param cbsOccurrence - core CBS 분석에서 나온 fragment-local occurrence
 * @param seed - occurrence identity와 artifact metadata를 제공하는 graph seed
 * @param element - host range 기준이 되는 CBS fragment element
 * @param fragmentContent - fragment-local position 해석에 쓰는 원문
 * @param hostDocumentContent - host offset 계산에 쓰는 전체 문서 원문
 * @returns host document 좌표로 rebasing된 unified occurrence
 */
export function buildCbsUnifiedOccurrence(
  cbsOccurrence: CBSVariableOccurrence,
  seed: ElementRegistryGraphSeed,
  element: ElementRegistryFragmentElement,
  fragmentContent: string,
  hostDocumentContent: string,
): UnifiedVariableOccurrence {
  const fragmentStart = element.fragment.hostRange.start;

  // Rebase the key range from fragment-local to host-document coordinates
  const hostRange: Range = rebaseRangeToHost(
    { start: cbsOccurrence.keyStart, end: cbsOccurrence.keyEnd },
    fragmentStart,
    fragmentContent,
    hostDocumentContent,
  );

  // Calculate host offsets from the host range positions
  const hostStartOffset = positionToOffset(hostDocumentContent, hostRange.start);
  const hostEndOffset = positionToOffset(hostDocumentContent, hostRange.end);

  // Rebase the argument range as well
  const argumentRange = rebaseRangeToHost(
    cbsOccurrence.range,
    fragmentStart,
    fragmentContent,
    hostDocumentContent,
  );

  return {
    occurrenceId: buildOccurrenceId(
      seed.elementId,
      cbsOccurrence.direction,
      hostStartOffset,
      hostEndOffset,
      cbsOccurrence.variableName,
    ),
    variableName: cbsOccurrence.variableName,
    direction: cbsOccurrence.direction,
    sourceKind: 'cbs-macro',
    sourceName: cbsOccurrence.operation,
    uri: seed.uri,
    relativePath: seed.relativePath,
    artifact: seed.artifact,
    artifactClass: seed.artifactClass,
    elementId: seed.elementId,
    elementName: seed.elementName,
    fragmentSection: seed.fragmentSection,
    analysisKind: seed.analysisKind,
    hostRange,
    hostStartOffset,
    hostEndOffset,
    argumentRange,
    metadata: {
      fragmentIndex: seed.fragmentIndex,
    },
  };
}

/**
 * extractCbsOccurrencesFromFragment 함수.
 * CBS fragment에서 core occurrence와 `#each` iterator read occurrence를 추출함.
 *
 * @param element - 분석할 CBS fragment element
 * @param hostDocumentContent - host 좌표 rebasing에 쓰는 전체 문서 원문
 * @returns host document 좌표를 가진 unified occurrence 목록
 */
export function extractCbsOccurrencesFromFragment(
  element: ElementRegistryFragmentElement,
  hostDocumentContent: string,
): UnifiedVariableOccurrence[] {
  const fragmentContent = element.fragment.content;
  const cbsOccurrences = extractCBSVariableOccurrences(fragmentContent);
  const unifiedOccurrences = cbsOccurrences.map((cbsOcc) =>
    buildCbsUnifiedOccurrence(cbsOcc, element.graphSeed, element, fragmentContent, hostDocumentContent),
  );

  for (const eachOccurrence of extractEachIteratorCbsOccurrences(fragmentContent)) {
    const unifiedOccurrence = buildCbsUnifiedOccurrence(
      eachOccurrence,
      element.graphSeed,
      element,
      fragmentContent,
      hostDocumentContent,
    );
    const alreadyIndexed = unifiedOccurrences.some(
      (candidate) => candidate.occurrenceId === unifiedOccurrence.occurrenceId,
    );
    if (!alreadyIndexed) {
      unifiedOccurrences.push(unifiedOccurrence);
    }
  }

  return unifiedOccurrences;
}

/**
 * extractEachIteratorCbsOccurrences 함수.
 * core dist가 아직 block iterator read를 내지 않는 환경에서도 Layer 1 read metadata를 보강함.
 *
 * @param fragmentContent - 분석할 CBS fragment 원문
 * @returns 정적 `#each` iterator source read occurrence 목록
 */
export function extractEachIteratorCbsOccurrences(fragmentContent: string): CBSVariableOccurrence[] {
  const document = new CBSParser().parse(fragmentContent);
  const occurrences: CBSVariableOccurrence[] = [];

  const visitBlock = (node: BlockNode): void => {
    if (node.kind === 'each') {
      const binding = extractEachLoopBinding(node, fragmentContent);
      if (binding && isStaticEachIteratorIdentifier(binding.iteratorExpression)) {
        occurrences.push({
          variableName: binding.iteratorExpression,
          direction: 'read',
          operation: '#each',
          range: binding.iteratorRange,
          keyStart: binding.iteratorRange.start,
          keyEnd: binding.iteratorRange.end,
        } as unknown as CBSVariableOccurrence);
      }
    }

    for (const child of [...node.condition, ...node.body, ...(node.elseBody ?? [])]) {
      if (child.type === 'Block') {
        visitBlock(child);
      }
    }
  };

  for (const node of document.nodes) {
    if (node.type === 'Block') {
      visitBlock(node);
    }
  }

  return occurrences;
}
