import type { CustomExtensionTarget } from '../contracts';

/**
 * Canonical toggle content — raw string DSL.
 * .risutoggle files contain custom toggle DSL (not CBS), preserved exactly as-is.
 */
export type ToggleContent = string;

export interface ToggleDefinition {
  name: string;
  globalVariableName: string;
  line: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Supported targets for .risutoggle artifacts.
 * Per spec: module and preset only. Charx is explicitly excluded.
 */
const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['module', 'preset'];

/** Error thrown when toggle operations encounter unsupported targets or duplicate sources. */
export class ToggleAdapterError extends Error {
  constructor(message: string) {
    super(`[risutoggle] ${message}`);
    this.name = 'ToggleAdapterError';
  }
}

/**
 * Validates that the target supports .risutoggle artifacts.
 * Per spec, charx must fail clearly.
 */
function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new ToggleAdapterError(
      `Target "${target}" does not support .risutoggle. Only module and preset are supported.`
    );
  }
}

/**
 * Parse raw file content into canonical toggle format.
 * This is a lossless identity transform — the content is preserved exactly.
 *
 * @param rawContent - The raw file content as read from disk
 * @returns The canonical toggle content (the string itself)
 */
export function parseToggleContent(rawContent: string): ToggleContent {
  // Preserve exact content including empty strings, multiline DSL, whitespace
  // No trimming, no normalization, no transformation
  return rawContent;
}

/**
 * parseToggleDefinitions 함수.
 * risutoggle DSL의 `name=...` 행에서 toggle 이름과 파생 globalvar 이름을 추출함.
 *
 * @param rawContent - `.risutoggle` 원문 DSL
 * @returns 문서 순서대로 정렬된 toggle 정의 목록
 */
export function parseToggleDefinitions(rawContent: string): readonly ToggleDefinition[] {
  const definitions: ToggleDefinition[] = [];
  let lineStartOffset = 0;
  const lines = rawContent.split(/\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] ?? '';
    const trimmedStart = line.search(/\S/);
    const equalsIndex = line.indexOf('=');
    const isComment = trimmedStart !== -1 && line.slice(trimmedStart).startsWith('#');

    if (equalsIndex > 0 && !isComment) {
      const rawName = line.slice(0, equalsIndex).trim();
      if (rawName.length > 0) {
        const keyStartInLine = line.indexOf(rawName);
        const startOffset = lineStartOffset + keyStartInLine;
        const endOffset = startOffset + rawName.length;
        definitions.push({
          name: rawName,
          globalVariableName: `toggle_${rawName}`,
          line: lineIndex,
          startOffset,
          endOffset,
        });
      }
    }

    lineStartOffset += line.length + 1;
  }

  return definitions;
}

/**
 * Serialize canonical toggle content to raw file content.
 * This is a lossless identity transform — the content is written exactly as-is.
 *
 * @param content - The canonical toggle content
 * @returns The raw file content to write to disk
 */
export function serializeToggleContent(content: ToggleContent): string {
  // Preserve exact content including empty strings
  return content;
}

/** Source identifier for toggle content origin. */
export interface ToggleSource {
  /** Target type (module or preset) */
  target: CustomExtensionTarget;
  /** Source path or identifier */
  source: string;
}

/**
 * Validates that there is exactly one toggle source.
 * Per spec: duplicate toggle sources must fail deterministically.
 *
 * @param sources - Array of toggle sources with their content
 * @returns The single valid source
 * @throws ToggleAdapterError if zero or multiple sources provided
 */
