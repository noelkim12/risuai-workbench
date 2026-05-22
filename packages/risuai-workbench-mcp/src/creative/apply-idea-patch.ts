/**
 * Creative apply_idea_patch adapter for stored PatchPlans.
 * @file packages/risuai-workbench-mcp/src/creative/apply-idea-patch.ts
 */

import { realpath } from 'node:fs/promises';
import path from 'node:path';

import { createDiagnosticEnvelope, createUnknownFieldDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { ApplyPatchPlanInput, ConfirmationInput } from '../contracts/patch-plan';
import type { MutationResultEnvelope } from '../contracts/mutation-result';
import type { MutationJournalEntry } from '../mutation/journal';
import { readJournalEntries } from '../mutation/journal';
import type { MutationMode } from '../mutation/mode';
import type { PatchPlanStore } from '../mutation/patch-store';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { handleApplyPatchPlan } from '../tools/patch/apply-patch-plan';

export type ApplyIdeaPatchResult = DiagnosticEnvelope | MutationResultEnvelope;

export interface ApplyIdeaPatchContext {
  mutationMode: MutationMode;
  patchStore?: PatchPlanStore;
  workspace: WorkspaceRootStatus;
}

interface CreativeApplyPostApplyMetadata {
  backupIdentifiers: readonly string[];
  journal?: {
    mutationId: string;
    resourceUri: string;
  };
  nextActions: readonly string[];
  rollback: {
    eligible: boolean;
    mutationId?: string;
    unavailableReason?: string;
  };
}

const TOOL_NAME = 'workbench.creative.apply_idea_patch' as const;
const ALLOWED_TOP_LEVEL_KEYS = ['confirmation', 'options', 'patchPlanId', 'sessionId'] as const;
const ALLOWED_OPTION_KEYS = ['createBackup', 'postValidate', 'rollbackOnValidationError'] as const;

/**
 * applyStoredIdeaPatch 함수.
 * creative layer에서 raw edit authority를 받지 않고 저장된 PatchPlan id만 canonical apply path로 위임함.
 *
 * @param input - raw creative apply input
 * @param context - shared patch store, workspace, mutation mode
 * @returns structured diagnostic or canonical mutation result envelope
 */
export async function applyStoredIdeaPatch(input: unknown, context: ApplyIdeaPatchContext): Promise<ApplyIdeaPatchResult> {
  const unknownFieldResult = createUnknownFieldDiagnosticEnvelope({ allowedKeys: ALLOWED_TOP_LEVEL_KEYS, input, tool: TOOL_NAME });
  if (unknownFieldResult.status === 'domain_error') return unknownFieldResult;

  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    const patchPlanId = stringField((input as Record<string, unknown>).patchPlanId);
    if (!patchPlanId) return patchPlanNotFoundEnvelope('Missing patchPlanId; supply the patchPlanId returned by turn_idea_into_patch_plan.');
  }

  const parsed = parseApplyIdeaPatchInput(input);
  if (!parsed.ok) return invalidInputEnvelope(parsed.reason, 'creative.apply-idea-patch.input-invalid');

  const patchStore = context.patchStore;
  if (!patchStore) {
    return patchPlanNotFoundEnvelope(`No stored PatchPlan found for patchPlanId "${parsed.input.patchPlanId}".`);
  }

  const patchPlan = patchStore.getPatchPlan(parsed.input.patchPlanId);
  if (!patchPlan) {
    return patchPlanNotFoundEnvelope(`No stored PatchPlan found for patchPlanId "${parsed.input.patchPlanId}".`);
  }

  if (!context.workspace.ok) {
    return workspaceMismatchEnvelope('Workspace root is unavailable; cannot apply stored creative PatchPlan.');
  }

  if (!(await sameWorkspace(patchPlan.workspaceRoot, context.workspace.path))) {
    return workspaceMismatchEnvelope('Stored PatchPlan workspace does not match the active MCP workspace.');
  }

  const result = await handleApplyPatchPlan(
    {
      confirmation: parsed.input.confirmation,
      options: parsed.input.options,
      patchPlanId: parsed.input.patchPlanId,
    },
    {
      mutationMode: context.mutationMode,
      patchStore,
      workspace: context.workspace,
    },
  );
  if (result.schema !== 'risuai-workbench-mcp.mutation-result') return result;

  return enrichCreativeApplyResult(result, context.workspace);
}

async function enrichCreativeApplyResult(result: MutationResultEnvelope, workspace: WorkspaceRootStatus): Promise<MutationResultEnvelope> {
  if (!result.mutationId || result.changedFiles.length === 0 || (result.status !== 'applied' && result.status !== 'failed')) return result;

  const metadata = await buildPostApplyMetadata(result, workspace);
  return {
    ...result,
    ...metadata,
  };
}

async function buildPostApplyMetadata(result: MutationResultEnvelope, workspace: WorkspaceRootStatus): Promise<CreativeApplyPostApplyMetadata> {
  const mutationId = result.mutationId ?? '';
  const journalEntry = await findJournalEntry(workspace, mutationId);
  const rollbackEligible = Boolean(journalEntry?.rollbackAvailable && journalEntry.rollbackData);
  const backupIdentifiers = (journalEntry?.backupFiles ?? []).map((backup) => backup.backupPath);
  const journalResourceUri = result.resourceLinks.find((link) => link.includes('/mutations/journal/')) ?? `risuai-workbench://mutations/journal/${encodeURIComponent(mutationId)}`;

  return {
    backupIdentifiers,
    journal: {
      mutationId,
      resourceUri: journalResourceUri,
    },
    nextActions: buildPostApplyNextActions(result, rollbackEligible),
    rollback: rollbackEligible
      ? { eligible: true, mutationId }
      : { eligible: false, mutationId, unavailableReason: 'Journal entry does not contain sufficient inverse state for rollback; invoke workbench.rollback_mutation only after a rollback-capable mutation.' },
  };
}

