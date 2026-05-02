/**
 * UnifiedVariableGraph to core variable-flow bridge helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-derived-flow.ts
 */

import { analyzeVariableFlow, type ElementCBSData, type VarFlowResult } from 'risu-workbench-core';
import type { ElementRegistry } from './element-registry';
import type { UnifiedVariableGraph } from './unified-variable-graph';

/**
 * buildDerivedFlowResult 함수.
 * graph occurrence를 core variable-flow 입력으로 연결함.
 *
 * @param graph - 분석할 UnifiedVariableGraph
 * @param registry - ElementCBSData lookup을 제공하는 registry
 * @param defaultVariables - uninitialized-read 판정에 반영할 기본 변수 값
 * @returns core variable-flow 분석 결과
 */
export function buildDerivedFlowResult(
  graph: UnifiedVariableGraph,
  registry: ElementRegistry,
  defaultVariables: Record<string, string> = {},
): VarFlowResult {
  // Collect ElementCBSData from the registry for flow analysis
  const elementCbsData: ElementCBSData[] = [];

  for (const variableName of graph.getAllVariableNames()) {
    const variableNode = graph.getVariable(variableName);
    if (!variableNode) continue;

    // Group occurrences by element
    const occurrencesByElement = new Map<string, typeof variableNode.readers[number]>();

    for (const occ of variableNode.readers) {
      if (!occurrencesByElement.has(occ.elementId)) {
        occurrencesByElement.set(occ.elementId, occ);
      }
    }

    for (const occ of variableNode.writers) {
      if (!occurrencesByElement.has(occ.elementId)) {
        occurrencesByElement.set(occ.elementId, occ);
      }
    }

    // Build ElementCBSData for each element
    for (const [, occ] of occurrencesByElement) {
      const elementData = registry.getElementCbsDataByUri(occ.uri);
      const matchingElement = elementData.find((e) =>
        occ.fragmentSection
          ? e.elementName === `${occ.relativePath}#${occ.fragmentSection}`
          : e.elementName === occ.relativePath,
      );

      if (matchingElement) {
        elementCbsData.push(matchingElement);
      }
    }
  }

  // Deduplicate ElementCBSData by elementName
  const seenElements = new Set<string>();
  const uniqueElementCbsData = elementCbsData.filter((e) => {
    if (seenElements.has(e.elementName)) {
      return false;
    }
    seenElements.add(e.elementName);
    return true;
  });

  // Delegate to core's analyzeVariableFlow
  return analyzeVariableFlow(uniqueElementCbsData, defaultVariables);
}
