import type { CustomExtensionTarget } from '../contracts';

/**
 * Canonical HTML content — raw HTML source string.
 * .risuhtml files contain background HTML for charx/module as a single blob.
 * Per spec: the entire file is CBS-bearing; no structural parsing is performed.
 */
export type HtmlContent = string;

/**
 * Supported targets for .risuhtml artifacts.
 * Per spec: charx and module only. Preset is explicitly excluded.
 */
const SUPPORTED_TARGETS: readonly CustomExtensionTarget[] = ['charx', 'module'];

/** Error thrown when HTML adapter operations encounter unsupported targets or duplicate sources. */
export class HtmlAdapterError extends Error {
  constructor(message: string) {
    super(`[risuhtml] ${message}`);
    this.name = 'HtmlAdapterError';
  }
}

/**
 * Validates that the target supports .risuhtml artifacts.
 * Per spec, preset must fail clearly.
 */
function assertSupportedTarget(target: CustomExtensionTarget): void {
  if (!SUPPORTED_TARGETS.includes(target)) {
    throw new HtmlAdapterError(
      `Target "${target}" does not support .risuhtml. Only charx and module are supported.`
    );
  }
}

/**
 * Parse raw file content into canonical HTML format.
 * This is a lossless identity transform — the content is preserved exactly.
 *
 * @param rawContent - The raw file content as read from disk
 * @returns The canonical HTML content (the string itself)
 */
export function parseHtmlContent(rawContent: string): HtmlContent {
  // Preserve exact content including empty strings, whitespace, CBS expressions
  // No trimming, no normalization, no HTML parsing
  return rawContent;
}

/**
 * Serialize canonical HTML content to raw file content.
 * This is a lossless identity transform — the content is written exactly as-is.
 *
 * @param content - The canonical HTML content
 * @returns The raw file content to write to disk
 */
export function serializeHtmlContent(content: HtmlContent): string {
  // Preserve exact content including empty strings
  return content;
}

/** Source identifier for HTML content origin. */
export interface HtmlSource {
  /** Target type (charx or module) */
  target: CustomExtensionTarget;
  /** Source path or identifier */
  source: string;
}

/**
 * Validates that there is exactly one HTML source.
 * Per spec: duplicate .risuhtml files must fail deterministically.
 * HTML is a singleton per target — only `html/background.risuhtml` is allowed.
 *
 * @param sources - Array of HTML sources with their content
 * @returns The single valid source
 * @throws HtmlAdapterError if zero or multiple sources provided
 */
export function resolveDuplicateHtmlSources(
  sources: Array<HtmlSource & { content: HtmlContent }>
): HtmlSource & { content: HtmlContent } {
  if (sources.length === 0) {
    throw new HtmlAdapterError('No HTML sources provided');
  }

  if (sources.length === 1) {
    return sources[0];
  }

  // Multiple .risuhtml files detected — this is a violation of the singleton rule
  const paths = sources.map((s) => `"${s.source}"`).join(', ');
  throw new HtmlAdapterError(
    `Duplicate .risuhtml sources detected: multiple files found (${paths}). ` +
      'Only one html/background.risuhtml file per target is allowed.'
  );
}

/**
 * Extract HTML content from upstream charx format.
 * Per spec: reads from `data.extensions.risuai.backgroundHTML`.
 *
 * @param upstream - The upstream charx data
 * @param target - Must be 'charx'
 * @returns The HTML content, or null if not present
 */
export function extractHtmlFromCharx(
  upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } },
  target: CustomExtensionTarget
): HtmlContent | null {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new HtmlAdapterError(`Expected target "charx", got "${target}"`);
  }

  const content = upstream.data?.extensions?.risuai?.backgroundHTML;
  if (content === undefined || content === null) {
    return null;
  }

  return parseHtmlContent(content);
}

/**
 * Extract HTML content from upstream module format.
 * Per spec: reads from `backgroundEmbedding` field.
 *
 * @param upstream - The upstream module data
 * @param target - Must be 'module'
 * @returns The HTML content, or null if not present
 */
export function extractHtmlFromModule(
  upstream: { backgroundEmbedding?: string },
  target: CustomExtensionTarget
): HtmlContent | null {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new HtmlAdapterError(`Expected target "module", got "${target}"`);
  }

  const content = upstream.backgroundEmbedding;
  if (content === undefined || content === null) {
    return null;
  }

  return parseHtmlContent(content);
}

/**
 * Inject HTML content into upstream charx format.
 * Per spec: writes to `data.extensions.risuai.backgroundHTML`.
 *
 * @param upstream - The upstream charx data to mutate
 * @param content - The canonical HTML content
 * @param target - Must be 'charx'
 */
export function injectHtmlIntoCharx(
  upstream: { data?: { extensions?: { risuai?: { backgroundHTML?: string } } } },
  content: HtmlContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'charx') {
    throw new HtmlAdapterError(`Expected target "charx", got "${target}"`);
  }

  // Ensure nested objects exist
  if (!upstream.data) {
    upstream.data = {};
  }
  if (!upstream.data.extensions) {
    upstream.data.extensions = {};
  }
  if (!upstream.data.extensions.risuai) {
    upstream.data.extensions.risuai = {};
  }

  if (content === null) {
    delete upstream.data.extensions.risuai.backgroundHTML;
  } else {
    upstream.data.extensions.risuai.backgroundHTML = serializeHtmlContent(content);
  }
}

/**
 * Inject HTML content into upstream module format.
 * Per spec: writes to `backgroundEmbedding` field.
 *
 * @param upstream - The upstream module data to mutate
 * @param content - The canonical HTML content
 * @param target - Must be 'module'
 */
export function injectHtmlIntoModule(
  upstream: { backgroundEmbedding?: string },
  content: HtmlContent | null,
  target: CustomExtensionTarget
): void {
  assertSupportedTarget(target);

  if (target !== 'module') {
    throw new HtmlAdapterError(`Expected target "module", got "${target}"`);
  }

  if (content === null) {
    delete upstream.backgroundEmbedding;
  } else {
    upstream.backgroundEmbedding = serializeHtmlContent(content);
  }
}

/**
 * Build the canonical file path for a .risuhtml artifact.
 * Per spec:
 * - Charx: html/background.risuhtml (fixed stem)
 * - Module: html/background.risuhtml (fixed stem)
 *
 * HTML is a singleton — only one file per target with fixed name.
 *
 * @param target - 'charx' or 'module'
 * @returns The canonical relative path (always 'html/background.risuhtml')
 */
export function buildHtmlPath(target: CustomExtensionTarget): string {
  assertSupportedTarget(target);

  // HTML uses fixed stem 'background' per contracts.ts
  return 'html/background.risuhtml';
}
