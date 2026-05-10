import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const RISULUA_RECOVERY_SCHEMA = 'risulua.bundle-recovery';
export const RISULUA_RECOVERY_VERSION = 1;
export const RISULUA_RECOVERY_BLOCK_START = '--[=[#risulua-bundle-manifest-v1';
export const RISULUA_RECOVERY_BLOCK_END = ']=]';

const RECOVERY_BLOCK_PATTERN = /--\[=\[#risulua-bundle-manifest-v1\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n\]=\]\r?\n?/;
const RECOVERY_ROOT_NAMES = ['docs', 'legacy', 'lua'] as const;
const RECOVERY_ROOTS = ['docs/', 'legacy/', 'lua/'] as const;
const GZIP_MTIME_START = 4;
const GZIP_MTIME_END = 8;
const GZIP_OS_BYTE = 9;
const GZIP_UNKNOWN_OS = 255;

export interface RisuLuaRecoveryFile {
  path: string;
  content: string;
  sha256: string;
}

export interface RisuLuaRecoveryManifest {
  schema: typeof RISULUA_RECOVERY_SCHEMA;
  version: typeof RISULUA_RECOVERY_VERSION;
  mode: 'full-source';
  files: RisuLuaRecoveryFile[];
}

export interface DecodedRisuLuaRecoveryBlock {
  manifest: RisuLuaRecoveryManifest;
  encoded: string;
  block: string;
}

export class RisuLuaRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RisuLuaRecoveryError';
  }
}

export function encodeRisuLuaRecoveryBlock(manifest: RisuLuaRecoveryManifest): string {
  const json = JSON.stringify(sortManifest(parseRecoveryManifest(manifest)));
  const compressed = gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  compressed.fill(0, GZIP_MTIME_START, GZIP_MTIME_END);
  compressed[GZIP_OS_BYTE] = GZIP_UNKNOWN_OS;
  const encoded = compressed.toString('base64');
  return `${RISULUA_RECOVERY_BLOCK_START}\n${encoded}\n${RISULUA_RECOVERY_BLOCK_END}\n`;
}

