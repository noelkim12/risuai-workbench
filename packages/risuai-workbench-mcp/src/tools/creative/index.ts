/**
 * Creative domain barrel — placeholder registration and handler exports.
 * @file packages/risuai-workbench-mcp/src/tools/creative/index.ts
 */

import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getWorkbenchTool } from '../../registry';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import {
  handleCritiqueIdeaWithAnalyze,
  handleFindGraphBridgeIdeas,
  handleOptimizePromptChainInsertion,
  handlePreviewCreativeImpact,
  handleRemixDeadCodeIntoIdeas,
} from './analyze-backed-handlers';
import { handleGatherContext, handleInspectContext, handleSearchContext } from './context-handlers';
import {
  handleBrainstormScamper,
  handleCreateMatrix,
  handleExtractContradictions,
  handleGenerateCombinations,
  handleSuggestContradictionResolutions,
} from './ideation-handlers';
import { handleTurnIdeaIntoPatchPlan, handleTurnIdeaIntoPlan } from './idea-to-patch-handlers';
import { handlePreviewIdeaPatch } from './idea-patch-preview-handlers';
import { handleApplyIdeaPatch } from './apply-idea-patch-handlers';
import { handleCreativePlaceholder } from './placeholder-handlers';
import {
  handleClusterIdeas,
  handleCritiqueSixHats,
  handleDeduplicateIdeas,
  handleOpenIdeaNeighborhood,
  handleRankIdeas,
  handleRedTeamConcept,
  handleSearchIdeaGraph,
} from './ranking-critique-handlers';
import { handleSaveIdeaSession, handleWriteIdeaMemory } from './session-handlers';
import type { PatchPlanStore } from '../../mutation/patch-store';
import type { MutationMode } from '../../mutation/mode';

export { handleGatherContext, handleInspectContext, handleSearchContext } from './context-handlers';
export {
  handleCritiqueIdeaWithAnalyze,
  handleFindGraphBridgeIdeas,
  handleOptimizePromptChainInsertion,
  handlePreviewCreativeImpact,
  handleRemixDeadCodeIntoIdeas,
} from './analyze-backed-handlers';
export {
  handleBrainstormScamper,
  handleCreateMatrix,
  handleExtractContradictions,
  handleGenerateCombinations,
  handleSuggestContradictionResolutions,
} from './ideation-handlers';
export { handleTurnIdeaIntoPatchPlan, handleTurnIdeaIntoPlan } from './idea-to-patch-handlers';
export { handlePreviewIdeaPatch } from './idea-patch-preview-handlers';
export { handleApplyIdeaPatch } from './apply-idea-patch-handlers';
export { handleCreativePlaceholder } from './placeholder-handlers';
export {
  handleClusterIdeas,
  handleCritiqueSixHats,
  handleDeduplicateIdeas,
  handleOpenIdeaNeighborhood,
  handleRankIdeas,
  handleRedTeamConcept,
  handleSearchIdeaGraph,
} from './ranking-critique-handlers';
export { handleSaveIdeaSession, handleWriteIdeaMemory } from './session-handlers';

/**
 * Creative tool definition used for placeholder registration.
 * Each entry maps to exactly one registry entry in CREATIVE_ROADMAP_TOOLS.
 */
interface CreativeToolScaffolding {
  readonly name: string;
  readonly inputSchema: Record<string, z.ZodTypeAny>;
}

/**
 * Permissive-but-bounded zod schemas for creative tools.
 * Placeholders accept any bounded input but ignore it entirely.
 * Implemented context tools accept compact caller-supplied summaries only.
 */
const OPTIONAL_STRING = z.string().optional();
const OPTIONAL_STRING_ARRAY = z.array(z.string()).optional();
const OPTIONAL_BOOLEAN = z.boolean().optional();
const OPTIONAL_UNKNOWN = z.unknown().optional();

const COMMON_IDEATION_INPUT_SCHEMA = {
  analyze: OPTIONAL_UNKNOWN,
  artifactKey: OPTIONAL_STRING,
  cards: OPTIONAL_UNKNOWN,
  context: OPTIONAL_UNKNOWN,
  contextCards: OPTIONAL_UNKNOWN,
  graph: OPTIONAL_UNKNOWN,
  matrix: OPTIONAL_UNKNOWN,
  method: OPTIONAL_STRING,
  relationshipNetwork: OPTIONAL_UNKNOWN,
  resourceLinks: OPTIONAL_STRING_ARRAY,
  sessionId: OPTIONAL_STRING,
  targetArtifacts: OPTIONAL_STRING_ARRAY,
  theme: OPTIONAL_STRING,
  wiki: OPTIONAL_UNKNOWN,
} as const;

