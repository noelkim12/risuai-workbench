import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';

import {
  listRisuLuaSourceModules,
  validateRisuLuaModuleId,
  type RisuLuaModuleMap,
} from '@risuai-workbench/core/node';

import type { ContextStore } from '../../context/context-store';
import type { WorkspaceRootStatus } from '../../project/resolve-root';
import {
  runtimeContextPayloadSchema,
  type RuntimeSource,
} from '../../actions/schemas/runtime-schemas';

const MAX_INLINE_BYTES = 128 * 1024;
const MAX_MODULE_BYTES = 2 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 8;
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface RuntimeSourceMetrics {
  readonly sourceResolutionMs: number;
  readonly moduleCount: number;
  readonly bundleBytes: number;
  readonly cache: 'hit' | 'miss' | 'partial' | 'not-applicable';
  readonly modulesRead: number;
}

interface CachedFile {
  readonly mtimeMs: number;
  readonly size: number;
  readonly source: string;
}

interface WorkspaceCacheEntry {
  readonly touchedAt: number;
  readonly files: Readonly<Record<string, CachedFile>>;
  readonly moduleMap: RisuLuaModuleMap;
}

const workspaceCache = new Map<string, WorkspaceCacheEntry>();
const sourceMetrics = new WeakMap<RisuLuaModuleMap, RuntimeSourceMetrics>();

export interface RuntimeSourceResolutionContext {
  workspace: WorkspaceRootStatus;
  contextStore?: ContextStore;
}

export async function resolveRuntimeSource(
  source: RuntimeSource,
  context: RuntimeSourceResolutionContext,
): Promise<RisuLuaModuleMap> {
  const startedAt = performance.now();
  const resolved = source.kind === 'inline'
    ? { moduleMap: resolveInline(source), cache: 'not-applicable' as const, modulesRead: 0 }
    : source.kind === 'context'
      ? { moduleMap: resolveContext(source, context.contextStore), cache: 'not-applicable' as const, modulesRead: 0 }
      : resolveWorkspace(source, context.workspace);
  sourceMetrics.set(resolved.moduleMap, {
    sourceResolutionMs: performance.now() - startedAt,
    moduleCount: Object.keys(resolved.moduleMap.modules).length,
    bundleBytes: Object.values(resolved.moduleMap.modules)
      .reduce((total, moduleSource) => total + Buffer.byteLength(moduleSource, 'utf8'), 0),
    cache: resolved.cache,
    modulesRead: resolved.modulesRead,
  });
  return resolved.moduleMap;
}

export function getRuntimeSourceMetrics(moduleMap: RisuLuaModuleMap): RuntimeSourceMetrics | undefined {
  return sourceMetrics.get(moduleMap);
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
): { readonly moduleMap: RisuLuaModuleMap; readonly cache: 'hit' | 'miss' | 'partial'; readonly modulesRead: number } {
  if (!workspace.ok) throw new Error(`RisuLua workspace is unavailable: ${workspace.reason}`);
  const workspaceRoot = fs.realpathSync(workspace.path);
  const cacheKey = `${workspaceRoot}\0${source.form}\0${source.entryModuleId ?? ''}`;
  const cached = workspaceCache.get(cacheKey);
  if (cached && Date.now() - cached.touchedAt > CACHE_TTL_MS) workspaceCache.delete(cacheKey);
  const activeCache = workspaceCache.get(cacheKey);
  if (source.form === 'canonical') {
    const sourceRoot = path.join(workspaceRoot, 'lua');
    if (!fs.existsSync(sourceRoot)) throw new Error('Canonical RisuLua lua directory is missing');
    const realSourceRoot = fs.realpathSync(sourceRoot);
    assertInside(workspaceRoot, realSourceRoot, 'Canonical RisuLua source root');
    const modules: Record<string, string> = {};
    const files: Record<string, CachedFile> = {};
    let modulesRead = 0;
    for (const module of listRisuLuaSourceModules(realSourceRoot)) {
      const realFile = fs.realpathSync(module.filePath);
      assertInside(realSourceRoot, realFile, `RisuLua module ${module.id}`);
      validateRisuLuaModuleId(module.id);
      const stat = fs.statSync(realFile);
      const cachedFile = activeCache?.files[module.id];
      const reused = cachedFile !== undefined && cachedFile.mtimeMs === stat.mtimeMs && cachedFile.size === stat.size;
      const moduleSource = reused
        ? cachedFile.source
        : fs.readFileSync(realFile, 'utf8');
      if (!reused) modulesRead += 1;
      modules[module.id] = moduleSource;
      files[module.id] = { mtimeMs: stat.mtimeMs, size: stat.size, source: moduleSource };
    }
    const moduleMap = validateBundle({
      entryModuleId: source.entryModuleId ?? 'main',
      modules,
    });
    storeWorkspaceCache(cacheKey, { touchedAt: Date.now(), files, moduleMap });
    const moduleSetChanged = activeCache !== undefined
      && Object.keys(activeCache.files).length !== Object.keys(files).length;
    return {
      moduleMap,
      cache: !activeCache ? 'miss' : modulesRead === 0 && !moduleSetChanged ? 'hit' : 'partial',
      modulesRead,
    };
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
  const stat = fs.statSync(realDistFile);
  const cachedFile = activeCache?.files.__dist;
  const reused = cachedFile !== undefined && cachedFile.mtimeMs === stat.mtimeMs && cachedFile.size === stat.size;
  const distSource = reused
    ? cachedFile.source
    : fs.readFileSync(realDistFile, 'utf8');
  const modulesRead = reused ? 0 : 1;
  const moduleMap = validateBundle({
    entryModuleId: '__dist',
    modules: { __dist: distSource },
  });
  storeWorkspaceCache(cacheKey, {
    touchedAt: Date.now(),
    files: { __dist: { mtimeMs: stat.mtimeMs, size: stat.size, source: distSource } },
    moduleMap,
  });
  return {
    moduleMap,
    cache: !activeCache ? 'miss' : modulesRead === 0 ? 'hit' : 'partial',
    modulesRead,
  };
}

function storeWorkspaceCache(key: string, entry: WorkspaceCacheEntry): void {
  workspaceCache.delete(key);
  workspaceCache.set(key, entry);
  while (workspaceCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = workspaceCache.keys().next().value;
    if (oldestKey === undefined) break;
    workspaceCache.delete(oldestKey);
  }
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
