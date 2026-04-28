/**
 * UnifiedVariableGraph snapshot builder helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-snapshot.ts
 */

import { createCbsAgentProtocolMarker } from '../core';
import type {
  UnifiedVariableGraphSnapshot,
  UnifiedVariableNode,
  UnifiedVariableOccurrence,
  UnifiedVariableOccurrenceId,
} from './unified-variable-graph';

/**
 * buildSnapshotFromOccurrences 함수.
 * occurrence iterable에서 canonical graph snapshot을 다시 계산함.
 *
 * @param rootPath - workspace root path
 * @param occurrences - snapshot에 포함할 전체 occurrence iterable
 * @returns serialization-friendly graph snapshot
 */
export function buildSnapshotFromOccurrences(
  rootPath: string,
  occurrences: Iterable<UnifiedVariableOccurrence>,
): UnifiedVariableGraphSnapshot {
  const allOccurrences = [...occurrences];
  const sortedOccurrences = sortOccurrencesDeterministically(allOccurrences);
  const occurrencesByVariable = groupOccurrencesByVariable(sortedOccurrences);
  const variableNodes: UnifiedVariableNode[] = [];
  const variableIndex: Record<string, UnifiedVariableNode> = {};

  for (const [variableName, variableOccurrences] of occurrencesByVariable) {
    const readers = variableOccurrences.filter((occurrence) => occurrence.direction === 'read');
    const writers = variableOccurrences.filter((occurrence) => occurrence.direction === 'write');
    const uris = [...new Set(variableOccurrences.map((occurrence) => occurrence.uri))].sort();
    const artifacts = [...new Set(variableOccurrences.map((occurrence) => occurrence.artifact))].sort();
    const node: UnifiedVariableNode = {
      name: variableName,
      readers,
      writers,
      occurrenceCount: variableOccurrences.length,
      artifacts,
      uris,
    };

    variableNodes.push(node);
    variableIndex[variableName] = node;
  }

  const occurrencesByUri: Record<string, UnifiedVariableOccurrenceId[]> = {};
  const occurrencesByElementId: Record<string, UnifiedVariableOccurrenceId[]> = {};

  for (const occurrence of sortedOccurrences) {
    if (!occurrencesByUri[occurrence.uri]) {
      occurrencesByUri[occurrence.uri] = [];
    }
    occurrencesByUri[occurrence.uri].push(occurrence.occurrenceId);

    if (!occurrencesByElementId[occurrence.elementId]) {
      occurrencesByElementId[occurrence.elementId] = [];
    }
    occurrencesByElementId[occurrence.elementId].push(occurrence.occurrenceId);
  }

  for (const uri of Object.keys(occurrencesByUri)) {
    occurrencesByUri[uri].sort();
  }
  for (const elementId of Object.keys(occurrencesByElementId)) {
    occurrencesByElementId[elementId].sort();
  }

  return {
    ...createCbsAgentProtocolMarker(),
    rootPath,
    variables: variableNodes,
    totalVariables: variableNodes.length,
    totalOccurrences: sortedOccurrences.length,
    variableIndex,
    occurrencesByUri,
    occurrencesByElementId,
    buildTimestamp: Date.now(),
  };
}

/**
 * Sort occurrences deterministically for stable iteration and serialization.
 *
 * Ordering: variable name → URI → hostStartOffset → hostEndOffset → occurrenceId
 */
export function sortOccurrencesDeterministically(
  occurrences: readonly UnifiedVariableOccurrence[],
): UnifiedVariableOccurrence[] {
  return [...occurrences].sort((a, b) => {
    // 1. Variable name
    const nameCompare = a.variableName.localeCompare(b.variableName);
    if (nameCompare !== 0) return nameCompare;

    // 2. URI
    const uriCompare = a.uri.localeCompare(b.uri);
    if (uriCompare !== 0) return uriCompare;

    // 3. Host start offset
    if (a.hostStartOffset !== b.hostStartOffset) {
      return a.hostStartOffset - b.hostStartOffset;
    }

    // 4. Host end offset
    if (a.hostEndOffset !== b.hostEndOffset) {
      return a.hostEndOffset - b.hostEndOffset;
    }

    // 5. Occurrence ID (tiebreaker)
    return a.occurrenceId.localeCompare(b.occurrenceId);
  });
}

/**
 * Group occurrences by variable name.
 */
export function groupOccurrencesByVariable(
  occurrences: readonly UnifiedVariableOccurrence[],
): Map<string, UnifiedVariableOccurrence[]> {
  const groups = new Map<string, UnifiedVariableOccurrence[]>();

  for (const occurrence of occurrences) {
    const { variableName } = occurrence;
    if (!groups.has(variableName)) {
      groups.set(variableName, []);
    }
    groups.get(variableName)!.push(occurrence);
  }

  return groups;
}
