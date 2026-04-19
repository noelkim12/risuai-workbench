import type { CustomExtensionTarget } from '../contracts';

/**
 * Canonical variable content — key-value mapping.
 * .risuvar files contain line-based key=value pairs.
 * Per spec: first `=` only split, whitespace-sensitive value preservation.
 */
export type VariableContent = Record<string, string>;

/**
 * Supported targets for .risuvar artifacts.
 * Per spec: charx and module only. Preset is explicitly excluded.
 */
const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['charx', 'module'];

/** Error thrown when variable adapter operations encounter unsupported targets or duplicate sources. */
export class VariableAdapterError extends Error {
  constructor(message: string) {
    super(`[risuvar] ${message}`);
    this.name = 'VariableAdapterError';
  }
}

/**
 * Validates that the target supports .risuvar artifacts.
 * Per spec, preset must fail clearly.
 */
function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new VariableAdapterError(
      `Target "${target}" does not support .risuvar. Only charx and module are supported.`
    );
  }
}

/**
 * Parse raw .risuvar file content into canonical variable format.
 * Follows upstream `parseDefaultVariablesText` semantics exactly:
 * - First `=` only split (key=a=b → key='key', value='a=b')
 * - Empty lines skipped (trim-based)
 * - Lines without `=` get empty value
 * - Both \r\n and \n line separators supported
 * - Trim applied to whole line only — key/value internal whitespace preserved
 *
 * @param rawContent - The raw file content as read from disk
 * @returns The canonical variable content as key-value mapping
 */
export function parseVariableContent(rawContent: string): VariableContent {
  const variables: Record<string, string> = {};

  // Handle empty/whitespace-only content
  if (!rawContent.trim()) {
    return variables;
  }

  for (const line of rawContent.split(/\r?\n/)) {
    // Empty lines are skipped (trim-based check per spec)
    if (!line.trim()) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) {
      // No `=` in line: key gets empty value
      variables[line] = '';
      continue;
    }

    // First `=` only split — value can contain additional `=` characters
    const key = line.slice(0, eqIdx);
    const value = line.slice(eqIdx + 1);
    variables[key] = value;
  }

  return variables;
}

/**
 * Serialize canonical variable content to raw .risuvar file content.
 * Each key=value pair on its own line, joined by \n.
 * Empty values are preserved as `key=`.
 *
 * @param content - The canonical variable content
 * @returns The raw file content to write to disk
 */
export function serializeVariableContent(content: VariableContent): string {
  const entries = Object.entries(content);

  if (entries.length === 0) {
    return '';
  }

  return entries.map(([key, value]) => `${key}=${value}`).join('\n');
}

/** Source identifier for variable content origin. */
export interface VariableSource {
  /** Target type (charx or module) */
  target: CustomExtensionTarget;
  /** Source path or identifier */
  source: string;
}

/**
 * Validates that there is exactly one variable source.
 * Per spec: duplicate variable sources must fail deterministically.
 *
 * @param sources - Array of variable sources with their content
 * @returns The single valid source
 * @throws VariableAdapterError if zero or multiple sources provided
 */
export function resolveDuplicateVariableSources(
  sources: Array<VariableSource & { content: VariableContent }>
): VariableSource & { content: VariableContent } {
  if (sources.length === 0) {
    throw new VariableAdapterError('No variable sources provided');
  }

  if (sources.length === 1) {
    return sources[0];
  }

  // Separate file sources from metadata sources for clearer error messages
  const fileSources = sources.filter((s) => s.source.endsWith('.risuvar'));
  const metadataSources = sources.filter((s) => !s.source.endsWith('.risuvar'));

  if (fileSources.length > 1) {
    const paths = fileSources.map((s) => `"${s.source}"`).join(', ');
    throw new VariableAdapterError(
      `Duplicate variable sources detected: multiple .risuvar files found (${paths}). ` +
        'Only one .risuvar file per target is allowed.'
    );
  }

  if (metadataSources.length > 1) {
    const paths = metadataSources.map((s) => `"${s.source}"`).join(', ');
    throw new VariableAdapterError(
      `Duplicate variable sources detected: multiple metadata variable fields found (${paths}). ` +
        'Only one variable source per target is allowed.'
    );
  }

  // Mixed source types (file + metadata) is also a duplicate
  if (fileSources.length === 1 && metadataSources.length === 1) {
    throw new VariableAdapterError(
      `Duplicate variable sources detected: both file "${fileSources[0].source}" ` +
        `and metadata "${metadataSources[0].source}" found. ` +
        'Only one variable source per target is allowed.'
    );
  }

  // Fallback — should not reach here if logic is correct
  const allSources = sources.map((s) => `"${s.source}"`).join(', ');
  throw new VariableAdapterError(
    `Duplicate variable sources detected (${allSources}). Only one variable source per target is allowed.`
  );
}

