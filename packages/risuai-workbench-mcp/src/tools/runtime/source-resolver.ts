import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import {
  listRisuLuaSourceModules,
  validateRisuLuaModuleId,
  type RisuLuaModuleMap,
} from 'risu-workbench-core/node';

import type { ContextStore } from '../../context/context-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import {
  runtimeContextPayloadSchema,
  type RuntimeSource,
} from '../../actions/schemas/runtime-schemas';

const MAX_INLINE_BYTES = 128 * 1024;
const MAX_MODULE_BYTES = 2 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

export interface RuntimeSourceResolutionContext {
  workspace: WorkspaceRootStatus;
  contextStore?: ContextStore;
}

export async function resolveRuntimeSource(
  source: RuntimeSource,
  context: RuntimeSourceResolutionContext,
): Promise<RisuLuaModuleMap> {
  if (source.kind === 'inline') return resolveInline(source);
  if (source.kind === 'context') return resolveContext(source, context.contextStore);
  return resolveWorkspace(source, context.workspace);
}

function resolveInline(source: Extract<RuntimeSource, { kind: 'inline' }>): RisuLuaModuleMap {
  validateRisuLuaModuleId(source.moduleId);
  if (Buffer.byteLength(source.source, 'utf8') > MAX_INLINE_BYTES) {
    throw new Error('Inline RisuLua source exceeds 128 KiB; use workbench.context instead');
  }
  return { entryModuleId: source.moduleId, modules: { [source.moduleId]: source.source } };
}

function resolveContext(
  source: Extract<RuntimeSource, { kind: 'context' }>,
  contextStore: ContextStore | undefined,
): RisuLuaModuleMap {
  if (!contextStore) throw new Error('RisuLua context source requires an active ContextStore');
  const record = contextStore.read(source.contextId, true);
  if (!record) throw new Error(`RisuLua source context not found: ${source.contextId}`);
  const parsed = runtimeContextPayloadSchema.safeParse(record.payload);
  if (!parsed.success) throw new Error(`Invalid RisuLua context payload: ${parsed.error.message}`);
  return validateBundle({
    entryModuleId: source.entryModuleId ?? parsed.data.entry,
    modules: parsed.data.modules,
  });
}

function resolveWorkspace(
  source: Extract<RuntimeSource, { kind: 'workspace' }>,
  workspace: WorkspaceRootStatus,
): RisuLuaModuleMap {
  if (!workspace.ok) throw new Error(`RisuLua workspace is unavailable: ${workspace.reason}`);
  const workspaceRoot = fs.realpathSync(workspace.path);
  if (source.form === 'canonical') {
    const sourceRoot = path.join(workspaceRoot, 'lua');
    if (!fs.existsSync(sourceRoot)) throw new Error('Canonical RisuLua lua directory is missing');
    const realSourceRoot = fs.realpathSync(sourceRoot);
    assertInside(workspaceRoot, realSourceRoot, 'Canonical RisuLua source root');
    const modules: Record<string, string> = {};
    for (const module of listRisuLuaSourceModules(realSourceRoot)) {
      const realFile = fs.realpathSync(module.filePath);
      assertInside(realSourceRoot, realFile, `RisuLua module ${module.id}`);
      validateRisuLuaModuleId(module.id);
      modules[module.id] = fs.readFileSync(realFile, 'utf8');
    }
    return validateBundle({
      entryModuleId: source.entryModuleId ?? 'main',
      modules,
    });
  }

  if (source.entryModuleId && source.entryModuleId !== '__dist') {
    throw new Error('Dist runtime source entryModuleId must be __dist');
  }
  const distRoot = path.join(workspaceRoot, 'dist');
  if (!fs.existsSync(distRoot)) throw new Error('RisuLua dist output is missing');
  const realDistRoot = fs.realpathSync(distRoot);
  assertInside(workspaceRoot, realDistRoot, 'RisuLua dist root');
  const distFiles = fs.readdirSync(realDistRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.risulua'))
    .map((entry) => path.join(realDistRoot, entry.name))
    .sort();
  if (distFiles.length === 0) throw new Error('RisuLua dist output is missing');
  if (distFiles.length > 1) throw new Error('Multiple RisuLua dist outputs found; keep one generated target');
  const realDistFile = fs.realpathSync(distFiles[0]);
  assertInside(realDistRoot, realDistFile, 'RisuLua dist file');
  return validateBundle({
    entryModuleId: '__dist',
    modules: { __dist: fs.readFileSync(realDistFile, 'utf8') },
  });
}

function validateBundle(moduleMap: RisuLuaModuleMap): RisuLuaModuleMap {
  validateRisuLuaModuleId(moduleMap.entryModuleId);
  let bundleBytes = 0;
  const modules: Record<string, string> = {};
  for (const [moduleId, source] of Object.entries(moduleMap.modules)) {
    validateRisuLuaModuleId(moduleId);
    const bytes = Buffer.byteLength(source, 'utf8');
    if (bytes > MAX_MODULE_BYTES) throw new Error(`RisuLua module exceeds 2 MiB: ${moduleId}`);
    bundleBytes += bytes;
    if (bundleBytes > MAX_BUNDLE_BYTES) throw new Error('RisuLua module bundle exceeds 8 MiB');
    modules[moduleId] = source;
  }
  if (!(moduleMap.entryModuleId in modules)) {
    throw new Error(`RisuLua entry module is missing: ${moduleMap.entryModuleId}`);
  }
  return { entryModuleId: moduleMap.entryModuleId, modules };
}

function assertInside(root: string, candidate: string, label: string): void {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the configured workspace`);
  }
}
