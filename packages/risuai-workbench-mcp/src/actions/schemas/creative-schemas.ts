/**
 * Zod input schemas for Phase 5 creative actions.
 * Colocated to keep adapter code thin.
 * @file packages/risuai-workbench-mcp/src/actions/schemas/creative-schemas.ts
 */

import { z } from 'zod';

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

export const GatherContextInputSchema = z.object({
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
}).catchall(z.unknown());

export const InspectContextInputSchema = z.object({
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
}).catchall(z.unknown());

export const SearchContextInputSchema = z.object({
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
}).catchall(z.unknown());

export const BrainstormScamperInputSchema = z.object(COMMON_IDEATION_INPUT_SCHEMA).catchall(z.unknown());
export const CreateMatrixInputSchema = z.object({ ...COMMON_IDEATION_INPUT_SCHEMA, dimensions: OPTIONAL_UNKNOWN }).catchall(z.unknown());
export const GenerateCombinationsInputSchema = z.object({ ...COMMON_IDEATION_INPUT_SCHEMA, dimensions: OPTIONAL_UNKNOWN, matrixId: OPTIONAL_STRING }).catchall(z.unknown());
export const ExtractContradictionsInputSchema = z.object({ ...COMMON_IDEATION_INPUT_SCHEMA, contradiction: OPTIONAL_STRING, contradictions: OPTIONAL_UNKNOWN }).catchall(z.unknown());
export const SuggestContradictionResolutionsInputSchema = z.object({ ...COMMON_IDEATION_INPUT_SCHEMA, contradiction: OPTIONAL_STRING, contradictionId: OPTIONAL_STRING, contradictions: OPTIONAL_UNKNOWN }).catchall(z.unknown());
export const CritiqueSixHatsInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const RankIdeasInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const ClusterIdeasInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const DeduplicateIdeasInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const SearchIdeaGraphInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const OpenIdeaNeighborhoodInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());
export const PreviewCreativeImpactInputSchema = z.object({
  ...COMMON_ADVISORY_INPUT_SCHEMA,
  deadCodeFindings: OPTIONAL_UNKNOWN,
  patchPreview: OPTIONAL_UNKNOWN,
  promptChain: OPTIONAL_UNKNOWN,
  tokenBudget: OPTIONAL_UNKNOWN,
}).catchall(z.unknown());
export const FindGraphBridgeIdeasInputSchema = z.object({
  ...COMMON_ADVISORY_INPUT_SCHEMA,
  promptChain: OPTIONAL_UNKNOWN,
  tokenBudget: OPTIONAL_UNKNOWN,
}).catchall(z.unknown());
export const CritiqueIdeaWithAnalyzeInputSchema = z.object({
  ...COMMON_ADVISORY_INPUT_SCHEMA,
  patchPreview: OPTIONAL_UNKNOWN,
  promptChain: OPTIONAL_UNKNOWN,
  tokenBudget: OPTIONAL_UNKNOWN,
}).catchall(z.unknown());
export const RemixDeadCodeIntoIdeasInputSchema = z.object({
  ...COMMON_ADVISORY_INPUT_SCHEMA,
  deadCode: OPTIONAL_UNKNOWN,
  deadCodeFindings: OPTIONAL_UNKNOWN,
}).catchall(z.unknown());
export const OptimizePromptChainInsertionInputSchema = z.object({
  ...COMMON_ADVISORY_INPUT_SCHEMA,
  patchPreview: OPTIONAL_UNKNOWN,
  promptChain: OPTIONAL_UNKNOWN,
  tokenBudget: OPTIONAL_UNKNOWN,
}).catchall(z.unknown());

export const TurnIdeaIntoPlanInputSchema = z.object({
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
}).catchall(z.unknown());

export const TurnIdeaIntoPatchPlanInputSchema = z.object({
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
}).catchall(z.unknown());

export const PreviewIdeaPatchInputSchema = z.object({
  ideaId: OPTIONAL_STRING,
  patchPlanId: OPTIONAL_STRING,
}).catchall(z.unknown());

export const RedTeamConceptInputSchema = z.object(COMMON_ADVISORY_INPUT_SCHEMA).catchall(z.unknown());

export const ApplyIdeaPatchInputSchema = z.object({
  options: z.object({ createBackup: z.boolean().optional(), postValidate: z.boolean().optional(), rollbackOnValidationError: z.boolean().optional() }).optional(),
  patchPlanId: z.string(),
  sessionId: OPTIONAL_STRING,
}).catchall(z.unknown());

export const SaveIdeaSessionInputSchema = z.object({
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
}).catchall(z.unknown());

export const WriteIdeaMemoryInputSchema = z.object({
  assumptions: OPTIONAL_STRING_ARRAY,
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
}).catchall(z.unknown());
