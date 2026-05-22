/**
 * Pure helpers for converting selected creative ideas into implementation plans
 * and existing-contract PatchPlan previews.
 * @file packages/risuai-workbench-mcp/src/creative/idea-to-patch-plan.ts
 */

import path from 'node:path';

import {
  createCreativeImplementationPlan,
  createIdea,
  createIdeaPatchEnvelope,
  type CreativeImplementationPlan,
  type CreativeTargetChange,
  type Idea,
  type IdeaPatchEnvelope,
  type MutationReadinessLevel,
} from '../contracts/creative';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { PatchOperation, PatchPlan, PatchPrecondition } from '../contracts/patch-plan';
import { createInsideWorkspacePrecondition, createNonexistencePrecondition, createPatchPlan } from '../mutation/patch-preview';
import type { PatchPlanStore } from '../mutation/patch-store';

export type TurnIdeaIntoPlanResult = CreativeImplementationPlan | DiagnosticEnvelope;
export type TurnIdeaIntoPatchPlanResult = IdeaPatchEnvelope | DiagnosticEnvelope;

export interface IdeaToPatchPlanContext {
  workspaceRoot?: string;
  patchStore?: PatchPlanStore;
}

interface NormalizedTarget {
  artifact: string;
  stem: string;
  path: string;
  orderPath?: string;
  entry: string;
  touchesGeneratedOnly: boolean;
  touchesSourceArtifacts: boolean;
}

interface NormalizedConversion {
  idea: Idea;
  target: NormalizedTarget;
  validationPlan: readonly string[];
  operations: readonly PatchOperation[];
  preconditions: readonly PatchPrecondition[];
  targetChanges: readonly CreativeTargetChange[];
}

const PLAN_TOOL = 'workbench.creative.turn_idea_into_plan' as const;
const PATCH_TOOL = 'workbench.creative.turn_idea_into_patch_plan' as const;
const MAX_TEXT = 220;
const MAX_LIST = 8;

const ARTIFACT_PATHS: Record<string, { directory: string; suffix: string }> = {
  button: { directory: 'buttons', suffix: '.risubutton' },
  lorebook: { directory: 'lorebooks', suffix: '.risulorebook' },
  lua: { directory: 'lua', suffix: '.risulua' },
  prompt: { directory: 'prompts', suffix: '.risuprompt' },
  regex: { directory: 'regexes', suffix: '.risuregex' },
  variable: { directory: 'variables', suffix: '.risuvar' },
};

const PROHIBITED_DIRECT_EDIT_FIELDS = new Set([
  'command',
  'commands',
  'content',
  'diff',
  'diffs',
  'edit',
  'edits',
  'operation',
  'operations',
  'patchOperations',
  'rawDiff',
  'rawOperations',
  'replacementText',
  'replacements',
  'shell',
  'shellCommand',
  'shellCommands',
  'unifiedDiff',
]);

export function turnIdeaIntoImplementationPlan(input: unknown): TurnIdeaIntoPlanResult {
  const normalized = normalizeConversionInput(input, PLAN_TOOL);
  if (!normalized.ok) return normalized.error;

  return createCreativeImplementationPlan({
    planId: `creative-plan:${stableSlug(normalized.value.idea.id)}:${shortHash(normalized.value.target.path)}`,
    selectedIdeaIds: [normalized.value.idea.id],
    steps: [
      {
        affectedFiles: affectedFilesForOperations(normalized.value.operations),
        description: `Preview implementation of selected idea "${normalized.value.idea.title}" without writing source artifacts.`,
        ideaId: normalized.value.idea.id,
        operations: operationKindRefs(normalized.value.operations),
      },
    ],
    targetChanges: normalized.value.targetChanges,
    validationPlan: normalized.value.validationPlan,
  });
}

export function turnIdeaIntoStoredPatchPlan(input: unknown, context: IdeaToPatchPlanContext): TurnIdeaIntoPatchPlanResult {
  const normalized = normalizeConversionInput(input, PATCH_TOOL);
  if (!normalized.ok) return normalized.error;

  if (!context.workspaceRoot) {
    return invalidInputEnvelope(PATCH_TOOL, 'Workspace root is unavailable; cannot create an existing-contract PatchPlan preview.', 'creative.patch-plan.workspace-missing');
  }

  const patchPlan = createPatchPlan({
    expectedDiagnostics: [
      { category: 'creative-patch-plan', id: 'CREATIVE_PATCH_PREVIEW_CREATED', severity: 'info' },
    ],
    intent: `Implement selected creative idea ${normalized.value.idea.id}: ${normalized.value.idea.title}`,
    operations: normalized.value.operations,
    preconditions: normalized.value.preconditions,
    safety: {
      destructive: false,
      requiresConfirmation: normalized.value.target.touchesSourceArtifacts,
      touchesGeneratedOnly: normalized.value.target.touchesGeneratedOnly,
      touchesSourceArtifacts: normalized.value.target.touchesSourceArtifacts,
    },
    unifiedDiff: buildIntentOnlyDiff(normalized.value),
    workspaceRoot: context.workspaceRoot,
  });

  context.patchStore?.savePatchPlan(patchPlan);
  return buildIdeaPatchEnvelope(normalized.value, patchPlan);
}