export function decodeRisuLuaRecoveryBlock(code: string): DecodedRisuLuaRecoveryBlock | null {
  const match = RECOVERY_BLOCK_PATTERN.exec(code);
  if (!match) return null;

  try {
    const encoded = match[1].replace(/\s+/g, '');
    const json = gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
    const manifest = parseRecoveryManifest(JSON.parse(json));
    return { manifest, encoded, block: match[0] };
  } catch (error) {
    if (error instanceof RisuLuaRecoveryError) throw error;
    throw new RisuLuaRecoveryError(`Invalid recovery manifest block: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function removeRisuLuaRecoveryBlock(code: string): string {
  return code.replace(RECOVERY_BLOCK_PATTERN, '');
}

export function collectRisuLuaRecoveryFiles(options: { rootDir: string }): RisuLuaRecoveryFile[] {
  const files: RisuLuaRecoveryFile[] = [];
  for (const rootName of RECOVERY_ROOT_NAMES) {
    const absoluteRoot = path.join(options.rootDir, rootName);
    if (!fs.existsSync(absoluteRoot)) continue;

    for (const absolutePath of listFilesRecursive(absoluteRoot)) {
      const relativePath = toPosix(path.relative(options.rootDir, absolutePath));
      if (!isAllowedRecoveryPath(relativePath)) continue;

      const content = fs.readFileSync(absolutePath, 'utf8');
      files.push({ path: relativePath, content, sha256: sha256(content) });
    }
  }
  return files.sort(compareRecoveryFiles);
}

export function createRisuLuaRecoveryManifest(options: { rootDir: string }): RisuLuaRecoveryManifest {
  return {
    schema: RISULUA_RECOVERY_SCHEMA,
    version: RISULUA_RECOVERY_VERSION,
    mode: 'full-source',
    files: collectRisuLuaRecoveryFiles(options),
  };
}

export function restoreRisuLuaRecoveryFiles(options: {
  outputRoot: string;
  files: readonly RisuLuaRecoveryFile[];
}): void {
  const outputRoot = path.resolve(options.outputRoot);
  for (const file of options.files) {
    assertSafeRecoveryPath(file.path);
    assertSafeOutputTarget(outputRoot, file.path);
    const actualHash = sha256(file.content);
    if (actualHash !== file.sha256) {
      throw new RisuLuaRecoveryError(`Recovery file hash mismatch for ${file.path}`);
    }
  }

  for (const rootName of RECOVERY_ROOT_NAMES) {
    fs.rmSync(path.join(outputRoot, rootName), { recursive: true, force: true });
  }

  for (const file of options.files) {
    const targetPath = path.join(outputRoot, ...file.path.split('/'));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, file.content, 'utf8');
  }
}

function parseRecoveryManifest(value: unknown): RisuLuaRecoveryManifest {
  if (!isRecord(value)) throw new RisuLuaRecoveryError('Recovery manifest must be an object');
  if (value.schema !== RISULUA_RECOVERY_SCHEMA) throw new RisuLuaRecoveryError('Unsupported recovery manifest schema');
  if (value.version !== RISULUA_RECOVERY_VERSION) throw new RisuLuaRecoveryError('Unsupported recovery manifest version');
  if (value.mode !== 'full-source') throw new RisuLuaRecoveryError('Unsupported recovery manifest mode');
  if (!Array.isArray(value.files)) throw new RisuLuaRecoveryError('Recovery manifest files must be an array');
  const files = value.files.map((file) => parseRecoveryFile(file));
  return { schema: RISULUA_RECOVERY_SCHEMA, version: RISULUA_RECOVERY_VERSION, mode: 'full-source', files };
}

function parseRecoveryFile(value: unknown): RisuLuaRecoveryFile {
  if (!isRecord(value)) throw new RisuLuaRecoveryError('Recovery file entry must be an object');

  const filePath = value.path;
  const content = value.content;
  const hash = value.sha256;
  if (typeof filePath !== 'string') throw new RisuLuaRecoveryError('Recovery file path must be a string');
  if (typeof content !== 'string') throw new RisuLuaRecoveryError(`Recovery file content must be a string: ${filePath}`);
  if (typeof hash !== 'string') throw new RisuLuaRecoveryError(`Recovery file sha256 must be a string: ${filePath}`);
  assertSafeRecoveryPath(filePath);
  return { path: filePath, content, sha256: hash };
}

function sortManifest(manifest: RisuLuaRecoveryManifest): RisuLuaRecoveryManifest {
  return {
    schema: manifest.schema,
    version: manifest.version,
    mode: manifest.mode,
    files: [...manifest.files]
      .sort(compareRecoveryFiles)
      .map((file) => ({ path: file.path, content: file.content, sha256: file.sha256 })),
  };
}

function compareRecoveryFiles(left: RisuLuaRecoveryFile, right: RisuLuaRecoveryFile): number {
  return left.path.localeCompare(right.path);
}

function assertSafeRecoveryPath(filePath: string): void {
  if (!isAllowedRecoveryPath(filePath)) {
    throw new RisuLuaRecoveryError(`Unsafe recovery path: ${filePath}`);
  }
}

function isAllowedRecoveryPath(filePath: string): boolean {
  if (filePath.length === 0) return false;
  if (filePath.endsWith('/')) return false;
  if (path.isAbsolute(filePath) || filePath.includes('\\')) return false;

  const normalized = path.posix.normalize(filePath);
  if (normalized !== filePath || normalized.startsWith('../') || normalized === '..') return false;
  return RECOVERY_ROOTS.some((root) => filePath.startsWith(root));
}

function assertSafeOutputTarget(outputRoot: string, filePath: string): void {
  const targetPath = path.resolve(outputRoot, ...filePath.split('/'));
  const relative = path.relative(outputRoot, targetPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new RisuLuaRecoveryError(`Unsafe recovery output path: ${filePath}`);
  }
}

function listFilesRecursive(dir: string): string[] {
  const result: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFilesRecursive(absolutePath));
    } else if (entry.isFile()) {
      result.push(absolutePath);
    }
  }
  return result;
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