export function resolveDuplicateToggleSources(
  sources: Array<ToggleSource & { content: ToggleContent }>
): ToggleSource & { content: ToggleContent } {
  if (sources.length === 0) {
    throw new ToggleAdapterError('No toggle sources provided');
  }

  if (sources.length === 1) {
    return sources[0];
  }

  // Separate file sources from metadata sources for clearer error messages
  const fileSources = sources.filter((s) => s.source.endsWith('.risutoggle'));
  const metadataSources = sources.filter((s) => !s.source.endsWith('.risutoggle'));

  if (fileSources.length > 1) {
    const paths = fileSources.map((s) => `"${s.source}"`).join(', ');
    throw new ToggleAdapterError(
      `Duplicate toggle sources detected: multiple .risutoggle files found (${paths}). ` +
        'Only one .risutoggle file per target is allowed.'
    );
  }

  if (metadataSources.length > 1) {
    const paths = metadataSources.map((s) => `"${s.source}"`).join(', ');
    throw new ToggleAdapterError(
      `Duplicate toggle sources detected: multiple metadata toggle fields found (${paths}). ` +
        'Only one toggle source per target is allowed.'
    );
  }

  // Mixed source types (file + metadata) is also a duplicate
  if (fileSources.length === 1 && metadataSources.length === 1) {
    throw new ToggleAdapterError(
      `Duplicate toggle sources detected: both file "${fileSources[0].source}" ` +
        `and metadata "${metadataSources[0].source}" found. ` +
        'Only one toggle source per target is allowed.'
    );
  }

  // Fallback — should not reach here if logic is correct
  const allSources = sources.map((s) => `"${s.source}"`).join(', ');
  throw new ToggleAdapterError(
    `Duplicate toggle sources detected (${allSources}). Only one toggle source per target is allowed.`
  );
}

/**
 * Extract toggle content from upstream module format.
 * Per spec: reads from `customModuleToggle` field.
 *
 * @param upstream - The upstream module data
 * @param target - Must be 'module'
 * @returns The toggle content, or null if not present
 */
export function extractToggleFromModule(
  upstream: { customModuleToggle?: string },
  target: CustomExtensionTarget
): ToggleContent | null {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new ToggleAdapterError(`Expected target "module", got "${target}"`);
  }

  const content = upstream.customModuleToggle;
  if (content === undefined || content === null) {
    return null;
  }

  return parseToggleContent(content);
}

/**
 * Extract toggle content from upstream preset format.
 * Per spec: reads from `customPromptTemplateToggle` field.
 *
 * @param upstream - The upstream preset data
 * @param target - Must be 'preset'
 * @returns The toggle content, or null if not present
 */
export function extractToggleFromPreset(
  upstream: { customPromptTemplateToggle?: string },
  target: CustomExtensionTarget
): ToggleContent | null {
  assertSupportedTarget(target);

  if (target !== 'preset') {
    throw new ToggleAdapterError(`Expected target "preset", got "${target}"`);
  }

  const content = upstream.customPromptTemplateToggle;
  if (content === undefined || content === null) {
    return null;
  }

  return parseToggleContent(content);
}

/**
 * Inject toggle content into upstream module format.
 * Per spec: writes to `customModuleToggle` field.
 *
 * @param upstream - The upstream module data to mutate
 * @param content - The canonical toggle content
 * @param target - Must be 'module'
 */
export function injectToggleIntoModule(
  upstream: { customModuleToggle?: string },
  content: ToggleContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new ToggleAdapterError(`Expected target "module", got "${target}"`);
  }

  if (content === null) {
    delete upstream.customModuleToggle;
  } else {
    upstream.customModuleToggle = serializeToggleContent(content);
  }
}

/**
 * Inject toggle content into upstream preset format.
 * Per spec: writes to `customPromptTemplateToggle` field.
 *
 * @param upstream - The upstream preset data to mutate
 * @param content - The canonical toggle content
 * @param target - Must be 'preset'
 */
export function injectToggleIntoPreset(
  upstream: { customPromptTemplateToggle?: string },
  content: ToggleContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'preset') {
    throw new ToggleAdapterError(`Expected target "preset", got "${target}"`);
  }

  if (content === null) {
    delete upstream.customPromptTemplateToggle;
  } else {
    upstream.customPromptTemplateToggle = serializeToggleContent(content);
  }
}

/**
 * Build the canonical file path for a .risutoggle artifact.
 * Per spec:
 * - Module: toggle/${moduleName}.risutoggle
 * - Preset: toggle/prompt_template.risutoggle (fixed stem)
 *
 * @param target - 'module' or 'preset'
 * @param targetName - Module name (for module target) or ignored (for preset)
 * @returns The canonical relative path
 */
export function buildTogglePath(
  target: CustomExtensionTarget,
  targetName?: string
): string {
  assertSupportedTarget(target);

  if (target === 'preset') {
    return 'toggle/prompt_template.risutoggle';
  }

  // Module target
  if (!targetName || targetName.length === 0) {
    throw new ToggleAdapterError('Module target requires targetName for toggle path');
  }

  // Sanitize filename to prevent path traversal
  const sanitized = targetName.replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
  return `toggle/${sanitized}.risutoggle`;
}
