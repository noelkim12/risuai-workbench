/**
 * MCP server construction and startup helpers for RisuAI Workbench.
 * @file packages/risuai-workbench-mcp/src/server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import packageJson from '../package.json';
import type { PatchOperation } from './contracts/patch-plan';
import { createDiagnosticEnvelope } from './contracts/diagnostics';
import { createJsonToolResult } from './contracts/mcp-result';
import {
  diagnosticEnvelopeOutputSchema,
  workbenchJsonOutputSchema,
} from './contracts/output-schemas';
import { intentRouteInputSchema } from './contracts/intent-route';
import { createProgressReporter, getProgressToken } from './progress';
import { getWorkbenchTool } from './registry';
import { annotationsForTool } from './registry/tool-annotations';

import { DEFAULT_MUTATION_MODE, type MutationMode } from './mutation/mode';
import { createPatchPlanStore, type PatchPlanStore } from './mutation/patch-store';
import { registerWorkbenchPrompts } from './prompts';
import { resolveWorkspaceRoot, type WorkspaceRootStatus } from './project/resolve-root';
import { registerWorkbenchResources } from './resources';

import {
  // intent-route
  handleRouteIntent,
  // inspect
  handleInspectArtifact,
  handleInspectPath,
  // validate
  handleValidateArtifact,
  handleValidateFrontmatter,
  handleValidateMetadata,
  handleValidateOrder,
  handleValidatePath,
  handleValidateRootMarkers,
  handleBuildPath,
  handleSuggestTests,
  // patch
  handleApplyPatchPlan,
  handleSuggestFrontmatterPatch,
  handleSuggestOrderPatch,
  handleSuggestPatch,
  handleSuggestRootMarkerPatch,
  type OrderPatchOperationInput,
  // mutation
  handleCreateArtifact,
  handleDeleteArtifact,
  handleEditFrontmatter,
  handleEditMetadata,
  handleEditOrder,
  handleMoveArtifact,
  handleRollbackMutation,
  handleRunExtract,
  handleRunScaffold,
  // analyze
  handleExplainContextFeedbackLoop,
  handleExplainLorebookPromptInjection,
  handleExplainRisuLuaRuntimeApi,
  handleExplainRisuLuaWorkspace,
  handleGuideRisuLuaModule,
  handlePlanStructuredOutputLoop,
  handleQueryButtonActions,
  handleQueryCompositionConflicts,
  handleQueryDeadCodeFindings,
  handleQueryLuaAnalysis,
  handleQueryLuaCallGraph,
  handleQueryLuaStateAccess,
  handleQueryPromptChain,
  handleQueryRelationshipNetwork,
  handleQueryTokenBudget,
  handleQueryVariable,
  handleQueryVariableFlow,
  handleRefreshAnalyzeSnapshot,
  // wiki
  handleDiffWiki,
  handlePlanWikiUpdate,
  handleRefreshWiki,
  handleSearchWiki,
  // creative
  registerCreativeTools,
} from './tools';

export { resolveWorkspaceRoot, type WorkspaceRootStatus } from './project/resolve-root';

export interface StartupOptions {
  mutationMode?: MutationMode;
  root?: string;
}

export interface StartupContext {
  mutationMode: MutationMode;
  workspace: WorkspaceRootStatus;
}

/**
 * createStartupContext 함수.
 * 현재 Task 1에서 필요한 read-only startup context를 구성함.
 *
 * @param options - CLI startup 옵션
 * @returns 검증된 workspace 상태와 기본 mutation mode
 */
export async function createStartupContext(options: StartupOptions = {}): Promise<StartupContext> {
  return {
    mutationMode: options.mutationMode ?? DEFAULT_MUTATION_MODE,
    workspace: await resolveWorkspaceRoot(options.root),
  };
}

/**
 * createMcpServer 함수.
 * registry/smoke surface와 Phase 1 inspect/validate tools를 등록한 MCP server 인스턴스를 만듦.
 *
 * @param startupContext - startup에서 계산한 workspace root와 mutation mode
 * @returns official SDK 기반 MCP server 인스턴스
 */