/**
 * Extract variable content from upstream charx format.
 * Per spec: reads from `data.extensions.risuai.defaultVariables` field.
 * Note: In charx, defaultVariables is stored as a string (newline-separated key=value pairs),
 * not as a Record<string, string> object.
 *
 * @param upstream - The upstream charx data
 * @param target - Must be 'charx'
 * @returns The variable content, or null if not present
 */
export function extractVariablesFromCharx(
  upstream: { data?: { extensions?: { risuai?: { defaultVariables?: unknown } } } },
  target: CustomExtensionTarget
): VariableContent | null {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new VariableAdapterError(`Expected target "charx", got "${target}"`);
  }

  const variables = upstream.data?.extensions?.risuai?.defaultVariables;
  if (variables === undefined || variables === null) {
    return null;
  }

  // In charx, defaultVariables is stored as a string (newline-separated key=value pairs)
  // Parse it using the same logic as parseVariableContent
  if (typeof variables === 'string') {
    return parseVariableContent(variables);
  }

  // Fallback: if it's already an object (for backward compatibility), normalize it
  if (typeof variables === 'object' && variables !== null && !Array.isArray(variables)) {
    return normalizeVariableRecord(variables as Record<string, unknown>);
  }

  throw new VariableAdapterError(
    `Expected defaultVariables to be a string or object, got ${typeof variables}`
  );
}

/**
 * Extract variable content from upstream module format.
 * Per spec: reads from module-level default variables (direct field).
 *
 * @param upstream - The upstream module data
 * @param target - Must be 'module'
 * @returns The variable content, or null if not present
 */
export function extractVariablesFromModule(
  upstream: { defaultVariables?: Record<string, string> },
  target: CustomExtensionTarget
): VariableContent | null {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new VariableAdapterError(`Expected target "module", got "${target}"`);
  }

  const variables = upstream.defaultVariables;
  if (variables === undefined || variables === null) {
    return null;
  }

  // Validate and normalize to Record<string, string>
  return normalizeVariableRecord(variables);
}

/**
 * Inject variable content into upstream charx format.
 * Per spec: writes to `extensions.risuai.defaultVariables` field.
 * Note: In charx, defaultVariables is stored as a string (newline-separated key=value pairs),
 * not as a Record<string, string> object.
 *
 * @param upstream - The upstream charx data to mutate
 * @param content - The canonical variable content
 * @param target - Must be 'charx'
 */
export function injectVariablesIntoCharx(
  upstream: { extensions?: { risuai?: { defaultVariables?: unknown } } },
  content: VariableContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new VariableAdapterError(`Expected target "charx", got "${target}"`);
  }

  // Ensure nested structure exists
  if (!upstream.extensions) {
    upstream.extensions = {};
  }
  if (!upstream.extensions.risuai) {
    upstream.extensions.risuai = {};
  }

  if (content === null) {
    delete upstream.extensions.risuai.defaultVariables;
  } else {
    // In charx, defaultVariables is stored as a string (newline-separated key=value pairs)
    upstream.extensions.risuai.defaultVariables = serializeVariableContent(content);
  }
}

/**
 * Inject variable content into upstream module format.
 * Per spec: writes to module-level defaultVariables field.
 *
 * @param upstream - The upstream module data to mutate
 * @param content - The canonical variable content
 * @param target - Must be 'module'
 */
export function injectVariablesIntoModule(
  upstream: { defaultVariables?: Record<string, string> },
  content: VariableContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new VariableAdapterError(`Expected target "module", got "${target}"`);
  }

  if (content === null) {
    delete upstream.defaultVariables;
  } else {
    upstream.defaultVariables = content;
  }
}

/**
 * Build the canonical file path for a .risuvar artifact.
 * Per spec:
 * - Charx: variables/${charxName}.risuvar
 * - Module: variables/${moduleName}.risuvar
 *
 * @param target - 'charx' or 'module'
 * @param targetName - Charx or module name
 * @returns The canonical relative path
 */
export function buildVariablePath(target: CustomExtensionTarget, targetName: string): string {
  assertSupportedTarget(target);

  if (!targetName || targetName.length === 0) {
    throw new VariableAdapterError(`${target} target requires targetName for variable path`);
  }

  // Sanitize filename to prevent path traversal while preserving Korean characters
  const sanitized = targetName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  return `variables/${sanitized}.risuvar`;
}

/**
 * Normalize a variable record to ensure all values are strings.
 * Non-string values are converted to strings.
 *
 * @param record - The input record to normalize
 * @returns Normalized Record<string, string>
 */
function normalizeVariableRecord(record: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    normalized[key] = typeof value === 'string' ? value : String(value);
  }

  return normalized;
}
