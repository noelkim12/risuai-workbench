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

/**
 * Extract the lorebook entry name from a category-prefixed name.
 * Lorebook entries may be stored with category prefixes like "🙂NPC/Entry Name".
 * For wiki links, we only want the entry name part (after the "/").
 *
 * @param raw - The raw name which may contain a category prefix (e.g., "🙂NPC/Entry Name")
 * @returns The entry name without category prefix (e.g., "Entry Name")
 */
export function extractLorebookEntryName(raw: string): string {
  const slashIndex = raw.lastIndexOf('/');
  if (slashIndex === -1) return raw;
  return raw.slice(slashIndex + 1).trim();
}

export function toLorebookEntrySlug(raw: string): string {
  return toWikiSlug(extractLorebookEntryName(raw));
}