export function createMcpServer(startupContext: StartupContext): McpServer {
  const server = new McpServer(
    {
      name: packageJson.name,
      version: packageJson.version,
    },
    {
      capabilities: {
        prompts: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        tools: { listChanged: false },
      },
    },
  );
  const smokeTool = getWorkbenchTool('workbench.smoke');
  const patchStore = createPatchPlanStore();

  server.registerTool(
    'workbench.smoke',
    {
      annotations: annotationsForTool('workbench.smoke'),
      description: smokeTool?.description ?? 'Return a minimal risuai-workbench-mcp startup smoke response.',
      inputSchema: {},
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: smokeTool?.title ?? 'RisuAI Workbench MCP smoke check',
    },
    async () => createJsonToolResult(createDiagnosticEnvelope({
      data: {
        mutationMode: startupContext.mutationMode,
        packageName: packageJson.name,
        version: packageJson.version,
        workspace: startupContext.workspace.ok
          ? { ok: true, path: startupContext.workspace.path }
          : { ok: false, path: startupContext.workspace.path, reason: startupContext.workspace.reason },
      },
      diagnostics: [],
      status: 'ok',
      tool: 'workbench.smoke',
    })),
  );

  registerIntentRouteTools(server);
  registerInspectValidateTools(server, startupContext.workspace);
  registerPatchPreviewTools(server, startupContext.workspace, patchStore);
  registerPatchApplyTools(server, startupContext, patchStore);
  registerDirectMutationTools(server, startupContext, patchStore);
  registerCoreWorkflowTools(server, startupContext);
  registerAnalyzeQueryTools(server, startupContext.workspace);
  registerAdvancedMutationTools(server, startupContext);
  registerWorkbenchResources(server, startupContext.workspace, patchStore);
  registerWorkbenchPrompts(server);
  registerCreativeTools(server, startupContext.workspace, patchStore, startupContext.mutationMode);

  return server;
}

/**
 * registerAnalyzeQueryTools 함수.
 * Phase 4 read-only analyze / impact query tools를 MCP server에 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param workspace - startup에서 계산한 workspace root 상태
 */