function normalizeConversionInput(
  input: unknown,
  tool: typeof PLAN_TOOL | typeof PATCH_TOOL,
): { ok: true; value: NormalizedConversion } | { ok: false; error: DiagnosticEnvelope } {
  const record = recordOf(input);
  if (!record) {
    return { ok: false, error: invalidInputEnvelope(tool, `${tool} requires an object input with explicit ideaId, idea data, and target path details.`, 'creative.patch-plan.input-object') };
  }

  const prohibited = prohibitedFields(record);
  if (prohibited.length > 0) {
    return { ok: false, error: invalidInputEnvelope(tool, `Raw edit payload fields are rejected at the creative conversion boundary: ${prohibited.join(', ')}.`, 'creative.patch-plan.reject-raw-edits') };
  }

  const idea = selectExplicitIdea(record);
  if (!idea) {
    return { ok: false, error: invalidInputEnvelope(tool, 'A selected idea requires both ideaId and matching caller-supplied idea data; persisted sessions are not implicitly loaded.', 'creative.patch-plan.selected-idea-required') };
  }

  const target = normalizeTarget(record);
  if (!target) {
    return { ok: false, error: invalidInputEnvelope(tool, `Idea ${idea.id} is underspecified for patch planning; provide target.path or target.root, target.artifact, and target.stem.`, 'creative.patch-plan.target-required') };
  }

  const validationPlan = normalizeValidationPlan(record, idea, target);
  const operations = operationsForIdea(idea, target);
  const preconditions = preconditionsForTarget(target);
  const targetChanges = targetChangesForIdea(idea, target);

  return { ok: true, value: { idea, operations, preconditions, target, targetChanges, validationPlan } };
}

function buildIdeaPatchEnvelope(normalized: NormalizedConversion, patchPlan: PatchPlan): IdeaPatchEnvelope {
  const affectedFiles = patchPlan.preview.affectedFiles.map((file) => file.path);
  const operationKinds = [...new Set(patchPlan.operations.map((operation) => operation.kind))].sort() as PatchOperation['kind'][];
  const patchPlanResource = patchPlan.preview.resourceLinks[0] ?? '';

  return createIdeaPatchEnvelope({
    affectedFiles,
    ideaId: normalized.idea.id,
    mutationTarget: {
      affectedFiles,
      touchesGeneratedOnly: patchPlan.safety.touchesGeneratedOnly,
      touchesSourceArtifacts: patchPlan.safety.touchesSourceArtifacts,
    },
    operationKinds,
    patchPlanId: patchPlan.patchPlanId,
    patchPlanResource,
    preApplyValidation: { required: normalized.validationPlan },
    requiredConfirmation: patchPlan.safety.requiresConfirmation,
    resourceLinks: patchPlan.preview.resourceLinks,
    status: 'preview-created',
    tool: PATCH_TOOL,
  });
}

function operationsForIdea(idea: Idea, target: NormalizedTarget): PatchOperation[] {
  const operations: PatchOperation[] = [
    {
      content: scaffoldArtifactContent(idea),
      kind: 'file.create',
      path: target.path,
      overwrite: false,
    },
  ];
  if (target.orderPath) {
    operations.push({ entry: target.entry, kind: 'order.insert', orderPath: target.orderPath });
  }
  return operations;
}

function preconditionsForTarget(target: NormalizedTarget): PatchPrecondition[] {
  const preconditions = [createInsideWorkspacePrecondition(target.path), createNonexistencePrecondition(target.path)];
  if (target.orderPath) preconditions.push(createInsideWorkspacePrecondition(target.orderPath));
  return preconditions;
}

function targetChangesForIdea(idea: Idea, target: NormalizedTarget): CreativeTargetChange[] {
  const changes: CreativeTargetChange[] = [
    {
      artifact: target.artifact,
      kind: 'create-artifact',
      path: target.path,
      reason: compactText(idea.summary),
      stem: target.stem,
    },
  ];
  if (target.orderPath) {
    changes.push({ entry: target.entry, kind: 'edit-order', orderPath: target.orderPath, reason: `Insert ${target.entry} so the new artifact participates in workspace order.` });
  }
  return changes;
}

