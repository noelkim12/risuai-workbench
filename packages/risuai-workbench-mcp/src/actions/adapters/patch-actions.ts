/**
 * Phase 7 patch action adapters.
 * Thin wrappers over existing patch preview and apply handlers.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/patch-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationResultEnvelope } from '../../contracts/mutation-result';

import {
  PatchApplyInputSchema,
  SuggestPatchInputSchema,
  SuggestOrderPatchInputSchema,
  SuggestFrontmatterPatchInputSchema,
  SuggestRootMarkerPatchInputSchema,
  PlanWikiUpdateInputSchema,
  DiffWikiInputSchema,
} from '../schemas/patch-schemas';

import type { SuggestPatchInput } from '../../tools/patch/suggest-patch';
import type { SuggestOrderPatchInput } from '../../tools/patch/suggest-order-patch';
import type { SuggestFrontmatterPatchInput } from '../../tools/patch/suggest-frontmatter-patch';
import type { SuggestRootMarkerPatchInput } from '../../tools/patch/suggest-root-marker-patch';
import type { PlanWikiUpdateInput } from '../../tools/wiki/wiki-patch-preview';
import type { DiffWikiInput } from '../../tools/wiki/wiki-patch-preview';

import {
  handleSuggestPatch,
  handleSuggestOrderPatch,
  handleSuggestFrontmatterPatch,
  handleSuggestRootMarkerPatch,
  handleApplyPatchPlan,
} from '../../tools/patch';

import {
  handlePlanWikiUpdate,
  handleDiffWiki,
} from '../../tools/wiki';

/**
 * registerPatchActions 함수.
 * Populates the ActionRegistry with patch preview actions (preview_mutation)
 * and the gated patch apply action (commit_mutation).
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerPatchActions(registry: ActionRegistry): void {
  // Preview actions (preview_mutation)
  registry.register({
    id: 'patch.suggest',
    legacyToolName: 'workbench.suggest_patch',
    title: 'Suggest patch',
    summary: 'Create a structured multi-operation patch plan preview.',
    capability: 'patch.preview',
    risk: 'preview_mutation',
    inputSchema: SuggestPatchInputSchema,
    execute: (input, context) => handleSuggestPatch(input as SuggestPatchInput, context.workspace, context.patchStore),
  } as WorkbenchAction<SuggestPatchInput, DiagnosticEnvelope>);

  registry.register({
    id: 'patch.suggest_order',
    legacyToolName: 'workbench.suggest_order_patch',
    title: 'Suggest order patch',
    summary: 'Create an _order.json patch preview using structured order operations.',
    capability: 'patch.preview',
    risk: 'preview_mutation',
    inputSchema: SuggestOrderPatchInputSchema,
    execute: (input, context) => handleSuggestOrderPatch(input as SuggestOrderPatchInput, context.workspace, context.patchStore),
  } as WorkbenchAction<SuggestOrderPatchInput, DiagnosticEnvelope>);

  registry.register({
    id: 'patch.suggest_frontmatter',
    legacyToolName: 'workbench.suggest_frontmatter_patch',
    title: 'Suggest frontmatter patch',
    summary: 'Create a frontmatter field patch preview while preserving body text.',
    capability: 'patch.preview',
    risk: 'preview_mutation',
    inputSchema: SuggestFrontmatterPatchInputSchema,
    execute: (input, context) => handleSuggestFrontmatterPatch(input as SuggestFrontmatterPatchInput, context.workspace, context.patchStore),
  } as WorkbenchAction<SuggestFrontmatterPatchInput, DiagnosticEnvelope>);

  registry.register({
    id: 'patch.suggest_root_marker',
    legacyToolName: 'workbench.suggest_root_marker_patch',
    title: 'Suggest root marker patch',
    summary: 'Create a root marker repair/create patch preview.',
    capability: 'patch.preview',
    risk: 'preview_mutation',
    inputSchema: SuggestRootMarkerPatchInputSchema,
    execute: (input, context) => handleSuggestRootMarkerPatch(input as SuggestRootMarkerPatchInput, context.workspace, context.patchStore),
  } as WorkbenchAction<SuggestRootMarkerPatchInput, DiagnosticEnvelope>);

  registry.register({
    id: 'patch.plan_wiki',
    legacyToolName: 'workbench.plan_wiki_update',
    title: 'Plan wiki update',
    summary: 'Preview generated wiki refresh targets and write scope.',
    capability: 'patch.preview',
    risk: 'preview_mutation',
    inputSchema: PlanWikiUpdateInputSchema,
    execute: (input, context) => handlePlanWikiUpdate(input as PlanWikiUpdateInput, context.workspace, context.patchStore),
  } as WorkbenchAction<PlanWikiUpdateInput, DiagnosticEnvelope>);

  registry.register({
    id: 'patch.diff_wiki',
    legacyToolName: 'workbench.diff_wiki',
    title: 'Diff wiki',
    summary: 'Summarize generated wiki differences without writing files.',
    capability: 'patch.preview',
    risk: 'read_only',
    inputSchema: DiffWikiInputSchema,
    execute: (input, context) => handleDiffWiki(input as DiffWikiInput, context.workspace),
  } as WorkbenchAction<DiffWikiInput, DiagnosticEnvelope>);

  // Apply action (commit_mutation — blocked by run_action)
  registry.register({
    id: 'patch.apply',
    legacyToolName: 'workbench.apply_patch_plan',
    title: 'Apply patch plan',
    summary: 'Apply a stored patch plan.',
    capability: 'patch.apply',
    risk: 'commit_mutation',
    inputSchema: PatchApplyInputSchema,
    execute: (input, context) => handleApplyPatchPlan(input as unknown, {
      mutationMode: context.mutationMode,
      patchStore: context.patchStore,
      workspace: context.workspace,
    }),
  } as WorkbenchAction<unknown, DiagnosticEnvelope | MutationResultEnvelope>);
}
