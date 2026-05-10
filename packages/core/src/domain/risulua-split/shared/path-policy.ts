/**
 * Path policy helpers for safe generated paths from section labels,
 * preload ids, and coarse classifications.
 *
 * No generated path may escape the intended output root.
 */

/**
 * Sanitize a label (section label, preload id, etc.) into a safe filename
 * segment. Replaces or removes characters that could be used for path
 * traversal or are otherwise unsafe.
 *
 * Rules:
 * - Empty strings produce `"unnamed"`.
 * - Path separators (`/`, `\`) are replaced with `_`.
 * - Parent traversal (`..`) is collapsed to `__`.
 * - Leading dots are stripped (prevent hidden files and `..` tricks).
 * - Only safe characters are kept; others become `_`.
 * - Result is lowercased for consistency.
 */
export function sanitizePathSegment(label: string): string {
  if (label.length === 0) return 'unnamed';

  let sanitized = label
    // normalize backslashes to forward slashes
    .replace(/\\/g, '/')
    // collapse parent traversal
    .replace(/\.\./g, '__')
    // replace slashes with underscores
    .replace(/\//g, '_');

  // Strip leading dots
  sanitized = sanitized.replace(/^\.+/, '');

  // Replace any remaining unsafe characters
  sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_');

  // Remove leading/trailing underscores and dots
  sanitized = sanitized.replace(/^[_.-]+|[_.-]+$/g, '');

  if (sanitized.length === 0) return 'unnamed';

  return sanitized;
}

/**
 * Validate that a generated relative path does not escape the output root.
 *
 * Returns `true` if the path is safe, `false` otherwise.
 *
 * Detects:
 * - `..` segments (path traversal)
 * - Absolute paths (leading `/` or drive letters)
 * - Backslash paths (Windows-style)
 * - Empty segments
 */
export function isPathSafe(relativePath: string): boolean {
  // Reject absolute paths
  if (relativePath.startsWith('/')) return false;
  // Reject Windows-style paths
  if (/^[A-Za-z]:/.test(relativePath)) return false;
  if (relativePath.includes('\\')) return false;

  const segments = relativePath.split('/');
  for (const segment of segments) {
    // Empty segment (double slash or trailing slash)
    if (segment.length === 0) return false;
    // Path traversal
    if (segment === '..') return false;
    // Hidden file / dot-trick
    if (segment.startsWith('.')) return false;
  }

  return true;
}

/**
 * Build a safe relative path from a label and optional extension.
 *
 * Returns `null` if the label cannot produce a safe path.
 */
export function buildSafeRelativePath(label: string, extension?: string): string | null {
  const segment = sanitizePathSegment(label);
  const ext = extension ? (extension.startsWith('.') ? extension : `.${extension}`) : '';
  const path = `${segment}${ext}`;
  return isPathSafe(path) ? path : null;
}

/**
 * Build a safe preload module id from a raw preload string.
 * Preload ids like `"./x"` or `"risu:module"` are normalized.
 */
export function sanitizePreloadId(rawId: string): string {
  let id = rawId.trim();

  // Strip leading ./ 
  while (id.startsWith('./')) {
    id = id.slice(2);
  }

  // Strip leading /
  while (id.startsWith('/')) {
    id = id.slice(1);
  }

  return sanitizePathSegment(id);
}

/**
 * Rejection result for unsafe path proposals.
 */
export interface PathPolicyRejection {
  safe: false;
  reason: string;
  sanitized: string;
}

/**
 * Acceptance result for safe path proposals.
 */
export interface PathPolicyAcceptance {
  safe: true;
  path: string;
}

export type PathPolicyResult = PathPolicyRejection | PathPolicyAcceptance;

/**
 * Evaluate whether a proposed path is acceptable under the path policy.
 * If not, return the rejection with the reason and a sanitized alternative.
 */
export function evaluatePathPolicy(proposedPath: string, extension?: string): PathPolicyResult {
  if (isPathSafe(proposedPath)) {
    return { safe: true, path: proposedPath };
  }

  const sanitized = buildSafeRelativePath(proposedPath, extension);
  return {
    safe: false,
    reason: `Path "${proposedPath}" is unsafe: contains traversal, absolute, or invalid segments.`,
    sanitized: sanitized ?? 'unnamed',
  };
}
