/**
 * Thin read-only handlers for analyze/wiki/graph-backed creative tools.
 * @file packages/risuai-workbench-mcp/src/tools/creative/analyze-backed-handlers.ts
 */

import {
  buildCritiqueIdeaWithAnalyzeResult,
  buildFindGraphBridgeIdeasResult,
  buildOptimizePromptChainInsertionResult,
  buildPreviewCreativeImpactResult,
  buildRemixDeadCodeIntoIdeasResult,
  type CritiqueIdeaWithAnalyzeResult,
  type FindGraphBridgeIdeasResult,
  type OptimizePromptChainInsertionResult,
  type PreviewCreativeImpactResult,
  type RemixDeadCodeIntoIdeasResult,
} from '../../creative/analyze-backed-tools';

export async function handlePreviewCreativeImpact(input: unknown): Promise<PreviewCreativeImpactResult> {
  return buildPreviewCreativeImpactResult(input);
}

export async function handleFindGraphBridgeIdeas(input: unknown): Promise<FindGraphBridgeIdeasResult> {
  return buildFindGraphBridgeIdeasResult(input);
}

export async function handleCritiqueIdeaWithAnalyze(input: unknown): Promise<CritiqueIdeaWithAnalyzeResult> {
  return buildCritiqueIdeaWithAnalyzeResult(input);
}

export async function handleRemixDeadCodeIntoIdeas(input: unknown): Promise<RemixDeadCodeIntoIdeasResult> {
  return buildRemixDeadCodeIntoIdeasResult(input);
}

export async function handleOptimizePromptChainInsertion(input: unknown): Promise<OptimizePromptChainInsertionResult> {
  return buildOptimizePromptChainInsertionResult(input);
}