function normalizeTarget(input: Record<string, unknown>): NormalizedTarget | undefined {
  const target = recordOf(input.target) ?? input;
  const pathValue = firstString(target.path, input.path);
  const root = firstString(target.root, target.artifactRoot, input.artifactRoot);
  const artifact = stableSlug(firstString(target.artifact, input.artifact, inferArtifactFromPath(pathValue), 'artifact') ?? 'artifact');
  const stem = stableSlug(firstString(target.stem, input.stem, pathValue ? path.basename(pathValue, path.extname(pathValue)) : undefined) ?? '');
  const generatedOnly = booleanField(target, 'generatedOnly') ?? booleanField(input, 'generatedOnly') ?? false;

  const plannedPath = pathValue ?? buildTargetPath(root, artifact, stem);
  if (!plannedPath || !stem || !isSafeRelativePath(plannedPath)) return undefined;

  const orderPath = firstString(target.orderPath, input.orderPath) ?? defaultOrderPath(plannedPath, artifact);
  if (orderPath && !isSafeRelativePath(orderPath)) return undefined;

  return {
    artifact,
    entry: firstString(target.entry, input.entry) ?? path.basename(plannedPath),
    orderPath,
    path: plannedPath,
    stem,
    touchesGeneratedOnly: generatedOnly,
    touchesSourceArtifacts: !generatedOnly,
  };
}

function buildTargetPath(root: string | undefined, artifact: string, stem: string): string | undefined {
  if (!root || !stem || !isSafeRelativePath(root)) return undefined;
  const artifactInfo = ARTIFACT_PATHS[artifact] ?? { directory: `${artifact}s`, suffix: '.md' };
  return `${stripTrailingSlash(root)}/${artifactInfo.directory}/${stem}${artifactInfo.suffix}`;
}

function defaultOrderPath(targetPath: string, artifact: string): string | undefined {
  if (artifact === 'lua' || targetPath.includes('/generated/') || targetPath.startsWith('generated/')) return undefined;
  return `${path.posix.dirname(targetPath)}/_order.json`;
}

function normalizeValidationPlan(input: Record<string, unknown>, idea: Idea, target: NormalizedTarget): readonly string[] {
  const supplied = compactStringList(toStringArray(input.validationPlan), MAX_LIST);
  if (supplied.length > 0) return supplied;
  const rankingValidation = compactStringList(toStringArray(recordOf(idea.ranking)?.requiredValidation), MAX_LIST)
    .map((entry) => entry.startsWith('workbench.') ? entry.slice('workbench.'.length) : entry);
  return compactStringList([
    'validate_path',
    target.path.endsWith('.json') ? '' : 'validate_frontmatter',
    target.orderPath ? 'validate_order' : '',
    ...rankingValidation,
    'query_token_budget',
  ], MAX_LIST);
}

function selectExplicitIdea(input: Record<string, unknown>): Idea | undefined {
  const requestedId = firstString(input.ideaId, input.selectedIdeaId);
  if (!requestedId) return undefined;
  const ideas = normalizeIdeas(input);
  return ideas.find((idea) => idea.id === requestedId);
}

function normalizeIdeas(input: Record<string, unknown>): Idea[] {
  const session = recordOf(input.session);
  const graph = recordOf(input.graph) ?? recordOf(input.ideaGraph);
  const candidates = [
    ...toArray(input.ideas),
    ...toArray(session?.ideas),
    ...toArray(graph?.ideas),
    ...(recordOf(input.idea) ? [input.idea] : []),
  ];
  const seen = new Set<string>();
  const ideas: Idea[] = [];
  for (const candidate of candidates) {
    const idea = normalizeIdea(candidate, ideas.length);
    if (!idea || seen.has(idea.id)) continue;
    seen.add(idea.id);
    ideas.push(idea);
  }
  return ideas;
}

function normalizeIdea(value: unknown, index: number): Idea | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const title = firstString(record.title, record.name, record.id, `Idea ${index + 1}`);
  const summary = firstString(record.summary, record.description, record.whyUseful, title);
  const id = firstString(record.id);
  if (!id || !title || !summary) return undefined;
  return createIdea({
    assumptions: compactStringList(toStringArray(record.assumptions), MAX_LIST),
    candidateMutations: compactStringList(toStringArray(record.candidateMutations), MAX_LIST),
    evidence: compactStringList(toStringArray(record.evidence), MAX_LIST),
    id,
    nextActions: compactStringList(toStringArray(record.nextActions), MAX_LIST),
    ranking: normalizeIdeaRanking(record.ranking),
    summary: compactText(summary),
    title: compactText(title),
  });
}

function normalizeIdeaRanking(value: unknown): Idea['ranking'] {
  const record = recordOf(value);
  if (!record) return undefined;
  const mutationReadiness = normalizeReadiness(firstString(record.mutationReadiness));
  const score = typeof record.score === 'number' && Number.isFinite(record.score) ? record.score : undefined;
  if (!mutationReadiness && score === undefined && toStringArray(record.requiredValidation).length === 0) return undefined;
  return {
    mutationReadiness: mutationReadiness ?? 'needs-validation',
    requiredValidation: compactStringList(toStringArray(record.requiredValidation), MAX_LIST),
    score: score ?? 0,
  };
}

