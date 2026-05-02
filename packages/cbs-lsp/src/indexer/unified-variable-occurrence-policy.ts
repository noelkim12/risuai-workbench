/**
 * UnifiedVariableGraph occurrence ID and artifact policy helpers.
 * @file packages/cbs-lsp/src/indexer/unified-variable-occurrence-policy.ts
 */

import type { CustomExtensionArtifact } from 'risu-workbench-core';
import type { UnifiedVariableOccurrenceId } from './unified-variable-graph';

/**
 * Inclusion policy: artifact kinds that should be included in the graph.
 */
export const INCLUDED_ARTIFACTS: ReadonlySet<CustomExtensionArtifact> = new Set([
  'lorebook',
  'regex',
  'prompt',
  'html',
  'lua',
]);

/**
 * Exclusion policy: artifact kinds that should NOT be included in the graph.
 * toggle and variable files are excluded as they don't contain CBS fragments
 * or Lua state API calls that participate in the variable graph.
 */
export const EXCLUDED_ARTIFACTS: ReadonlySet<CustomExtensionArtifact> = new Set([
  'toggle',
  'variable',
]);

/**
 * shouldExcludeArtifact 함수.
 * Check if an artifact kind should be excluded from the variable graph.
 *
 * @param artifact - The artifact kind to check
 * @returns true if the artifact should be excluded
 */
export function shouldExcludeArtifact(artifact: CustomExtensionArtifact): boolean {
  return EXCLUDED_ARTIFACTS.has(artifact);
}

/**
 * shouldIncludeArtifact 함수.
 * Check if an artifact kind should be included in the variable graph.
 *
 * @param artifact - The artifact kind to check
 * @returns true if the artifact should be included
 */
export function shouldIncludeArtifact(artifact: CustomExtensionArtifact): boolean {
  return INCLUDED_ARTIFACTS.has(artifact);
}

/**
 * buildOccurrenceId 함수.
 * Build occurrence ID in the canonical format.
 * Format: `{elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}`
 *
 * @param elementId - The element ID
 * @param direction - 'read' or 'write'
 * @param hostStartOffset - Byte offset (inclusive)
 * @param hostEndOffset - Byte offset (exclusive)
 * @param variableName - The variable name
 * @returns The formatted occurrence ID
 */
export function buildOccurrenceId(
  elementId: string,
  direction: 'read' | 'write',
  hostStartOffset: number,
  hostEndOffset: number,
  variableName: string,
): UnifiedVariableOccurrenceId {
  return `${elementId}:${direction}:${hostStartOffset}-${hostEndOffset}:${variableName}`;
}
