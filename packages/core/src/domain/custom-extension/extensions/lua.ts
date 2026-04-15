import type { CustomExtensionTarget } from '../contracts';

/**
 * Canonical Lua triggerscript content — raw Lua source string.
 * .risulua files contain the entire triggerscript for a charx/module as a single blob.
 * Per spec: function-level splitting is NOT performed; the entire triggerscript is preserved.
 */
export type LuaContent = string;

/**
 * Supported targets for .risulua artifacts.
 * Per spec: charx and module only. Preset is explicitly excluded.
 */
const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['charx', 'module'];

/** Error thrown when Lua adapter operations encounter unsupported targets or duplicate sources. */
export class LuaAdapterError extends Error {
  constructor(message: string) {
    super(`[risulua] ${message}`);
    this.name = 'LuaAdapterError';
  }
}

/**
 * Validates that the target supports .risulua artifacts.
 * Per spec, preset must fail clearly.
 */
function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new LuaAdapterError(
      `Target "${target}" does not support .risulua. Only charx and module are supported.`
    );
  }
}

/**
 * Parse raw file content into canonical Lua format.
 * This is a lossless identity transform — the content is preserved exactly.
 *
 * @param rawContent - The raw file content as read from disk
 * @returns The canonical Lua content (the string itself)
 */
export function parseLuaContent(rawContent: string): LuaContent {
  // Preserve exact content including empty strings, whitespace, comments
  // No trimming, no normalization, no transformation
  return rawContent;
}

/**
 * Serialize canonical Lua content to raw file content.
 * This is a lossless identity transform — the content is written exactly as-is.
 *
 * @param content - The canonical Lua content
 * @returns The raw file content to write to disk
 */
export function serializeLuaContent(content: LuaContent): string {
  // Preserve exact content including empty strings
  return content;
}

/** Source identifier for Lua content origin. */
export interface LuaSource {
  /** Target type (charx or module) */
  target: CustomExtensionTarget;
  /** Source path or identifier */
  source: string;
}

/**
 * Validates that there is exactly one Lua source.
 * Per spec: duplicate .risulua files must fail deterministically.
 *
 * @param sources - Array of Lua sources with their content
 * @returns The single valid source
 * @throws LuaAdapterError if zero or multiple sources provided
 */
export function resolveDuplicateLuaSources(
  sources: Array<LuaSource & { content: LuaContent }>
): LuaSource & { content: LuaContent } {
  if (sources.length === 0) {
    throw new LuaAdapterError('No Lua sources provided');
  }

  if (sources.length === 1) {
    return sources[0];
  }

  // Multiple .risulua files detected — this is a violation of the one-file-per-target rule
  const paths = sources.map((s) => `"${s.source}"`).join(', ');
  throw new LuaAdapterError(
    `Duplicate .risulua sources detected: multiple files found (${paths}). ` +
      'Only one .risulua file per target is allowed. '
  );
}

/**
 * Extract Lua triggerscript content from upstream charx format.
 * Per spec: reads from `triggerscript` field.
 *
 * @param upstream - The upstream charx data
 * @param target - Must be 'charx'
 * @returns The Lua content, or null if not present
 */
export function extractLuaFromCharx(
  upstream: { triggerscript?: string },
  target: CustomExtensionTarget
): LuaContent | null {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new LuaAdapterError(`Expected target "charx", got "${target}"`);
  }

  const content = upstream.triggerscript;
  if (content === undefined || content === null) {
    return null;
  }

  return parseLuaContent(content);
}

/**
 * Extract Lua triggerscript content from upstream module format.
 * Per spec: reads from `triggerscript` field.
 *
 * @param upstream - The upstream module data
 * @param target - Must be 'module'
 * @returns The Lua content, or null if not present
 */
export function extractLuaFromModule(
  upstream: { triggerscript?: string },
  target: CustomExtensionTarget
): LuaContent | null {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new LuaAdapterError(`Expected target "module", got "${target}"`);
  }

  const content = upstream.triggerscript;
  if (content === undefined || content === null) {
    return null;
  }

  return parseLuaContent(content);
}

/**
 * Inject Lua triggerscript content into upstream charx format.
 * Per spec: writes to `triggerscript` field.
 *
 * @param upstream - The upstream charx data to mutate
 * @param content - The canonical Lua content
 * @param target - Must be 'charx'
 */
export function injectLuaIntoCharx(
  upstream: { triggerscript?: string },
  content: LuaContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new LuaAdapterError(`Expected target "charx", got "${target}"`);
  }

  if (content === null) {
    delete upstream.triggerscript;
  } else {
    upstream.triggerscript = serializeLuaContent(content);
  }
}

/**
 * Inject Lua triggerscript content into upstream module format.
 * Per spec: writes to `triggerscript` field.
 *
 * @param upstream - The upstream module data to mutate
 * @param content - The canonical Lua content
 * @param target - Must be 'module'
 */
export function injectLuaIntoModule(
  upstream: { triggerscript?: string },
  content: LuaContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new LuaAdapterError(`Expected target "module", got "${target}"`);
  }

  if (content === null) {
    delete upstream.triggerscript;
  } else {
    upstream.triggerscript = serializeLuaContent(content);
  }
}

/**
 * Build the canonical file path for a .risulua artifact.
 * Per spec:
 * - Charx: lua/${charxName}.risulua
 * - Module: lua/${moduleName}.risulua
 *
 * Uses target name for naming, NOT inferred function names.
 *
 * @param target - 'charx' or 'module'
 * @param targetName - Charx or module name
 * @returns The canonical relative path
 */
export function buildLuaPath(target: CustomExtensionTarget, targetName: string): string {
  assertSupportedTarget(target);

  if (!targetName || targetName.length === 0) {
    throw new LuaAdapterError(`${target} target requires targetName for Lua path`);
  }

  // Sanitize filename to prevent path traversal while preserving Korean characters
  const sanitized = targetName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  return `lua/${sanitized}.risulua`;
}
