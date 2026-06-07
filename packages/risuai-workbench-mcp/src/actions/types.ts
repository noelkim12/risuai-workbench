/**
 * Action type definitions for the internal Workbench Action Registry.
 * @file packages/risuai-workbench-mcp/src/actions/types.ts
 */

import type { z } from 'zod';
import type { PatchPlanStore } from '../mutation/patch-store';
import type { MutationMode } from '../mutation/mode';
import type { WorkspaceRootStatus } from '../project/resolve-root';

export type ActionRisk =
  | 'read_only'
  | 'preview_mutation'
  | 'commit_mutation'
  | 'external_process';

export type ActionCapability =
  | 'inspect'
  | 'validate'
  | 'analyze'
  | 'wiki'
  | 'skills'
  | 'creative.context'
  | 'creative.ideation'
  | 'creative.review'
  | 'creative.patch'
  | 'patch.preview'
  | 'patch.apply'
  | 'mutation.direct';

export interface ActionExecutionContext {
  workspace: WorkspaceRootStatus;
  mutationMode: MutationMode;
  patchStore: PatchPlanStore;
}

export interface WorkbenchAction<TInput = unknown, TOutput = unknown> {
  id: string;
  legacyToolName?: string;
  title: string;
  summary: string;
  capability: ActionCapability;
  risk: ActionRisk;
  inputSchema: z.ZodType<TInput>;
  aliases?: readonly string[];
  searchText?: string;
  examples?: readonly unknown[];
  execute: (
    input: TInput,
    context: ActionExecutionContext,
  ) => Promise<TOutput> | TOutput;
}
