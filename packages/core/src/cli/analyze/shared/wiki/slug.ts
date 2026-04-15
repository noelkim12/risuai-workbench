/**
 * Normalize an entry name (lorebook, Lua function, variable) to a
 * filesystem-safe slug that is also a valid markdown filename.
 *
 * Rules:
 *   - Preserve Korean, CJK, and emoji characters verbatim.
 *   - Strip filesystem-hostile characters: / \ : * ? " < > |
 *   - Collapse runs of whitespace into a single `_`.
 *   - Trim leading/trailing whitespace.
 *   - If the normalized result is empty, return "unnamed".
 */
const FORBIDDEN = /[\/\\:*?"<>|]/g;
const WHITESPACE_RUN = /\s+/g;

export function toWikiSlug(raw: string): string {
  const stripped = raw.replace(FORBIDDEN, '').trim();
  if (stripped.length === 0) return 'unnamed';
  const collapsed = stripped.replace(WHITESPACE_RUN, '_');
  return collapsed.length === 0 ? 'unnamed' : collapsed;
}
