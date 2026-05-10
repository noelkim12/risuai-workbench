/**
 * Single-pass identifier token scanner for Lua reference rewriting.
 *
 * Walks `text` exactly once, emitting every identifier token that exists
 * in the supplied `rewriteMap`.  Callers then apply their own context
 * filters (non-executable, declaration, table-key, shadowed scope, etc.)
 * and build replacements.
 *
 * This replaces the previous per-name `text.indexOf(name, cursor)` loops
 * in both top-level and nested handler rewrites.
 */

// ─── Public types ──────────────────────────────────────────────────

export interface IdentifierToken {
  /** The matched identifier text (guaranteed to be a key in rewriteMap). */
  readonly name: string;
  /** Start offset of the token within `text` (local). */
  readonly start: number;
  /** End offset of the token within `text` (exclusive, local). */
  readonly end: number;
  /** Start offset in absolute source coordinates (start + baseOffset). */
  readonly absStart: number;
  /** The qualified replacement string from rewriteMap. */
  readonly qualified: string;
  /**
   * True when the character immediately before the identifier is '.'
   * (method/table property reference — should not be rewritten).
   */
  readonly precededByDot: boolean;
  /**
   * For call-site detection: number of whitespace characters between
   * `end` and the first non-whitespace character.  Undefined when at end
   * of text.
   */
  readonly trailingWs: number;
  /**
   * For call-site detection: the character immediately after any trailing
   * whitespace, or undefined when at end of text.
   */
  readonly charAfterWs: string | undefined;
}

// ─── Character helpers ─────────────────────────────────────────────

function isIdentChar(code: number): boolean {
  return (code >= 48 && code <= 57)   // 0-9
    || (code >= 65 && code <= 90)     // A-Z
    || (code >= 97 && code <= 122)    // a-z
    || code === 95;                    // _
}

function isWsChar(code: number): boolean {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

// ─── Scanner ───────────────────────────────────────────────────────

/**
 * Scan `text` in a single pass, collecting every identifier token whose
 * name appears in `rewriteMap`.
 *
 * Identifier boundary semantics:
 *  - Preceding character must not be an identifier char (`[A-Za-z0-9_]`).
 *  - Following character must not be an identifier char.
 *  - The token also reports whether it is preceded by '.' so callers can
 *    skip method/table-property references.
 *
 * @param text        The source chunk to scan.
 * @param rewriteMap  Map from identifier name to qualified replacement.
 * @param baseOffset  Offset of `text[0]` in the original full source.
 */
export function scanIdentifierTokens(
  text: string,
  rewriteMap: Map<string, string>,
  baseOffset: number,
): IdentifierToken[] {
  if (rewriteMap.size === 0 || text.length === 0) return [];

  const tokens: IdentifierToken[] = [];
  const len = text.length;
  let pos = 0;

  while (pos < len) {
    const ch = text.charCodeAt(pos);

    // Fast skip: only start scanning at ASCII alpha or underscore
    if (!((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 95)) {
      pos++;
      continue;
    }

    // Read the full identifier run
    const identStart = pos;
    while (pos < len && isIdentChar(text.charCodeAt(pos))) {
      pos++;
    }
    const identEnd = pos;
    const name = text.slice(identStart, identEnd);

    // Check if it's in the rewrite map
    const qualified = rewriteMap.get(name);
    if (qualified !== undefined) {
      // Preceded by dot?
      const precededByDot = identStart > 0 && text.charCodeAt(identStart - 1) === 46; // '.'

      // Scan trailing whitespace and the character after it
      let wsCount = 0;
      let scanPos = identEnd;
      while (scanPos < len && isWsChar(text.charCodeAt(scanPos))) {
        wsCount++;
        scanPos++;
      }
      const charAfterWs = scanPos < len ? text[scanPos] : undefined;

      tokens.push({
        name,
        start: identStart,
        end: identEnd,
        absStart: identStart + baseOffset,
        qualified,
        precededByDot,
        trailingWs: wsCount,
        charAfterWs,
      });
    }

    // `pos` already advanced past the identifier; continue scanning
  }

  return tokens;
}

// ─── Replacement helpers ───────────────────────────────────────────

export interface Replacement {
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

/**
 * Apply replacements to text in reverse order (highest offset first)
 * so that earlier offsets remain stable.
 */
export function applyReplacements(text: string, replacements: Replacement[]): string {
  if (replacements.length === 0) return text;
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let result = text;
  for (const { start, end, replacement } of sorted) {
    result = result.slice(0, start) + replacement + result.slice(end);
  }
  return result;
}
