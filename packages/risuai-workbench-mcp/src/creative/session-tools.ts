/**
 * Explicit creative session and memory persistence helpers.
 * @file packages/risuai-workbench-mcp/src/creative/session-tools.ts
 */

import { randomUUID } from 'node:crypto';
import { link, mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CREATIVE_SCHEMA_VERSION,
  type CreativeSessionStatus,
  type Idea,
  type IdeaRanking,
  type PatchPlanRef,
  type SourceInputRef,
  validateCreativeSessionSchema,
} from '../contracts/creative';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import { createCreativeSessionInStore } from './session-store';

export const CREATIVE_MEMORY_METADATA_DIR = '.risuai-workbench-mcp/creative/memory' as const;

export interface CreativePersistenceToolOptions {
  workspaceRoot?: string;
}

export interface CreativeSessionWriteData {
  schema: 'risuai-workbench-mcp.creative.session-write';
  schemaVersion: '0.2.0';
  sessionId: string;
  resourceUri: string;
  relativePath: string;
  sourceArtifactWritten: false;
  persistentMemoryWritten: false;
  sessionWritten: true;
}

export interface CreativeMemoryWriteData {
  schema: 'risuai-workbench-mcp.creative.memory-write';
  schemaVersion: '0.2.0';
  memoryId: string;
  ideaId: string;
  resourceUri: string;
  relativePath: string;
  retention: CreativeMemoryRecord['retention'];
  privacy: CreativeMemoryRecord['privacy'];
  sourceArtifactWritten: false;
  persistentMemoryWritten: true;
}

export interface CreativeMemoryRecord {
  schema: 'risuai-workbench-mcp.creative.memory';
  schemaVersion: '0.2.0';
  memoryId: string;
  workspaceRoot: string;
  createdAt: string;
  updatedAt: string;
  sessionId?: string;
  ideaId: string;
  idea: Pick<Idea, 'assumptions' | 'evidence' | 'id' | 'summary' | 'title'>;
  retention: {
    policy: 'workspace-local' | 'delete-on-request' | 'expires-at';
    expiresAt?: string;
    reason: string;
  };
  privacy: {
    classification: 'workspace-local' | 'private' | 'public-summary';
    containsSecrets: false;
    redactions: readonly string[];
  };
}

type CreativeSessionToolResult = DiagnosticEnvelope<CreativeSessionWriteData>;
type CreativeMemoryToolResult = DiagnosticEnvelope<CreativeMemoryWriteData>;

const SAVE_SESSION_TOOL_NAME = 'workbench.creative.save_idea_session';
const WRITE_MEMORY_TOOL_NAME = 'workbench.creative.write_idea_memory';
const SAFE_MEMORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function saveIdeaSession(input: unknown, options: CreativePersistenceToolOptions = {}): Promise<CreativeSessionToolResult> {
  const parsed = await parseSessionInput(input, options.workspaceRoot);
  if (!parsed.ok) return diagnosticError(SAVE_SESSION_TOOL_NAME, parsed.diagnostic);

  const created = await createCreativeSessionInStore(parsed.value);
  if (created.status !== 'ok' || !created.data?.relativePath || !created.data.session) {
    return created as CreativeSessionToolResult;
  }

  return createDiagnosticEnvelope({
    data: {
      persistentMemoryWritten: false,
      relativePath: created.data.relativePath,
      resourceUri: `risuai-workbench://ideas/sessions/${created.data.session.sessionId}`,
      schema: 'risuai-workbench-mcp.creative.session-write',
      schemaVersion: CREATIVE_SCHEMA_VERSION,
      sessionId: created.data.session.sessionId,
      sessionWritten: true,
      sourceArtifactWritten: false,
    },
    diagnostics: [],
    status: 'ok',
    tool: SAVE_SESSION_TOOL_NAME,
  });
}