function registerAnalyzeQueryTools(server: McpServer, workspace: WorkspaceRootStatus): void {
  const previousSnapshotSchema = z.object({ snapshotId: z.string().optional(), sourceHash: z.string().optional() }).optional();
  const snapshotFields = {
    previousSnapshot: previousSnapshotSchema,
    sourcePath: z.string().optional(),
    sourceText: z.string().optional(),
    stalePolicy: z.enum(['mark', 'refuse']).optional(),
  };
  const elementSchema = z.object({
    elementName: z.string(),
    elementType: z.string(),
    executionOrder: z.number().optional(),
    reads: z.array(z.string()).optional(),
    writes: z.array(z.string()).optional(),
  });
  const luaInputSchema = {
    ...snapshotFields,
    charxData: z.record(z.string(), z.unknown()).nullable().optional(),
    filePath: z.string().optional(),
  };
  const lorebookEntrySchema = z.object({
    constant: z.boolean(),
    enabled: z.boolean(),
    insertionOrder: z.number(),
    keywords: z.array(z.string()),
    name: z.string(),
    secondaryKeys: z.array(z.string()).optional(),
    selective: z.boolean(),
  });
  const regexScriptSchema = z.object({ in: z.string(), name: z.string(), out: z.string() });

  server.registerTool(
    'workbench.refresh_analyze_snapshot',
    {
      annotations: annotationsForTool('workbench.refresh_analyze_snapshot'),
      description: 'Refresh analyze snapshot metadata without mutating source artifacts.',
      inputSchema: snapshotFields,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Refresh analyze snapshot',
    },
    async (input: Parameters<typeof handleRefreshAnalyzeSnapshot>[0]) => {
      const result = await handleRefreshAnalyzeSnapshot(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_variable_flow',
    {
      description: 'Query variable read/write flow and diagnostics with snapshot metadata.',
      inputSchema: { ...snapshotFields, defaultVariables: z.record(z.string(), z.string()).optional(), elements: z.array(elementSchema).optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query variable flow',
    },
    async (input: Parameters<typeof handleQueryVariableFlow>[0]) => {
      const result = await handleQueryVariableFlow(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_variable',
    {
      description: 'Query one variable and its readers, writers, events, and diagnostics.',
      inputSchema: { ...snapshotFields, defaultVariables: z.record(z.string(), z.string()).optional(), elements: z.array(elementSchema).optional(), variableName: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query variable',
    },
    async (input: Parameters<typeof handleQueryVariable>[0]) => {
      const result = await handleQueryVariable(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_lua_analysis',
    {
      description: 'Query normalized Lua analysis artifact JSON view.',
      inputSchema: luaInputSchema,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query Lua analysis',
    },
    async (input: Parameters<typeof handleQueryLuaAnalysis>[0]) => {
      const result = await handleQueryLuaAnalysis(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_lua_call_graph',
    {
      description: 'Query Lua handler/function call graph data.',
      inputSchema: luaInputSchema,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query Lua call graph',
    },
    async (input: Parameters<typeof handleQueryLuaCallGraph>[0]) => {
      const result = await handleQueryLuaCallGraph(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_lua_state_access',
    {
      description: 'Query Lua state/chat variable read and write occurrences.',
      inputSchema: luaInputSchema,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query Lua state access',
    },
    async (input: Parameters<typeof handleQueryLuaStateAccess>[0]) => {
      const result = await handleQueryLuaStateAccess(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_button_actions',
    {
      description: 'Query button action declarations and usage from Lua handlers.',
      inputSchema: luaInputSchema,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query button actions',
    },
    async (input: Parameters<typeof handleQueryButtonActions>[0]) => {
      const result = await handleQueryButtonActions(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_relationship_network',
    {
      description: 'Query normalized relationship graph nodes and edges.',
      inputSchema: { ...snapshotFields, elements: z.array(elementSchema).optional(), luaSources: z.array(z.object(luaInputSchema)).optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query relationship network',
    },
    async (input: Parameters<typeof handleQueryRelationshipNetwork>[0]) => {
      const result = await handleQueryRelationshipNetwork(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_prompt_chain',
    {
      description: 'Query prompt chain dependencies and issues.',
      inputSchema: { ...snapshotFields, templates: z.array(z.object({ name: z.string(), text: z.string(), type: z.string() })) },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query prompt chain',
    },
    async (input: Parameters<typeof handleQueryPromptChain>[0]) => {
      const result = await handleQueryPromptChain(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_composition_conflicts',
    {
      description: 'Query artifact composition conflicts and compatibility score.',
      inputSchema: {
        ...snapshotFields,
        charx: z.any().optional(),
        modules: z.array(z.any()).optional(),
        preset: z.any().optional(),
      },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query composition conflicts',
    },
    async (input: Parameters<typeof handleQueryCompositionConflicts>[0]) => {
      const result = await handleQueryCompositionConflicts(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_dead_code_findings',
    {
      description: 'Query cleanup candidates from variable-flow, lorebook, and regex metadata.',
      inputSchema: {
        ...snapshotFields,
        defaultVariables: z.record(z.string(), z.string()).optional(),
        elements: z.array(elementSchema).optional(),
        lorebookEntries: z.array(lorebookEntrySchema).optional(),
        regexScripts: z.array(regexScriptSchema).optional(),
      },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query dead code findings',
    },
    async (input: Parameters<typeof handleQueryDeadCodeFindings>[0]) => {
      const result = await handleQueryDeadCodeFindings(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.query_token_budget',
    {
      description: 'Query token budget summaries and threshold warnings.',
      inputSchema: { ...snapshotFields, components: z.array(z.object({ alwaysActive: z.boolean(), category: z.string(), name: z.string(), text: z.string() })) },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Query token budget',
    },
    async (input: Parameters<typeof handleQueryTokenBudget>[0]) => {
      const result = await handleQueryTokenBudget(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.explain_risulua_workspace',
    {
      description: 'Explain source-first split RisuLua workspace authoring and generated dist boundaries.',
      inputSchema: { targetName: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Explain RisuLua workspace',
    },
    async (input: Parameters<typeof handleExplainRisuLuaWorkspace>[0]) => {
      const result = await handleExplainRisuLuaWorkspace(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.guide_risulua_module',
    {
      description: 'Guide source module authoring with allowed static require and dist runtime boundaries.',
      inputSchema: { moduleId: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Guide RisuLua module',
    },
    async (input: Parameters<typeof handleGuideRisuLuaModule>[0]) => {
      const result = await handleGuideRisuLuaModule(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.explain_risulua_runtime_api',
    {
      description: 'Explain RisuAI Lua lifecycle hooks, id threading, async bridge, access tiers, and API categories.',
      inputSchema: { focus: z.enum(['lifecycle', 'state', 'button', 'async', 'lorebook']).optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Explain RisuLua runtime API',
    },
    async (input: Parameters<typeof handleExplainRisuLuaRuntimeApi>[0]) => {
      const result = await handleExplainRisuLuaRuntimeApi(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.explain_lorebook_prompt_injection',
    {
      description: 'Explain Lorebook as runtime prompt injection and context activation, including decorator effects.',
      inputSchema: { includeDecorators: z.boolean().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Explain Lorebook prompt injection',
    },
    async (input: Parameters<typeof handleExplainLorebookPromptInjection>[0]) => {
      const result = await handleExplainLorebookPromptInjection(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.explain_context_feedback_loop',
    {
      description: 'Explain the Lorebook, Structured Output, Regex, Button, RisuLua, Variable/Lorebook feedback loop.',
      inputSchema: { variableName: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Explain context feedback loop',
    },
    async (input: Parameters<typeof handleExplainContextFeedbackLoop>[0]) => {
      const result = await handleExplainContextFeedbackLoop(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.plan_structured_output_loop',
    {
      description: 'Plan a structured output, regex, button, RisuLua state, Lorebook feedback loop.',
      inputSchema: { buttonLabel: z.string().optional(), buttonTrigger: z.string().optional(), variableName: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Plan structured output loop',
    },
    async (input: Parameters<typeof handlePlanStructuredOutputLoop>[0]) => {
      const result = await handlePlanStructuredOutputLoop(input);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerAdvancedMutationTools 함수.
 * Phase 5 advanced mutation tools를 high-risk safety gate 뒤에 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param startupContext - workspace와 mutation mode startup context
 */
function registerAdvancedMutationTools(server: McpServer, startupContext: StartupContext): void {
  const confirmationSchema = z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }).optional();

  server.registerTool(
    'workbench.move_artifact',
    {
      annotations: annotationsForTool('workbench.move_artifact'),
      description: 'Move or rename an artifact while preserving suffix and optional order ownership.',
      inputSchema: { confirmation: confirmationSchema, expectedHash: z.string().optional(), from: z.string(), mode: z.enum(['preview', 'commit']), postValidate: z.boolean().optional(), toStem: z.string(), updateOrder: z.boolean().optional() },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Move artifact',
    },
    async (input: unknown) => {
      const result = await handleMoveArtifact(input, startupContext.workspace, startupContext.mutationMode);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.delete_artifact',
    {
      description: 'Delete an artifact only after exact high-risk confirmation.',
      inputSchema: { confirmation: confirmationSchema, createBackup: z.boolean().optional(), expectedHash: z.string().optional(), mode: z.enum(['preview', 'commit']), path: z.string(), postValidate: z.boolean().optional(), updateOrder: z.boolean().optional() },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Delete artifact',
    },
    async (input: unknown) => {
      const result = await handleDeleteArtifact(input, startupContext.workspace, startupContext.mutationMode);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.refresh_wiki',
    {
      description: 'Refresh proposal-approved generated wiki files only.',
      inputSchema: { confirmation: confirmationSchema, generatedFiles: z.array(z.object({ content: z.string(), path: z.string() })).optional(), mode: z.enum(['preview', 'commit']), postValidate: z.boolean().optional(), target: z.string().optional(), wikiRoot: z.string().optional() },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Refresh wiki',
    },
    async (input: unknown) => {
      const result = await handleRefreshWiki(input, startupContext.workspace, startupContext.mutationMode);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.rollback_mutation',
    {
      description: 'Rollback a journaled mutation only when inverse state is sufficient.',
      inputSchema: { confirmation: confirmationSchema, mode: z.enum(['preview', 'commit']), mutationId: z.string() },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Rollback mutation',
    },
    async (input: unknown) => {
      const result = await handleRollbackMutation(input, startupContext.workspace, startupContext.mutationMode);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerCoreWorkflowTools 함수.
 * core CLI extract/scaffold workflow를 gated mutation tool로 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param startupContext - workspace와 mutation mode startup context
 */
function registerCoreWorkflowTools(server: McpServer, startupContext: StartupContext): void {
  const confirmationSchema = z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }).optional();
  const risuluaFields = {
    risuluaDomainGeneration: z.enum(['report', 'validated']).optional(),
    risuluaMode: z.enum(['classic', 'modular']).optional(),
    risuluaRecovery: z.enum(['none', 'full-source']).optional(),
    risuluaSplit: z.enum(['none', 'report', 'coarse', 'module-table']).optional(),
  };

  server.registerTool(
    'workbench.run_extract',
    {
      annotations: annotationsForTool('workbench.run_extract'),
      description: 'Run risu-core extract workflow for character, module, or preset files through mutation safety gates.',
      inputSchema: { confirmation: confirmationSchema, mode: z.enum(['preview', 'commit']), outDir: z.string(), postValidate: z.boolean().optional(), sourcePath: z.string(), type: z.enum(['character', 'module', 'preset']).optional(), ...risuluaFields },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Run extract workflow',
    },
    async (input: unknown, extra) => {
      const progress = createProgressReporter({
        sendNotification: extra.sendNotification,
        token: getProgressToken(extra),
      });
      const result = await handleRunExtract(input, startupContext.workspace, startupContext.mutationMode, progress, extra.signal);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.run_scaffold',
    {
      description: 'Run risu-core scaffold workflow to generate a new charx, module, or preset workspace.',
      inputSchema: { confirmation: confirmationSchema, creator: z.string().optional(), mode: z.enum(['preview', 'commit']), name: z.string(), namespace: z.string().optional(), outDir: z.string().optional(), postValidate: z.boolean().optional(), risuluaMode: z.enum(['classic', 'modular']).optional(), type: z.enum(['charx', 'module', 'preset']) },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Run scaffold workflow',
    },
    async (input: unknown, extra) => {
      const progress = createProgressReporter({
        sendNotification: extra.sendNotification,
        token: getProgressToken(extra),
      });
      const result = await handleRunScaffold(input, startupContext.workspace, startupContext.mutationMode, progress, extra.signal);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerPatchPreviewTools 함수.
 * Phase 2 preview/patch plan tools를 no-write handler로 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param workspace - startup에서 계산한 workspace root 상태
 */
function registerPatchPreviewTools(server: McpServer, workspace: WorkspaceRootStatus, patchStore = createPatchPlanStore()): void {
  server.registerTool(
    'workbench.suggest_patch',
    {
      description: 'Create a structured multi-operation patch plan preview.',
      inputSchema: { intent: z.string(), operations: z.array(z.any()) },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Suggest patch',
    },
    async (input: { intent: string; operations: readonly PatchOperation[] }) => {
      const result = await handleSuggestPatch(input, workspace, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.suggest_order_patch',
    {
      description: 'Create an _order.json patch preview using structured order operations.',
      inputSchema: {
        directory: z.string(),
        intent: z.string().optional(),
        operations: z.array(z.union([
          z.object({ entry: z.string(), index: z.number().int().nonnegative().optional(), kind: z.literal('insert') }),
          z.object({ entry: z.string(), kind: z.literal('move'), toIndex: z.number().int().nonnegative() }),
          z.object({ entry: z.string(), kind: z.literal('remove') }),
        ])),
      },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Suggest order patch',
    },
    async (input: { directory: string; intent?: string; operations: readonly OrderPatchOperationInput[] }) => {
      const result = await handleSuggestOrderPatch(input, workspace, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.suggest_frontmatter_patch',
    {
      description: 'Create a frontmatter field patch preview while preserving body text.',
      inputSchema: {
        intent: z.string().optional(),
        path: z.string(),
        preserveBody: z.boolean().optional(),
        remove: z.array(z.string()).optional(),
        set: z.record(z.string(), z.string()).optional(),
      },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Suggest frontmatter patch',
    },
    async (input: { intent?: string; path: string; preserveBody?: boolean; remove?: readonly string[]; set?: Record<string, string> }) => {
      const result = await handleSuggestFrontmatterPatch(input, workspace, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.suggest_root_marker_patch',
    {
      description: 'Create a root marker repair/create patch preview.',
      inputSchema: { content: z.string().optional(), intent: z.string().optional(), markerPath: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Suggest root marker patch',
    },
    async (input: { content?: string; intent?: string; markerPath: string }) => {
      const result = await handleSuggestRootMarkerPatch(input, workspace, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.plan_wiki_update',
    {
      description: 'Preview generated wiki refresh targets and write scope.',
      inputSchema: { artifactKey: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Plan wiki update',
    },
    async (input: { artifactKey?: string }) => {
      const result = await handlePlanWikiUpdate(input, workspace, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.diff_wiki',
    {
      description: 'Summarize generated wiki differences without writing files.',
      inputSchema: { paths: z.array(z.string()).optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Diff wiki',
    },
    async (input: { paths?: readonly string[] }) => {
      const result = await handleDiffWiki(input, workspace);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerPatchApplyTools 함수.
 * Phase 3 apply_patch_plan mutation tool을 MCP server에 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param startupContext - workspace와 mutation mode startup context
 * @param patchStore - preview/apply가 공유하는 patch plan store
 */
function registerPatchApplyTools(server: McpServer, startupContext: StartupContext, patchStore = createPatchPlanStore()): void {
  server.registerTool(
    'workbench.apply_patch_plan',
    {
      annotations: annotationsForTool('workbench.apply_patch_plan'),
      description: 'Apply a stored patch plan after confirmation and precondition checks.',
      inputSchema: {
        confirmation: z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }),
        options: z.object({ createBackup: z.boolean().optional(), postValidate: z.boolean().optional(), rollbackOnValidationError: z.boolean().optional() }).optional(),
        patchPlanId: z.string(),
      },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Apply patch plan',
    },
    async (input: unknown) => {
      const result = await handleApplyPatchPlan(input, { mutationMode: startupContext.mutationMode, patchStore, workspace: startupContext.workspace });
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerIntentRouteTools 함수.
 * Phase 1 read-only intent route tool을 MCP server에 등록함.
 *
 * @param server - MCP server 인스턴스
 */
function registerIntentRouteTools(server: McpServer): void {
  const routeTool = getWorkbenchTool('workbench.route_intent');

  server.registerTool(
    'workbench.route_intent',
    {
      annotations: annotationsForTool('workbench.route_intent'),
      description: routeTool?.description ?? 'Classify caller intent into a deterministic route with allowed tools, risk, and next step.',
      inputSchema: intentRouteInputSchema,
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: routeTool?.title ?? 'Route intent',
    },
    async (input: Parameters<typeof handleRouteIntent>[0]) => {
      const result = await handleRouteIntent(input);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerInspectValidateTools 함수.
 * Phase 1 inspect/validate tools를 MCP server에 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param workspace - startup에서 계산한 workspace root 상태
 */
function registerInspectValidateTools(server: McpServer, workspace: WorkspaceRootStatus): void {
  server.registerTool(
    'workbench.inspect_path',
    {
      annotations: annotationsForTool('workbench.inspect_path'),
      description: 'Describe the role and artifact ownership of a workspace path.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Inspect path',
    },
    async (input: { path: string }) => {
      const result = await handleInspectPath(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.inspect_artifact',
    {
      description: 'Summarize artifact root contracts, marker files, and related docs.',
      inputSchema: { artifactRoot: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Inspect artifact',
    },
    async (input: { artifactRoot: string }) => {
      const result = await handleInspectArtifact(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_artifact',
    {
      description: 'Validate full artifact root structure.',
      inputSchema: { artifactRoot: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate artifact',
    },
    async (input: { artifactRoot: string }) => {
      const result = await handleValidateArtifact(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_order',
    {
      description: 'Validate _order.json entries against canonical files.',
      inputSchema: { directory: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate order',
    },
    async (input: { directory: string }) => {
      const result = await handleValidateOrder(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_root_markers',
    {
      description: 'Validate .risuchar/.risumodule conflicts and schema.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate root markers',
    },
    async (input: { path: string }) => {
      const result = await handleValidateRootMarkers(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_metadata',
    {
      description: 'Validate structured metadata owner and legacy/deferred surface.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate metadata',
    },
    async (input: { path: string }) => {
      const result = await handleValidateMetadata(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_frontmatter',
    {
      description: 'Validate frontmatter delimiter, field schema, and round-trip risk.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate frontmatter',
    },
    async (input: { path: string }) => {
      const result = await handleValidateFrontmatter(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.validate_path',
    {
      description: 'Validate canonical directory, suffix, and stem policy.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Validate path',
    },
    async (input: { path: string }) => {
      const result = await handleValidatePath(input, workspace);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.build_path',
    {
      description: 'Build canonical relative path from target/artifact/stem components.',
      inputSchema: { target: z.string(), artifact: z.string(), targetName: z.string().optional(), stem: z.string().optional() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Build path',
    },
    async (input: { target: string; artifact: string; targetName?: string; stem?: string }) => {
      const result = await handleBuildPath(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.search_wiki',
    {
      description: 'Search docs, wiki, and rule resources.',
      inputSchema: { query: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Search wiki',
    },
    async (input: { query: string }) => {
      const result = await handleSearchWiki(input);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.suggest_tests',
    {
      description: 'Suggest focused tests for a planned path change.',
      inputSchema: { path: z.string() },
      outputSchema: diagnosticEnvelopeOutputSchema,
      title: 'Suggest tests',
    },
    async (input: { path: string }) => {
      const result = await handleSuggestTests(input);
      return createJsonToolResult(result);
    },
  );
}

/**
 * registerDirectMutationTools 함수.
 * Phase 3 direct structured mutation tools를 MCP server에 등록함.
 *
 * @param server - MCP server 인스턴스
 * @param startupContext - workspace와 mutation mode startup context
 * @param patchStore - preview/apply가 공유하는 patch plan store
 */
function registerDirectMutationTools(server: McpServer, startupContext: StartupContext, patchStore: PatchPlanStore): void {
  const confirmationSchema = z.object({ accepted: z.boolean(), confirmationText: z.string().optional() }).optional();

  server.registerTool(
    'workbench.edit_order',
    {
      annotations: annotationsForTool('workbench.edit_order'),
      description: 'Edit _order.json through structured insert/move/remove operations.',
      inputSchema: {
        confirmation: confirmationSchema,
        expectedHash: z.string().optional(),
        mode: z.enum(['preview', 'commit']),
        operations: z.array(z.union([
          z.object({ entry: z.string(), index: z.number().int().nonnegative().optional(), kind: z.literal('insert') }),
          z.object({ entry: z.string(), kind: z.literal('move'), toIndex: z.number().int().nonnegative() }),
          z.object({ entry: z.string(), kind: z.literal('remove') }),
        ])),
        orderPath: z.string(),
        postValidate: z.boolean().optional(),
      },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Edit order',
    },
    async (input: unknown) => {
      const result = await handleEditOrder(input, startupContext.workspace, startupContext.mutationMode, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.edit_frontmatter',
    {
      description: 'Edit frontmatter fields while preserving artifact body text.',
      inputSchema: {
        confirmation: confirmationSchema,
        expectedHash: z.string().optional(),
        force: z.boolean().optional(),
        mode: z.enum(['preview', 'commit']),
        operations: z.array(z.union([
          z.object({ key: z.string(), kind: z.literal('set'), value: z.string() }),
          z.object({ key: z.string(), kind: z.literal('remove') }),
        ])),
        path: z.string(),
        postValidate: z.boolean().optional(),
        preserveBody: z.boolean().optional(),
      },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Edit frontmatter',
    },
    async (input: unknown) => {
      const result = await handleEditFrontmatter(input, startupContext.workspace, startupContext.mutationMode, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.edit_metadata',
    {
      description: 'Edit root marker or metadata JSON through structured json.set operations.',
      inputSchema: {
        allowedFields: z.array(z.string()).optional(),
        confirmation: confirmationSchema,
        expectedHash: z.string().optional(),
        mode: z.enum(['preview', 'commit']),
        operations: z.array(z.object({ jsonPointer: z.string(), kind: z.literal('json.set'), value: z.any() })),
        path: z.string(),
        postValidate: z.boolean().optional(),
      },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Edit metadata',
    },
    async (input: unknown) => {
      const result = await handleEditMetadata(input, startupContext.workspace, startupContext.mutationMode, patchStore);
      return createJsonToolResult(result);
    },
  );

  server.registerTool(
    'workbench.create_artifact',
    {
      description: 'Create a new artifact at a canonical path with optional order insertion.',
      inputSchema: {
        artifact: z.string(),
        body: z.string().optional(),
        confirmation: confirmationSchema,
        initialFrontmatter: z.record(z.string(), z.string()).optional(),
        mode: z.enum(['preview', 'commit']),
        order: z.object({ index: z.number().int().nonnegative().optional(), insert: z.boolean() }).optional(),
        root: z.string(),
        stem: z.string(),
        target: z.string(),
      },
      outputSchema: workbenchJsonOutputSchema,
      title: 'Create artifact',
    },
    async (input: unknown) => {
      const result = await handleCreateArtifact(input, startupContext.workspace, startupContext.mutationMode, patchStore);
      return createJsonToolResult(result);
    },
  );
}
