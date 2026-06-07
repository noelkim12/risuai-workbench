/**
 * Phase 4 analyze action adapters.
 * Thin wrappers over existing handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/analyze-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';

import {
  RefreshAnalyzeSnapshotInputSchema,
  QueryVariableFlowInputSchema,
  QueryVariableInputSchema,
  QueryLuaAnalysisInputSchema,
  QueryLuaCallGraphInputSchema,
  QueryLuaStateAccessInputSchema,
  QueryButtonActionsInputSchema,
  QueryRelationshipNetworkInputSchema,
  QueryPromptChainInputSchema,
  QueryCompositionConflictsInputSchema,
  QueryDeadCodeFindingsInputSchema,
  QueryTokenBudgetInputSchema,
  QueryCbsUsageInputSchema,
  QueryRisuLuaApiInputSchema,
} from '../schemas/analyze-schemas';

import type {
  QueryVariableFlowInput,
  QueryVariableInput,
  QueryLuaInput,
  QueryRelationshipNetworkInput,
  QueryPromptChainInput,
  QueryCompositionConflictsInput,
  QueryDeadCodeFindingsInput,
  QueryTokenBudgetInput,
} from '../../tools/analyze/query-analyze';

import type { QueryCbsUsageInput } from '../../tools/analyze/query-cbs-usage';
import type { QueryRisuLuaApiInput } from '../../tools/analyze/query-risulua-api';
import type { AnalyzeSnapshotInput } from '../../analyze/snapshot';

import {
  handleRefreshAnalyzeSnapshot,
  handleQueryVariableFlow,
  handleQueryVariable,
  handleQueryLuaAnalysis,
  handleQueryLuaCallGraph,
  handleQueryLuaStateAccess,
  handleQueryButtonActions,
  handleQueryRelationshipNetwork,
  handleQueryPromptChain,
  handleQueryCompositionConflicts,
  handleQueryDeadCodeFindings,
  handleQueryTokenBudget,
  handleQueryCbsUsage,
  handleQueryRisuLuaApi,
} from '../../tools/analyze';

/**
 * registerAnalyzeActions 함수.
 * Populates the ActionRegistry with read-only analyze actions.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerAnalyzeActions(registry: ActionRegistry): void {
  registry.register({
    id: 'analyze.refresh_snapshot',
    legacyToolName: 'workbench.refresh_analyze_snapshot',
    title: 'Refresh analyze snapshot',
    summary: 'Refresh analyze snapshot metadata without mutating source artifacts.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: RefreshAnalyzeSnapshotInputSchema,
    execute: (input, context) => handleRefreshAnalyzeSnapshot(input, context.workspace),
  } as WorkbenchAction<AnalyzeSnapshotInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_variable_flow',
    legacyToolName: 'workbench.query_variable_flow',
    title: 'Query variable flow',
    summary: 'Query variable read/write flow and diagnostics with snapshot metadata.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryVariableFlowInputSchema,
    execute: (input, context) => handleQueryVariableFlow(input, context.workspace),
  } as WorkbenchAction<QueryVariableFlowInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_variable',
    legacyToolName: 'workbench.query_variable',
    title: 'Query variable',
    summary: 'Query one variable and its readers, writers, events, and diagnostics.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryVariableInputSchema,
    execute: (input, context) => handleQueryVariable(input, context.workspace),
  } as WorkbenchAction<QueryVariableInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_lua_analysis',
    legacyToolName: 'workbench.query_lua_analysis',
    title: 'Query Lua analysis',
    summary: 'Query normalized Lua analysis artifact JSON view.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryLuaAnalysisInputSchema,
    execute: (input, context) => handleQueryLuaAnalysis(input, context.workspace),
  } as WorkbenchAction<QueryLuaInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_lua_call_graph',
    legacyToolName: 'workbench.query_lua_call_graph',
    title: 'Query Lua call graph',
    summary: 'Query Lua handler/function call graph data.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryLuaCallGraphInputSchema,
    execute: (input, context) => handleQueryLuaCallGraph(input, context.workspace),
  } as WorkbenchAction<QueryLuaInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_lua_state_access',
    legacyToolName: 'workbench.query_lua_state_access',
    title: 'Query Lua state access',
    summary: 'Query Lua state/chat variable read and write occurrences.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryLuaStateAccessInputSchema,
    execute: (input, context) => handleQueryLuaStateAccess(input, context.workspace),
  } as WorkbenchAction<QueryLuaInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_button_actions',
    legacyToolName: 'workbench.query_button_actions',
    title: 'Query button actions',
    summary: 'Query button action declarations and usage from Lua handlers.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryButtonActionsInputSchema,
    execute: (input, context) => handleQueryButtonActions(input, context.workspace),
  } as WorkbenchAction<QueryLuaInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_relationship_network',
    legacyToolName: 'workbench.query_relationship_network',
    title: 'Query relationship network',
    summary: 'Query normalized relationship graph nodes and edges.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryRelationshipNetworkInputSchema,
    execute: (input, context) => handleQueryRelationshipNetwork(input, context.workspace),
  } as WorkbenchAction<QueryRelationshipNetworkInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_prompt_chain',
    legacyToolName: 'workbench.query_prompt_chain',
    title: 'Query prompt chain',
    summary: 'Query prompt chain dependencies and issues.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryPromptChainInputSchema,
    execute: (input, context) => handleQueryPromptChain(input, context.workspace),
  } as WorkbenchAction<QueryPromptChainInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_composition_conflicts',
    legacyToolName: 'workbench.query_composition_conflicts',
    title: 'Query composition conflicts',
    summary: 'Query artifact composition conflicts and compatibility score.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryCompositionConflictsInputSchema,
    execute: (input, context) => handleQueryCompositionConflicts(input, context.workspace),
  } as WorkbenchAction<QueryCompositionConflictsInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_dead_code_findings',
    legacyToolName: 'workbench.query_dead_code_findings',
    title: 'Query dead code findings',
    summary: 'Query cleanup candidates from variable-flow, lorebook, and regex metadata.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryDeadCodeFindingsInputSchema,
    execute: (input, context) => handleQueryDeadCodeFindings(input, context.workspace),
  } as WorkbenchAction<QueryDeadCodeFindingsInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_token_budget',
    legacyToolName: 'workbench.query_token_budget',
    title: 'Query token budget',
    summary: 'Query token budget summaries and threshold warnings.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryTokenBudgetInputSchema,
    execute: (input, context) => handleQueryTokenBudget(input, context.workspace),
  } as WorkbenchAction<QueryTokenBudgetInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_cbs_usage',
    legacyToolName: 'workbench.query_cbs_usage',
    title: 'Query CBS usage',
    summary: 'Query CBS tag usage, bracket balance, and reference statistics from source text.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryCbsUsageInputSchema,
    execute: (input) => handleQueryCbsUsage(input),
  } as WorkbenchAction<QueryCbsUsageInput, DiagnosticEnvelope>);

  registry.register({
    id: 'analyze.query_risulua_api',
    legacyToolName: 'workbench.query_risulua_api',
    title: 'Query RisuLua API',
    summary: 'Query one RisuAI Lua host function/global with access tier, category, signature, examples, and reference URIs.',
    capability: 'analyze',
    risk: 'read_only',
    inputSchema: QueryRisuLuaApiInputSchema,
    execute: (input) => handleQueryRisuLuaApi(input),
  } as WorkbenchAction<QueryRisuLuaApiInput, DiagnosticEnvelope>);
}