export async function writeIdeaMemory(input: unknown, options: CreativePersistenceToolOptions = {}): Promise<CreativeMemoryToolResult> {
  const parsed = await parseMemoryInput(input, options.workspaceRoot);
  if (!parsed.ok) return diagnosticError(WRITE_MEMORY_TOOL_NAME, parsed.diagnostic);

  const relativePath = getCreativeMemoryRelativePath(parsed.value.memoryId);
  const absolutePath = path.resolve(parsed.value.workspaceRoot, relativePath);
  const relativeFromRoot = path.relative(parsed.value.workspaceRoot, absolutePath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    return diagnosticError(WRITE_MEMORY_TOOL_NAME, {
      category: 'creative-memory',
      id: 'CREATIVE_MEMORY_ID_UNSAFE',
      message: 'Creative memory id resolves outside the workspace metadata directory.',
      path: null,
      ruleId: 'creative-memory.memory-id-safe',
      severity: 'error',
    });
  }

  try {
    await writeJsonAtomically(absolutePath, parsed.value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      return diagnosticError(WRITE_MEMORY_TOOL_NAME, {
        category: 'creative-memory',
        id: 'CREATIVE_MEMORY_ALREADY_EXISTS',
        message: `Creative memory already exists: ${parsed.value.memoryId}.`,
        path: relativePath,
        ruleId: 'creative-memory.duplicate',
        severity: 'error',
      });
    }
    throw error;
  }

  return createDiagnosticEnvelope({
    data: {
      ideaId: parsed.value.ideaId,
      memoryId: parsed.value.memoryId,
      persistentMemoryWritten: true,
      privacy: parsed.value.privacy,
      relativePath,
      resourceUri: `risuai-workbench://ideas/${parsed.value.ideaId}/memory/${parsed.value.memoryId}`,
      retention: parsed.value.retention,
      schema: 'risuai-workbench-mcp.creative.memory-write',
      schemaVersion: CREATIVE_SCHEMA_VERSION,
      sourceArtifactWritten: false,
    },
    diagnostics: [],
    status: 'ok',
    tool: WRITE_MEMORY_TOOL_NAME,
  });
}

export function getCreativeMemoryRelativePath(memoryId: string): string {
  return `${CREATIVE_MEMORY_METADATA_DIR}/${memoryId}.json`;
}

async function parseSessionInput(
  input: unknown,
  serverWorkspaceRoot: string | undefined,
): Promise<{ ok: true; value: Parameters<typeof createCreativeSessionInStore>[0] } | { diagnostic: WorkbenchDiagnostic; ok: false }> {
  if (!isRecord(input)) return { diagnostic: inputDiagnostic('SAVE_IDEA_SESSION_INPUT_INVALID', 'save_idea_session input must be a JSON object.'), ok: false };

  const session = isRecord(input.session) ? input.session : input;
  const schemaVersion = typeof session.schemaVersion === 'string' ? session.schemaVersion : CREATIVE_SCHEMA_VERSION;
  const schemaValidation = validateCreativeSessionSchema({ schemaVersion });
  if (!schemaValidation.valid) {
    return { diagnostic: creativeSessionDiagnostic(schemaValidation.errorCode, schemaValidation.message), ok: false };
  }

  const workspaceRoot = await resolveToolWorkspace(input.workspaceRoot, serverWorkspaceRoot, SAVE_SESSION_TOOL_NAME);
  if (!workspaceRoot.ok) return workspaceRoot;

  if (typeof session.workspaceRoot === 'string') {
    const sessionRoot = await resolveRealWorkspace(session.workspaceRoot);
    if (!sessionRoot.ok) return { diagnostic: sessionRoot.diagnostic, ok: false };
    if (sessionRoot.path !== workspaceRoot.value) {
      return { diagnostic: creativeSessionDiagnostic('CREATIVE_WORKSPACE_MISMATCH', 'Creative session belongs to a different workspace.'), ok: false };
    }
  }

  const sessionId = stringField(session.sessionId) ?? stringField(input.sessionId);
  const title = stringField(session.title) ?? stringField(input.title) ?? 'Creative idea session';
  if (!sessionId) return { diagnostic: inputDiagnostic('SAVE_IDEA_SESSION_INPUT_INVALID', 'save_idea_session requires sessionId or session.sessionId.'), ok: false };

  return {
    ok: true,
    value: {
      createdAt: stringField(session.createdAt) ?? stringField(input.createdAt),
      ideas: arrayField<Idea>(session.ideas) ?? arrayField<Idea>(input.ideas),
      patchPlanRefs: arrayField<PatchPlanRef>(session.patchPlanRefs) ?? arrayField<PatchPlanRef>(input.patchPlanRefs),
      rankings: recordField<IdeaRanking>(session.rankings) ?? recordField<IdeaRanking>(input.rankings),
      sessionId,
      sourceInputs: arrayField<SourceInputRef>(session.sourceInputs) ?? arrayField<SourceInputRef>(input.sourceInputs),
      status: creativeSessionStatusField(session.status) ?? creativeSessionStatusField(input.status),
      title,
      updatedAt: stringField(session.updatedAt) ?? stringField(input.updatedAt),
      workspaceRoot: workspaceRoot.value,
    },
  };
}

