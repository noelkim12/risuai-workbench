/**
 * Read-only handlers for deterministic creative ideation tools.
 * @file packages/risuai-workbench-mcp/src/tools/creative/ideation-handlers.ts
 */

import {
  buildBrainstormScamperResult,
  buildCreateMatrixResult,
  buildExtractContradictionsResult,
  buildGenerateCombinationsResult,
  buildSuggestContradictionResolutionsResult,
  type IdeationToolResult,
} from '../../creative/ideation-tools';

export async function handleBrainstormScamper(input: unknown): Promise<IdeationToolResult> {
  return buildBrainstormScamperResult(input);
}

export async function handleCreateMatrix(input: unknown): Promise<IdeationToolResult> {
  return buildCreateMatrixResult(input);
}

export async function handleGenerateCombinations(input: unknown): Promise<IdeationToolResult> {
  return buildGenerateCombinationsResult(input);
}

export async function handleExtractContradictions(input: unknown): Promise<IdeationToolResult> {
  return buildExtractContradictionsResult(input);
}

export async function handleSuggestContradictionResolutions(input: unknown): Promise<IdeationToolResult> {
  return buildSuggestContradictionResolutionsResult(input);
}
