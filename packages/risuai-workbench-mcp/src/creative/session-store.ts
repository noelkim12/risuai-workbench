/**
 * Workspace-local creative session persistence helpers.
 * @file packages/risuai-workbench-mcp/src/creative/session-store.ts
 */

import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createCreativeSession,
  CREATIVE_SCHEMA_VERSION,
  type CreativeSessionSchema,
  type CreativeSessionStatus,
  type Idea,
  type IdeaRanking,
  type PatchPlanRef,
  type SourceInputRef,
  validateCreativeSessionSchema,
} from '../contracts/creative';
import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';

export const CREATIVE_SESSION_METADATA_DIR = '.risuai-workbench-mcp/creative/sessions' as const;

export interface CreateCreativeSessionInput {
  createdAt?: string;
  ideas?: readonly Idea[];
  patchPlanRefs?: readonly PatchPlanRef[];
  rankings?: Readonly<Record<string, IdeaRanking>>;
  sessionId: string;
  sourceInputs?: readonly SourceInputRef[];
  status?: CreativeSessionStatus;
  title: string;
  updatedAt?: string;
  workspaceRoot: string;
}

export interface UpdateCreativeSessionInput {
  sessionId: string;
  update: (session: CreativeSessionSchema) => CreativeSessionSchema;
  workspaceRoot: string;
}

export interface LoadCreativeSessionInput {
  sessionId: string;
  workspaceRoot: string;
}

export interface CreativeSessionStoreData {
  relativePath?: string;
  session?: CreativeSessionSchema;
}

export type CreativeSessionStoreResult = DiagnosticEnvelope<CreativeSessionStoreData>;

interface ResolvedCreativeSessionPath {
  absolutePath: string;
  relativePath: string;
  rootPath: string;
}

const TOOL_NAME = 'creative.session-store';
const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * createCreativeSessionInStore 함수.
 * 명시적으로 호출될 때만 workspace metadata directory 아래에 session JSON을 생성함.
 */
export async function createCreativeSessionInStore(input: CreateCreativeSessionInput): Promise<CreativeSessionStoreResult> {
  const resolvedPath = await resolveCreativeSessionPath(input.workspaceRoot, input.sessionId);
  if (!resolvedPath.ok) return createSessionStoreError(resolvedPath.diagnostic);

  const createdAt = input.createdAt ?? new Date().toISOString();
  const session = createCreativeSession({
    createdAt,
    ideas: input.ideas ?? [],
    patchPlanRefs: input.patchPlanRefs ?? [],
    rankings: input.rankings ?? {},
    sessionId: input.sessionId,
    sourceInputs: input.sourceInputs ?? [],
    status: input.status ?? 'active',
    title: input.title,
    updatedAt: input.updatedAt ?? createdAt,
    workspaceRoot: resolvedPath.path.rootPath,
  });

  const validationDiagnostic = validateLoadedSessionShape(session, resolvedPath.path.rootPath, input.sessionId, resolvedPath.path.relativePath);
  if (validationDiagnostic) return createSessionStoreError(validationDiagnostic);

  const duplicate = await fileExists(resolvedPath.path.absolutePath);
  if (duplicate) {
    return createSessionStoreError({
      category: 'creative-session',
      id: 'CREATIVE_SESSION_ALREADY_EXISTS',
      message: `Creative session already exists: ${input.sessionId}.`,
      path: resolvedPath.path.relativePath,
      ruleId: 'creative-session.duplicate',
      severity: 'error',
    });
  }

  await writeJsonAtomically(resolvedPath.path.absolutePath, session, { rejectIfExists: true });
  return createDiagnosticEnvelope({ data: { relativePath: resolvedPath.path.relativePath, session }, diagnostics: [], status: 'ok', tool: TOOL_NAME });
}

/**
 * loadCreativeSessionFromStore 함수.
 * 명시 session id로만 load하며 workspaceRoot mismatch에서는 session content를 반환하지 않음.
 */