async function parseMemoryInput(
  input: unknown,
  serverWorkspaceRoot: string | undefined,
): Promise<{ ok: true; value: CreativeMemoryRecord } | { diagnostic: WorkbenchDiagnostic; ok: false }> {
  if (!isRecord(input)) return { diagnostic: inputDiagnostic('WRITE_IDEA_MEMORY_INPUT_INVALID', 'write_idea_memory input must be a JSON object.'), ok: false };

  const schemaVersion = typeof input.schemaVersion === 'string' ? input.schemaVersion : CREATIVE_SCHEMA_VERSION;
  const schemaValidation = validateCreativeSessionSchema({ schemaVersion });
  if (!schemaValidation.valid) {
    return { diagnostic: creativeSessionDiagnostic(schemaValidation.errorCode, schemaValidation.message), ok: false };
  }

  const workspaceRoot = await resolveToolWorkspace(input.workspaceRoot, serverWorkspaceRoot, WRITE_MEMORY_TOOL_NAME);
  if (!workspaceRoot.ok) return workspaceRoot;

  const idea = isRecord(input.idea) ? input.idea : input;
  const ideaId = stringField(idea.id) ?? stringField(input.ideaId);
  if (!ideaId) return { diagnostic: inputDiagnostic('WRITE_IDEA_MEMORY_INPUT_INVALID', 'write_idea_memory requires ideaId or idea.id.'), ok: false };

  const memoryId = stringField(input.memoryId) ?? `idea-${ideaId}`;
  if (!SAFE_MEMORY_ID_PATTERN.test(memoryId) || memoryId === '.' || memoryId === '..' || memoryId.includes('/') || memoryId.includes('\\')) {
    return { diagnostic: { category: 'creative-memory', id: 'CREATIVE_MEMORY_ID_UNSAFE', message: 'Creative memory id must be 1-128 chars of letters, numbers, dot, underscore, colon, or dash and cannot contain path separators.', path: null, ruleId: 'creative-memory.memory-id-safe', severity: 'error' }, ok: false };
  }

  const privacyInput = isRecord(input.privacy) ? input.privacy : {};
  if (privacyInput.containsSecrets === true) {
    return { diagnostic: creativeSessionDiagnostic('CREATIVE_POLICY_DENIED', 'Creative memory refuses to store records marked as containing secrets.'), ok: false };
  }

  const now = stringField(input.createdAt) ?? new Date().toISOString();
  const title = stringField(idea.title) ?? stringField(input.title) ?? ideaId;
  const summary = stringField(idea.summary) ?? stringField(input.summary) ?? title;
  const retentionInput = isRecord(input.retention) ? input.retention : {};
  const retentionPolicy = retentionPolicyField(retentionInput.policy);
  const privacyClassification = privacyClassificationField(privacyInput.classification);

  return {
    ok: true,
    value: {
      createdAt: now,
      idea: {
        assumptions: stringArrayField(idea.assumptions) ?? stringArrayField(input.assumptions) ?? [],
        evidence: stringArrayField(idea.evidence) ?? stringArrayField(input.evidence) ?? [],
        id: ideaId,
        summary,
        title,
      },
      ideaId,
      memoryId,
      privacy: {
        classification: privacyClassification,
        containsSecrets: false,
        redactions: stringArrayField(privacyInput.redactions) ?? [],
      },
      retention: {
        expiresAt: stringField(retentionInput.expiresAt),
        policy: retentionPolicy,
        reason: stringField(retentionInput.reason) ?? 'Explicit user-requested creative memory write; workspace-local only.',
      },
      schema: 'risuai-workbench-mcp.creative.memory',
      schemaVersion: CREATIVE_SCHEMA_VERSION,
      sessionId: stringField(input.sessionId),
      updatedAt: stringField(input.updatedAt) ?? now,
      workspaceRoot: workspaceRoot.value,
    },
  };
}