async function findJournalEntry(workspace: WorkspaceRootStatus, mutationId: string): Promise<MutationJournalEntry | undefined> {
  if (!workspace.ok) return undefined;
  const journalPath = path.join(workspace.path, '.risuai-workbench-mcp', 'journal.jsonl');
  const entries = await readJournalEntries(journalPath);
  return entries.reverse().find((entry) => entry.mutationId === mutationId);
}

function buildPostApplyNextActions(result: MutationResultEnvelope, rollbackEligible: boolean): readonly string[] {
  const actions = new Set<string>();
  const changedFiles = result.changedFiles.map((file) => file.path);
  if (changedFiles.length > 0) {
    actions.add('workbench.refresh_analyze_snapshot');
    actions.add('workbench.refresh_wiki');
  }
  if (result.postValidation.status === 'error' || rollbackEligible || result.mutationId) actions.add('workbench.rollback_mutation');
  return [...actions];
}

function parseApplyIdeaPatchInput(input: unknown): { input: ApplyPatchPlanInput & { sessionId?: string }; ok: true } | { ok: false; reason: string } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'Input must be an object.' };
  }

  const candidate = input as Record<string, unknown>;
  const patchPlanId = stringField(candidate.patchPlanId);
  if (!patchPlanId) return { ok: false, reason: 'patchPlanId must be a non-empty string.' };

  const confirmation = parseConfirmation(candidate.confirmation);
  if (!confirmation.ok) return { ok: false, reason: confirmation.reason };

  const options = parseOptions(candidate.options);
  if (!options.ok) return { ok: false, reason: options.reason };

  const sessionId = stringField(candidate.sessionId);
  if (candidate.sessionId !== undefined && !sessionId) return { ok: false, reason: 'sessionId must be a non-empty string when provided.' };

  return {
    input: {
      confirmation: confirmation.value,
      options: options.value,
      patchPlanId,
      sessionId,
    },
    ok: true,
  };
}

function parseConfirmation(value: unknown): { ok: true; value: ConfirmationInput } | { ok: false; reason: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'confirmation object is required.' };
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((key) => key !== 'accepted' && key !== 'confirmationText').sort((left, right) => left.localeCompare(right));
  if (unknownKeys.length > 0) return { ok: false, reason: `Unknown confirmation fields are rejected: ${unknownKeys.join(', ')}.` };
  if (typeof record.accepted !== 'boolean') return { ok: false, reason: 'confirmation.accepted must be boolean.' };
  if (record.confirmationText !== undefined && typeof record.confirmationText !== 'string') {
    return { ok: false, reason: 'confirmation.confirmationText must be a string when provided.' };
  }
  return { ok: true, value: { accepted: record.accepted, confirmationText: record.confirmationText as string | undefined } };
}

function parseOptions(value: unknown): { ok: true; value?: ApplyPatchPlanInput['options'] } | { ok: false; reason: string } {
  if (value === undefined) return { ok: true, value: undefined };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'options must be an object when provided.' };
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>(ALLOWED_OPTION_KEYS);
  const unknownKeys = Object.keys(record).filter((key) => !allowed.has(key)).sort((left, right) => left.localeCompare(right));
  if (unknownKeys.length > 0) return { ok: false, reason: `Unknown option fields are rejected: ${unknownKeys.join(', ')}.` };
  for (const key of ALLOWED_OPTION_KEYS) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') return { ok: false, reason: `options.${key} must be boolean when provided.` };
  }
  return {
    ok: true,
    value: {
      createBackup: record.createBackup as boolean | undefined,
      postValidate: record.postValidate as boolean | undefined,
      rollbackOnValidationError: record.rollbackOnValidationError as boolean | undefined,
    },
  };
}

async function sameWorkspace(storedRoot: string, activeRoot: string): Promise<boolean> {
  const [stored, active] = await Promise.all([canonicalizePath(storedRoot), canonicalizePath(activeRoot)]);
  return stored === active;
}

async function canonicalizePath(rootPath: string): Promise<string> {
  try {
    return await realpath(rootPath);
  } catch {
    return path.resolve(rootPath);
  }
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function invalidInputEnvelope(message: string, ruleId: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({
    diagnostics: [creativeDiagnostic('CREATIVE_PATCH_PLAN_INVALID', message, ruleId)],
    status: 'domain_error',
    tool: TOOL_NAME,
  });
}

function patchPlanNotFoundEnvelope(message: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({
    diagnostics: [creativeDiagnostic('CREATIVE_PATCH_PLAN_NOT_FOUND', message, 'creative.patch-plan.not-found')],
    status: 'domain_error',
    tool: TOOL_NAME,
  });
}

function workspaceMismatchEnvelope(message: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({
    diagnostics: [creativeDiagnostic('CREATIVE_WORKSPACE_MISMATCH', message, 'creative.patch-plan.workspace-mismatch')],
    status: 'domain_error',
    tool: TOOL_NAME,
  });
}

function creativeDiagnostic(id: string, message: string, ruleId: string): WorkbenchDiagnostic {
  return {
    category: 'creative-patch-plan',
    id,
    message,
    path: null,
    ruleId,
    severity: 'error',
  };
}