export async function loadCreativeSessionFromStore(input: LoadCreativeSessionInput): Promise<CreativeSessionStoreResult> {
  const resolvedPath = await resolveCreativeSessionPath(input.workspaceRoot, input.sessionId);
  if (!resolvedPath.ok) return createSessionStoreError(resolvedPath.diagnostic);

  let raw: string;
  try {
    raw = await readFile(resolvedPath.path.absolutePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createSessionStoreError({
        category: 'creative-session',
        id: 'CREATIVE_SESSION_NOT_FOUND',
        message: `Creative session was not found: ${input.sessionId}.`,
        path: resolvedPath.path.relativePath,
        ruleId: 'creative-session.not-found',
        severity: 'error',
      });
    }
    throw error;
  }

  return parseAndValidateSession(raw, resolvedPath.path.rootPath, input.sessionId, resolvedPath.path.relativePath);
}

/**
 * updateCreativeSessionInStore 함수.
 * 기존 session을 명시적으로 load하고 updater 결과를 schema/workspace 검증 후 atomic rename으로 저장함.
 */
export async function updateCreativeSessionInStore(input: UpdateCreativeSessionInput): Promise<CreativeSessionStoreResult> {
  const loaded = await loadCreativeSessionFromStore({ sessionId: input.sessionId, workspaceRoot: input.workspaceRoot });
  if (loaded.status !== 'ok' || !loaded.data?.session) return loaded;

  const resolvedPath = await resolveCreativeSessionPath(input.workspaceRoot, input.sessionId);
  if (!resolvedPath.ok) return createSessionStoreError(resolvedPath.diagnostic);

  const updated = input.update(loaded.data.session);
  const validationDiagnostic = validateLoadedSessionShape(updated, resolvedPath.path.rootPath, input.sessionId, resolvedPath.path.relativePath);
  if (validationDiagnostic) return createSessionStoreError(validationDiagnostic);

  await writeJsonAtomically(resolvedPath.path.absolutePath, updated, { rejectIfExists: false });
  return createDiagnosticEnvelope({ data: { relativePath: resolvedPath.path.relativePath, session: updated }, diagnostics: [], status: 'ok', tool: TOOL_NAME });
}

/**
 * getCreativeSessionRelativePath 함수.
 * Tests and future resource handlers can reference the deterministic metadata path.
 */
export function getCreativeSessionRelativePath(sessionId: string): string {
  return `${CREATIVE_SESSION_METADATA_DIR}/${sessionId}.json`;
}

async function resolveCreativeSessionPath(
  workspaceRoot: string,
  sessionId: string,
): Promise<{ ok: true; path: ResolvedCreativeSessionPath } | { diagnostic: WorkbenchDiagnostic; ok: false }> {
  const sessionIdDiagnostic = validateSessionId(sessionId);
  if (sessionIdDiagnostic) return { diagnostic: sessionIdDiagnostic, ok: false };

  let rootPath: string;
  try {
    rootPath = await realpath(workspaceRoot);
  } catch {
    return {
      diagnostic: {
        category: 'creative-session',
        id: 'CREATIVE_WORKSPACE_ROOT_UNAVAILABLE',
        message: 'Creative session workspace root is unavailable.',
        path: null,
        ruleId: 'creative-session.workspace-root',
        severity: 'error',
      },
      ok: false,
    };
  }

  const relativePath = getCreativeSessionRelativePath(sessionId);
  const absolutePath = path.resolve(rootPath, relativePath);
  const relativeFromRoot = path.relative(rootPath, absolutePath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    return {
      diagnostic: {
        category: 'creative-session',
        id: 'CREATIVE_SESSION_ID_UNSAFE',
        message: 'Creative session id resolves outside the workspace metadata directory.',
        path: null,
        ruleId: 'creative-session.session-id-safe',
        severity: 'error',
      },
      ok: false,
    };
  }

  return { ok: true, path: { absolutePath, relativePath, rootPath } };
}