async function resolveToolWorkspace(
  inputWorkspaceRoot: unknown,
  serverWorkspaceRoot: string | undefined,
  tool: string,
): Promise<{ ok: true; value: string } | { diagnostic: WorkbenchDiagnostic; ok: false }> {
  const candidate = typeof inputWorkspaceRoot === 'string' ? inputWorkspaceRoot : serverWorkspaceRoot;
  if (!candidate) return { diagnostic: inputDiagnostic(`${tool.endsWith('save_idea_session') ? 'SAVE_IDEA_SESSION' : 'WRITE_IDEA_MEMORY'}_WORKSPACE_REQUIRED`, 'A workspace root is required for creative persistence.'), ok: false };

  const resolved = await resolveRealWorkspace(candidate);
  if (!resolved.ok) return { diagnostic: resolved.diagnostic, ok: false };

  if (typeof inputWorkspaceRoot === 'string' && serverWorkspaceRoot) {
    const server = await resolveRealWorkspace(serverWorkspaceRoot);
    if (!server.ok) return { diagnostic: server.diagnostic, ok: false };
    if (server.path !== resolved.path) {
      return { diagnostic: creativeSessionDiagnostic('CREATIVE_WORKSPACE_MISMATCH', 'Creative persistence request targets a different workspace.'), ok: false };
    }
  }

  return { ok: true, value: resolved.path };
}

async function resolveRealWorkspace(workspaceRoot: string): Promise<{ ok: true; path: string } | { diagnostic: WorkbenchDiagnostic; ok: false }> {
  try {
    return { ok: true, path: await realpath(workspaceRoot) };
  } catch {
    return {
      diagnostic: {
        category: 'creative-session',
        id: 'CREATIVE_WORKSPACE_ROOT_UNAVAILABLE',
        message: 'Creative persistence workspace root is unavailable.',
        path: null,
        ruleId: 'creative-session.workspace-root',
        severity: 'error',
      },
      ok: false,
    };
  }
}

function diagnosticError<T>(tool: string, diagnostic: WorkbenchDiagnostic): DiagnosticEnvelope<T> {
  return createDiagnosticEnvelope({ diagnostics: [diagnostic], status: 'domain_error', tool });
}

function inputDiagnostic(id: string, message: string): WorkbenchDiagnostic {
  return { category: 'input', id, message, path: null, ruleId: 'creative-persistence.input', severity: 'error' };
}

function creativeSessionDiagnostic(id: string, message: string): WorkbenchDiagnostic {
  return { category: 'creative-session', id, message, path: null, ruleId: 'creative-session.schema', severity: 'error' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function arrayField<T>(value: unknown): readonly T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

function stringArrayField(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : undefined;
}

function recordField<T>(value: unknown): Readonly<Record<string, T>> | undefined {
  return isRecord(value) ? (value as Readonly<Record<string, T>>) : undefined;
}

function creativeSessionStatusField(value: unknown): CreativeSessionStatus | undefined {
  return value === 'active' || value === 'completed' || value === 'abandoned' ? value : undefined;
}

function retentionPolicyField(value: unknown): CreativeMemoryRecord['retention']['policy'] {
  return value === 'delete-on-request' || value === 'expires-at' || value === 'workspace-local' ? value : 'workspace-local';
}

function privacyClassificationField(value: unknown): CreativeMemoryRecord['privacy']['classification'] {
  return value === 'private' || value === 'public-summary' || value === 'workspace-local' ? value : 'workspace-local';
}

async function writeJsonAtomically(filePath: string, payload: CreativeMemoryRecord): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  try {
    await link(tempPath, filePath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