function normalizeReadiness(value: string | undefined): MutationReadinessLevel | undefined {
  if (value === 'not-ready' || value === 'needs-validation' || value === 'ready-with-validation' || value === 'ready') return value;
  return undefined;
}

function prohibitedFields(input: Record<string, unknown>): string[] {
  const target = recordOf(input.target);
  const rootKeys = Object.keys(input).filter((key) => PROHIBITED_DIRECT_EDIT_FIELDS.has(key));
  const targetKeys = target ? Object.keys(target).filter((key) => PROHIBITED_DIRECT_EDIT_FIELDS.has(key)).map((key) => `target.${key}`) : [];
  return [...rootKeys, ...targetKeys].sort((left, right) => left.localeCompare(right));
}

function invalidInputEnvelope(tool: string, message: string, ruleId: string): DiagnosticEnvelope {
  const diagnostic: WorkbenchDiagnostic = {
    category: 'creative-patch-plan',
    id: 'CREATIVE_PATCH_PLAN_INVALID',
    message,
    path: null,
    ruleId,
    severity: 'error',
  };
  return createDiagnosticEnvelope({ diagnostics: [diagnostic], status: 'domain_error', tool });
}

function affectedFilesForOperations(operations: readonly PatchOperation[]): CreativeImplementationPlan['steps'][number]['affectedFiles'] {
  const byPath = new Map<string, Set<PatchOperation['kind']>>();
  for (const operation of operations) {
    for (const filePath of operationPaths(operation)) {
      const kinds = byPath.get(filePath) ?? new Set<PatchOperation['kind']>();
      kinds.add(operation.kind);
      byPath.set(filePath, kinds);
    }
  }
  return [...byPath.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([filePath, kinds]) => ({
    operationKinds: [...kinds].sort() as PatchOperation['kind'][],
    path: filePath,
  }));
}

function operationKindRefs(operations: readonly PatchOperation[]): Array<Pick<PatchOperation, 'kind'>> {
  return [...new Set(operations.map((operation) => operation.kind))].sort().map((kind) => ({ kind })) as Array<Pick<PatchOperation, 'kind'>>;
}

function operationPaths(operation: PatchOperation): readonly string[] {
  if (operation.kind === 'order.insert' || operation.kind === 'order.move' || operation.kind === 'order.remove') return operation.orderPath ? [operation.orderPath] : [];
  if (operation.kind === 'file.move') return [operation.from, operation.to];
  return 'path' in operation ? [operation.path] : [];
}

function scaffoldArtifactContent(idea: Idea): string {
  const evidence = idea.evidence.length > 0 ? idea.evidence.map((entry) => `- ${entry}`).join('\n') : '- No source evidence supplied; validate before applying.';
  const assumptions = idea.assumptions.length > 0 ? idea.assumptions.map((entry) => `- ${entry}`).join('\n') : '- No assumptions supplied.';
  return [
    '---',
    `title: ${yamlScalar(idea.title)}`,
    `sourceIdeaId: ${yamlScalar(idea.id)}`,
    '---',
    '',
    `# ${idea.title}`,
    '',
    idea.summary,
    '',
    '## Evidence',
    evidence,
    '',
    '## Assumptions',
    assumptions,
    '',
  ].join('\n');
}

function buildIntentOnlyDiff(normalized: NormalizedConversion): string {
  return [
    `--- /dev/null`,
    `+++ b/${normalized.target.path}`,
    '@@ creative preview @@',
    `+${normalized.idea.title}`,
    `+${normalized.idea.summary}`,
    normalized.target.orderPath ? `+order:${normalized.target.orderPath}:${normalized.target.entry}` : '',
  ].filter(Boolean).join('\n');
}

function inferArtifactFromPath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const directory = path.posix.basename(path.posix.dirname(value));
  const match = Object.entries(ARTIFACT_PATHS).find(([, info]) => info.directory === directory || value.endsWith(info.suffix));
  return match?.[0];
}

function isSafeRelativePath(value: string): boolean {
  if (value.includes('\0') || value.trim().length === 0 || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return !value.split(/[\\/]+/).some((segment) => segment === '..' || segment === '');
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}

function stripTrailingSlash(value: string): string {
  return value.replace(/[\\/]+$/g, '');
}

function compactText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_TEXT ? `${normalized.slice(0, MAX_TEXT - 1)}…` : normalized;
}

function compactStringList(values: readonly string[], max: number): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0).map(compactText))].slice(0, max);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
  return typeof record[key] === 'boolean' ? record[key] : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim());
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stableSlug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0');
}