function validateSessionId(sessionId: string): WorkbenchDiagnostic | null {
  if (!SAFE_SESSION_ID_PATTERN.test(sessionId) || sessionId === '.' || sessionId === '..' || sessionId.includes('/') || sessionId.includes('\\')) {
    return {
      category: 'creative-session',
      id: 'CREATIVE_SESSION_ID_UNSAFE',
      message: 'Creative session id must be 1-128 chars of letters, numbers, dot, underscore, colon, or dash and cannot contain path separators.',
      path: null,
      ruleId: 'creative-session.session-id-safe',
      severity: 'error',
    };
  }

  return null;
}

function parseAndValidateSession(raw: string, workspaceRoot: string, sessionId: string, relativePath: string): CreativeSessionStoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return createSessionStoreError({
      category: 'creative-session',
      id: 'CREATIVE_SESSION_JSON_MALFORMED',
      message: 'Creative session JSON is malformed.',
      path: relativePath,
      ruleId: 'creative-session.json-parse',
      severity: 'error',
    });
  }

  const validationDiagnostic = validateLoadedSessionShape(parsed, workspaceRoot, sessionId, relativePath);
  if (validationDiagnostic) return createSessionStoreError(validationDiagnostic);

  return createDiagnosticEnvelope({ data: { relativePath, session: parsed as CreativeSessionSchema }, diagnostics: [], status: 'ok', tool: TOOL_NAME });
}

function validateLoadedSessionShape(candidate: unknown, workspaceRoot: string, sessionId: string, relativePath: string): WorkbenchDiagnostic | null {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', 'Creative session payload must be a JSON object.', relativePath);
  }

  const session = candidate as Record<string, unknown>;
  if (session.schemaVersion !== CREATIVE_SCHEMA_VERSION) {
    const version = typeof session.schemaVersion === 'string' ? session.schemaVersion : '<missing>';
    const validation = validateCreativeSessionSchema({ schemaVersion: version });
    if (!validation.valid) {
      return createSchemaDiagnostic(validation.errorCode, validation.message, relativePath);
    }
  }

  if (session.workspaceRoot !== workspaceRoot) {
    return {
      category: 'creative-session',
      id: 'CREATIVE_WORKSPACE_MISMATCH',
      message: 'Creative session belongs to a different workspace.',
      path: relativePath,
      ruleId: 'creative-session.workspace-match',
      severity: 'error',
    };
  }

  if (session.schema !== 'risuai-workbench-mcp.creative.session' || session.sessionId !== sessionId) {
    return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', 'Creative session schema marker or session id does not match the requested session.', relativePath);
  }

  const requiredStrings = ['createdAt', 'updatedAt', 'title', 'status'];
  for (const field of requiredStrings) {
    if (typeof session[field] !== 'string') {
      return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', `Creative session field ${field} must be a string.`, relativePath);
    }
  }

  if (!['active', 'completed', 'abandoned'].includes(session.status as string)) {
    return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', 'Creative session status is not supported.', relativePath);
  }

  for (const field of ['sourceInputs', 'ideas', 'patchPlanRefs']) {
    if (!Array.isArray(session[field])) {
      return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', `Creative session field ${field} must be an array.`, relativePath);
    }
  }

  if (session.rankings === null || typeof session.rankings !== 'object' || Array.isArray(session.rankings)) {
    return createSchemaDiagnostic('CREATIVE_SESSION_SCHEMA_INVALID', 'Creative session rankings must be an object.', relativePath);
  }

  return null;
}

function createSchemaDiagnostic(id: string, message: string, relativePath: string): WorkbenchDiagnostic {
  return {
    category: 'creative-session',
    id,
    message,
    path: relativePath,
    ruleId: 'creative-session.schema',
    severity: 'error',
  };
}

function createSessionStoreError(diagnostic: WorkbenchDiagnostic): CreativeSessionStoreResult {
  return createDiagnosticEnvelope({ diagnostics: [diagnostic], status: 'domain_error', tool: TOOL_NAME });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? false : Promise.reject(error);
  }
}

async function writeJsonAtomically(filePath: string, payload: CreativeSessionSchema, options: { rejectIfExists: boolean }): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  if (options.rejectIfExists) {
    try {
      await link(tempPath, filePath);
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }
    return;
  }

  await rename(tempPath, filePath);
}