const COMMON_ADVISORY_INPUT_SCHEMA = {
  ...COMMON_IDEATION_INPUT_SCHEMA,
  dimensions: OPTIONAL_UNKNOWN,
  graph: OPTIONAL_UNKNOWN,
  idea: OPTIONAL_UNKNOWN,
  ideaGraph: OPTIONAL_UNKNOWN,
  ideaId: OPTIONAL_STRING,
  ideaIds: OPTIONAL_STRING_ARRAY,
  ideas: OPTIONAL_UNKNOWN,
  query: OPTIONAL_STRING,
  relations: OPTIONAL_UNKNOWN,
  rubric: OPTIONAL_UNKNOWN,
  session: OPTIONAL_UNKNOWN,
} as const;

const CREATIVE_TOOL_SCAFFOLDING: readonly CreativeToolScaffolding[] = [
  {
    name: 'workbench.creative.gather_context',
    inputSchema: {
      analyze: OPTIONAL_UNKNOWN,
      artifactKey: OPTIONAL_STRING,
      graph: OPTIONAL_UNKNOWN,
      include: OPTIONAL_STRING_ARRAY,
      method: OPTIONAL_STRING,
      relationshipNetwork: OPTIONAL_UNKNOWN,
      resourceLinks: OPTIONAL_STRING_ARRAY,
      targetArtifacts: OPTIONAL_STRING_ARRAY,
      theme: OPTIONAL_STRING,
      wiki: OPTIONAL_UNKNOWN,
      workspaceRoot: OPTIONAL_STRING,
    },
  },
  {
    name: 'workbench.creative.inspect_context',
    inputSchema: {
      analyze: OPTIONAL_UNKNOWN,
      artifactKey: OPTIONAL_STRING,
      cardId: OPTIONAL_STRING,
      cards: OPTIONAL_UNKNOWN,
      contextCards: OPTIONAL_UNKNOWN,
      contextId: OPTIONAL_STRING,
      graph: OPTIONAL_UNKNOWN,
      include: OPTIONAL_STRING_ARRAY,
      relationshipNetwork: OPTIONAL_UNKNOWN,
      resourceLinks: OPTIONAL_STRING_ARRAY,
      theme: OPTIONAL_STRING,
      wiki: OPTIONAL_UNKNOWN,
    },
  },
  {
    name: 'workbench.creative.search_context',
    inputSchema: {
      analyze: OPTIONAL_UNKNOWN,
      artifactKey: OPTIONAL_STRING,
      cards: OPTIONAL_UNKNOWN,
      contextCards: OPTIONAL_UNKNOWN,
      graph: OPTIONAL_UNKNOWN,
      include: OPTIONAL_STRING_ARRAY,
      query: OPTIONAL_STRING,
      relationshipNetwork: OPTIONAL_UNKNOWN,
      resourceLinks: OPTIONAL_STRING_ARRAY,
      theme: OPTIONAL_STRING,
      wiki: OPTIONAL_UNKNOWN,
    },
  },
  { name: 'workbench.creative.brainstorm_scamper', inputSchema: COMMON_IDEATION_INPUT_SCHEMA },
  { name: 'workbench.creative.create_matrix', inputSchema: { ...COMMON_IDEATION_INPUT_SCHEMA, dimensions: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.generate_combinations', inputSchema: { ...COMMON_IDEATION_INPUT_SCHEMA, dimensions: OPTIONAL_UNKNOWN, matrixId: OPTIONAL_STRING } },
  { name: 'workbench.creative.extract_contradictions', inputSchema: { ...COMMON_IDEATION_INPUT_SCHEMA, contradiction: OPTIONAL_STRING, contradictions: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.suggest_contradiction_resolutions', inputSchema: { ...COMMON_IDEATION_INPUT_SCHEMA, contradiction: OPTIONAL_STRING, contradictionId: OPTIONAL_STRING, contradictions: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.critique_six_hats', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.rank_ideas', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.cluster_ideas', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.deduplicate_ideas', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.search_idea_graph', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.open_idea_neighborhood', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  { name: 'workbench.creative.preview_creative_impact', inputSchema: { ...COMMON_ADVISORY_INPUT_SCHEMA, deadCodeFindings: OPTIONAL_UNKNOWN, patchPreview: OPTIONAL_UNKNOWN, promptChain: OPTIONAL_UNKNOWN, tokenBudget: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.find_graph_bridge_ideas', inputSchema: { ...COMMON_ADVISORY_INPUT_SCHEMA, promptChain: OPTIONAL_UNKNOWN, tokenBudget: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.critique_idea_with_analyze', inputSchema: { ...COMMON_ADVISORY_INPUT_SCHEMA, patchPreview: OPTIONAL_UNKNOWN, promptChain: OPTIONAL_UNKNOWN, tokenBudget: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.remix_dead_code_into_ideas', inputSchema: { ...COMMON_ADVISORY_INPUT_SCHEMA, deadCode: OPTIONAL_UNKNOWN, deadCodeFindings: OPTIONAL_UNKNOWN } },
  { name: 'workbench.creative.optimize_prompt_chain_insertion', inputSchema: { ...COMMON_ADVISORY_INPUT_SCHEMA, patchPreview: OPTIONAL_UNKNOWN, promptChain: OPTIONAL_UNKNOWN, tokenBudget: OPTIONAL_UNKNOWN } },
  {
    name: 'workbench.creative.turn_idea_into_plan',
    inputSchema: {
      artifact: OPTIONAL_STRING,
      artifactRoot: OPTIONAL_STRING,
      entry: OPTIONAL_STRING,
      generatedOnly: OPTIONAL_BOOLEAN,
      graph: OPTIONAL_UNKNOWN,
      idea: OPTIONAL_UNKNOWN,
      ideaGraph: OPTIONAL_UNKNOWN,
      ideaId: OPTIONAL_STRING,
      ideas: OPTIONAL_UNKNOWN,
      orderPath: OPTIONAL_STRING,
      path: OPTIONAL_STRING,
      selectedIdeaId: OPTIONAL_STRING,
      session: OPTIONAL_UNKNOWN,
      stem: OPTIONAL_STRING,
      target: OPTIONAL_UNKNOWN,
      validationPlan: OPTIONAL_STRING_ARRAY,
    },
  },
  {
    name: 'workbench.creative.turn_idea_into_patch_plan',
    inputSchema: {
      artifact: OPTIONAL_STRING,
      artifactRoot: OPTIONAL_STRING,
      entry: OPTIONAL_STRING,
      generatedOnly: OPTIONAL_BOOLEAN,
      graph: OPTIONAL_UNKNOWN,
      idea: OPTIONAL_UNKNOWN,
      ideaGraph: OPTIONAL_UNKNOWN,
      ideaId: OPTIONAL_STRING,
      ideas: OPTIONAL_UNKNOWN,
      orderPath: OPTIONAL_STRING,
      path: OPTIONAL_STRING,
      selectedIdeaId: OPTIONAL_STRING,
      session: OPTIONAL_UNKNOWN,
      stem: OPTIONAL_STRING,
      target: OPTIONAL_UNKNOWN,
      validationPlan: OPTIONAL_STRING_ARRAY,
    },
  },
  { name: 'workbench.creative.preview_idea_patch', inputSchema: { ideaId: OPTIONAL_STRING, patchPlanId: OPTIONAL_STRING } },
  { name: 'workbench.creative.red_team_concept', inputSchema: COMMON_ADVISORY_INPUT_SCHEMA },
  {
    name: 'workbench.creative.apply_idea_patch',
    inputSchema: {
      confirmation: z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }),
      options: z.object({ createBackup: z.boolean().optional(), postValidate: z.boolean().optional(), rollbackOnValidationError: z.boolean().optional() }).optional(),
      patchPlanId: z.string(),
      sessionId: OPTIONAL_STRING,
    },
  },
  {
    name: 'workbench.creative.save_idea_session',
    inputSchema: {
      confirmation: OPTIONAL_BOOLEAN,
      createdAt: OPTIONAL_STRING,
      ideas: OPTIONAL_UNKNOWN,
      patchPlanRefs: OPTIONAL_UNKNOWN,
      rankings: OPTIONAL_UNKNOWN,
      session: OPTIONAL_UNKNOWN,
      sessionId: OPTIONAL_STRING,
      sourceInputs: OPTIONAL_UNKNOWN,
      status: OPTIONAL_STRING,
      title: OPTIONAL_STRING,
      updatedAt: OPTIONAL_STRING,
      workspaceRoot: OPTIONAL_STRING,
    },
  },
  {
    name: 'workbench.creative.write_idea_memory',
    inputSchema: {
      assumptions: OPTIONAL_STRING_ARRAY,
      confirmation: OPTIONAL_BOOLEAN,
      createdAt: OPTIONAL_STRING,
      evidence: OPTIONAL_STRING_ARRAY,
      idea: OPTIONAL_UNKNOWN,
      ideaId: OPTIONAL_STRING,
      memoryId: OPTIONAL_STRING,
      privacy: OPTIONAL_UNKNOWN,
      retention: OPTIONAL_UNKNOWN,
      sessionId: OPTIONAL_STRING,
      summary: OPTIONAL_STRING,
      title: OPTIONAL_STRING,
      updatedAt: OPTIONAL_STRING,
      workspaceRoot: OPTIONAL_STRING,
    },
  },
] as const;

/**
 * registerCreativeTools 함수.
 * Placeholder creative tools를 MCP server에 grouped registration으로 등록함.
 * 각 tool은 registry metadata에서 description과 title을 가져오고,
 * handler는 not-implemented diagnostic envelope를 반환함.
 *
 * @param server - MCP server 인스턴스
 * @param _workspace - workspace root 상태 (placeholder에서는 사용하지 않음)
 */
export function registerCreativeTools(server: McpServer, workspace: WorkspaceRootStatus, patchStore?: PatchPlanStore, mutationMode: MutationMode = 'preview-only'): void {
  for (const scaffolding of CREATIVE_TOOL_SCAFFOLDING) {
    const registryEntry = getWorkbenchTool(scaffolding.name);

    server.registerTool(
      scaffolding.name,
      {
        description: registryEntry?.description ?? `Creative placeholder: ${scaffolding.name}`,
        inputSchema: scaffolding.inputSchema,
        title: registryEntry?.title ?? scaffolding.name,
      },
      async (input: unknown) => {
        const result = await handleCreativeTool(scaffolding.name, input, workspace, patchStore, mutationMode);
        return { content: [{ text: JSON.stringify(result), type: 'text' as const }] };
      },
    );
  }
}

async function handleCreativeTool(toolName: string, input: unknown, workspace: WorkspaceRootStatus, patchStore?: PatchPlanStore, mutationMode: MutationMode = 'preview-only'): Promise<unknown> {
  if (toolName === 'workbench.creative.gather_context') return handleGatherContext(input);
  if (toolName === 'workbench.creative.inspect_context') return handleInspectContext(input);
  if (toolName === 'workbench.creative.search_context') return handleSearchContext(input);
  if (toolName === 'workbench.creative.brainstorm_scamper') return handleBrainstormScamper(input);
  if (toolName === 'workbench.creative.create_matrix') return handleCreateMatrix(input);
  if (toolName === 'workbench.creative.generate_combinations') return handleGenerateCombinations(input);
  if (toolName === 'workbench.creative.extract_contradictions') return handleExtractContradictions(input);
  if (toolName === 'workbench.creative.suggest_contradiction_resolutions') return handleSuggestContradictionResolutions(input);
  if (toolName === 'workbench.creative.rank_ideas') return handleRankIdeas(input);
  if (toolName === 'workbench.creative.critique_six_hats') return handleCritiqueSixHats(input);
  if (toolName === 'workbench.creative.red_team_concept') return handleRedTeamConcept(input);
  if (toolName === 'workbench.creative.cluster_ideas') return handleClusterIdeas(input);
  if (toolName === 'workbench.creative.deduplicate_ideas') return handleDeduplicateIdeas(input);
  if (toolName === 'workbench.creative.search_idea_graph') return handleSearchIdeaGraph(input);
  if (toolName === 'workbench.creative.open_idea_neighborhood') return handleOpenIdeaNeighborhood(input);
  if (toolName === 'workbench.creative.preview_creative_impact') return handlePreviewCreativeImpact(input);
  if (toolName === 'workbench.creative.find_graph_bridge_ideas') return handleFindGraphBridgeIdeas(input);
  if (toolName === 'workbench.creative.critique_idea_with_analyze') return handleCritiqueIdeaWithAnalyze(input);
  if (toolName === 'workbench.creative.remix_dead_code_into_ideas') return handleRemixDeadCodeIntoIdeas(input);
  if (toolName === 'workbench.creative.optimize_prompt_chain_insertion') return handleOptimizePromptChainInsertion(input);
  if (toolName === 'workbench.creative.turn_idea_into_plan') return handleTurnIdeaIntoPlan(input);
  if (toolName === 'workbench.creative.turn_idea_into_patch_plan') return handleTurnIdeaIntoPatchPlan(input, workspace, patchStore);
  if (toolName === 'workbench.creative.preview_idea_patch') return handlePreviewIdeaPatch(input, patchStore);
  if (toolName === 'workbench.creative.apply_idea_patch') return handleApplyIdeaPatch(input, { mutationMode, patchStore, workspace });
  if (toolName === 'workbench.creative.save_idea_session') return handleSaveIdeaSession(input, workspace);
  if (toolName === 'workbench.creative.write_idea_memory') return handleWriteIdeaMemory(input, workspace);
  return handleCreativePlaceholder(toolName, input);
}
