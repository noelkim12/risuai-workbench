import { buildSafeRelativePath } from '../shared/path-policy';
import { buildLineStarts, lineAtOffset } from '../shared/range-utils';
import { detectRisuLuaSourceProfile } from '../profiling/source-profile';
import { sliceSourceOffsets } from '../shared/source-slice';
import type {
  LuaSourceRange,
  RisuLuaPreloadRequireDiagnostic,
  SourceProfileDynamicRequire,
  SourceProfileStaticRequire,
} from '../shared/types';

export interface RisuLuaExtractedPreloadModule {
  preloadId: string;
  path: string;
  sourceRange: LuaSourceRange;
  bodyRange: LuaSourceRange;
  body: string;
  requires: string[];
  dynamicRequires: RisuLuaPreloadRequireDiagnostic[];
  preserveOrderIndex: number;
}

export interface ExtractRisuLuaPreloadModulesResult {
  modules: RisuLuaExtractedPreloadModule[];
  tail: string;
  tailRanges: LuaSourceRange[];
}

interface RawPreloadAssignment {
  preloadId: string;
  sourceRange: LuaSourceRange;
  bodyRange: LuaSourceRange;
}

interface MaskedKeyword {
  keyword: string;
  startOffset: number;
  endOffset: number;
}

const PRELOAD_ASSIGNMENT_PATTERN = /\bpackage\s*\.\s*preload\s*\[\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\]\s*=\s*function\b/g;
const REQUIRE_CALL_PATTERN = /(^|[^\w.])require\s*\(([^)]*)\)/g;
const LUA_BLOCK_KEYWORDS = new Set(['function', 'do', 'then', 'repeat', 'end', 'until']);

export function extractRisuLuaPreloadModules(source: string): ExtractRisuLuaPreloadModulesResult {
  const assignments = findPreloadAssignments(source);
  const usedPaths = new Set<string>();
  const modules = assignments.map((assignment, index) => buildModule(source, assignment, index, usedPaths));
  const { tail, tailRanges } = buildTail(source, assignments.map((assignment) => assignment.sourceRange));
  return { modules, tail, tailRanges };
}

function findPreloadAssignments(source: string): RawPreloadAssignment[] {
  const lineStarts = buildLineStarts(source);
  const assignments: RawPreloadAssignment[] = [];
  for (const match of source.matchAll(PRELOAD_ASSIGNMENT_PATTERN)) {
    if (match.index === undefined) continue;
    const functionOffset = match.index + match[0].lastIndexOf('function');
    const functionEnd = findMatchingFunctionEnd(source, functionOffset);
    if (functionEnd === null) continue;
    const bodyStartOffset = findFunctionBodyStart(source, functionOffset);
    if (bodyStartOffset === null) continue;
    const endLineOffset = Math.max(match.index, functionEnd.endOffset - 1);
    assignments.push({
      preloadId: unescapeSimpleLuaString(match[2]),
      sourceRange: {
        startLine: lineAtOffset(match.index, lineStarts),
        endLine: lineAtOffset(endLineOffset, lineStarts),
        startOffset: match.index,
        endOffset: functionEnd.endOffset,
      },
      bodyRange: {
        startLine: lineAtOffset(bodyStartOffset, lineStarts),
        endLine: lineAtOffset(Math.max(bodyStartOffset, functionEnd.startOffset - 1), lineStarts),
        startOffset: bodyStartOffset,
        endOffset: functionEnd.startOffset,
      },
    });
  }
  return assignments;
}

function buildModule(
  source: string,
  assignment: RawPreloadAssignment,
  preserveOrderIndex: number,
  usedPaths: Set<string>,
): RisuLuaExtractedPreloadModule {
  const body = sliceSourceOffsets(source, assignment.bodyRange.startOffset, assignment.bodyRange.endOffset);
  const bodyProfile = detectRisuLuaSourceProfile(body);
  const requires = bodyProfile.staticRequires.map((requireCall) => requireCall.id);
  return {
    preloadId: assignment.preloadId,
    path: buildUniquePreloadPath(assignment.preloadId, usedPaths),
    sourceRange: assignment.sourceRange,
    bodyRange: assignment.bodyRange,
    body,
    requires,
    dynamicRequires: bodyProfile.dynamicRequires.map((dynamicRequire) => toAbsoluteLineDiagnostic(dynamicRequire, assignment.bodyRange.startLine)),
    preserveOrderIndex,
  };
}

function buildTail(source: string, ranges: LuaSourceRange[]): { tail: string; tailRanges: LuaSourceRange[] } {
  const lineStarts = buildLineStarts(source);
  const sorted = [...ranges].sort((a, b) => a.startOffset - b.startOffset);
  let cursor = 0;
  let tail = '';
  const tailRanges: LuaSourceRange[] = [];
  for (const range of sorted) {
    if (range.startOffset > cursor) {
      tail += source.slice(cursor, range.startOffset);
      tailRanges.push(offsetRange(lineStarts, cursor, range.startOffset));
    }
    cursor = Math.max(cursor, range.endOffset);
  }
  if (cursor < source.length) {
    tail += source.slice(cursor);
    tailRanges.push(offsetRange(lineStarts, cursor, source.length));
  }
  return { tail, tailRanges };
}

function findMatchingFunctionEnd(source: string, functionOffset: number): { startOffset: number; endOffset: number } | null {
  const mask = buildIgnoredMask(source);
  const keywords = collectKeywords(source, mask, functionOffset);
  let depth = 0;
  for (const item of keywords) {
    if (item.keyword === 'function' || item.keyword === 'do' || item.keyword === 'then' || item.keyword === 'repeat') {
      depth += 1;
      continue;
    }
    if (item.keyword === 'end' || item.keyword === 'until') {
      depth -= 1;
      if (depth === 0) return { startOffset: item.startOffset, endOffset: item.endOffset };
    }
  }
  return null;
}

function findFunctionBodyStart(source: string, functionOffset: number): number | null {
  const parenStart = source.indexOf('(', functionOffset);
  if (parenStart === -1) return null;
  let depth = 0;
  for (let index = parenStart; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] !== ')') continue;
    depth -= 1;
    if (depth === 0) return index + 1;
  }
  return null;
}

function collectKeywords(source: string, ignored: boolean[], startOffset: number): MaskedKeyword[] {
  const keywords: MaskedKeyword[] = [];
  const pattern = /\b(function|do|then|repeat|end|until)\b/g;
  pattern.lastIndex = startOffset;
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined || ignored[match.index]) continue;
    const keyword = match[1];
    if (LUA_BLOCK_KEYWORDS.has(keyword)) {
      keywords.push({ keyword, startOffset: match.index, endOffset: match.index + keyword.length });
    }
  }
  return keywords;
}

function buildIgnoredMask(source: string): boolean[] {
  const ignored = Array.from({ length: source.length }, () => false);
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (source.startsWith('--', index)) {
      const longClose = getLongBracketClose(source, index + 2);
      const end = longClose ? findLongCloseEnd(source, index, longClose) : findLineEnd(source, index);
      markIgnored(ignored, index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'") {
      index = markQuotedString(source, ignored, index, char);
      continue;
    }
    const longClose = getLongBracketClose(source, index);
    if (longClose) {
      const end = findLongCloseEnd(source, index, longClose);
      markIgnored(ignored, index, end);
      index = end;
      continue;
    }
    index += 1;
  }
  return ignored;
}

function buildUniquePreloadPath(preloadId: string, usedPaths: Set<string>): string {
  const baseName = stripLikelyLuaExtension(stripLeadingRelative(preloadId));
  let attempt = 0;
  while (attempt < 1000) {
    const suffix = attempt === 0 ? '' : `_${attempt + 1}`;
    const fileName = buildSafeRelativePath(`${baseName}${suffix}`, 'risulua');
    if (fileName === null) throw new Error(`Unable to build safe preload filename for id: ${preloadId}`);
    const relativePath = `lua/preload/${fileName}`;
    if (!usedPaths.has(relativePath)) {
      usedPaths.add(relativePath);
      return relativePath;
    }
    attempt += 1;
  }
  throw new Error(`Unable to build unique preload filename for id: ${preloadId}`);
}

function offsetRange(lineStarts: number[], startOffset: number, endOffset: number): LuaSourceRange {
  const effectiveEnd = Math.max(startOffset, endOffset - 1);
  return {
    startLine: lineAtOffset(startOffset, lineStarts),
    endLine: lineAtOffset(effectiveEnd, lineStarts),
    startOffset,
    endOffset,
  };
}

function toAbsoluteLineDiagnostic(
  dynamicRequire: SourceProfileDynamicRequire,
  bodyStartLine: number,
): RisuLuaPreloadRequireDiagnostic {
  return { line: bodyStartLine + dynamicRequire.line - 1, expression: dynamicRequire.expression };
}

export function collectStaticRequires(source: string): SourceProfileStaticRequire[] {
  const lineStarts = buildLineStarts(source);
  const requires: SourceProfileStaticRequire[] = [];
  for (const match of source.matchAll(REQUIRE_CALL_PATTERN)) {
    if (match.index === undefined) continue;
    const raw = match[2].trim();
    const id = parseSimpleLuaString(raw);
    if (id !== null) {
      requires.push({ id, raw, line: lineAtOffset(match.index + match[1].length, lineStarts) });
    }
  }
  return requires;
}

function parseSimpleLuaString(raw: string): string | null {
  const match = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/.exec(raw.trim());
  if (!match) return null;
  return unescapeSimpleLuaString(match[2]);
}

function unescapeSimpleLuaString(value: string): string {
  return value.replace(/\\(['"\\abfnrtv])/g, (_match, escaped: string) => {
    const map: Record<string, string> = { a: '\u0007', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\u000b' };
    return map[escaped] ?? escaped;
  });
}

function stripLeadingRelative(value: string): string {
  let output = value.trim();
  while (output.startsWith('./')) output = output.slice(2);
  while (output.startsWith('/')) output = output.slice(1);
  return output;
}

function stripLikelyLuaExtension(value: string): string {
  return value.replace(/\.(?:risulua|lua)$/i, '');
}

function findLineEnd(source: string, start: number): number {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end;
}

function getLongBracketClose(source: string, start: number): string | null {
  if (source[start] !== '[') return null;
  let index = start + 1;
  while (source[index] === '=') index += 1;
  if (source[index] !== '[') return null;
  return `]${'='.repeat(index - start - 1)}]`;
}

function findLongCloseEnd(source: string, start: number, close: string): number {
  const closeIndex = source.indexOf(close, start + close.length);
  return closeIndex === -1 ? source.length : closeIndex + close.length;
}

function markQuotedString(source: string, ignored: boolean[], start: number, quote: string): number {
  let index = start;
  markIgnored(ignored, index, index + 1);
  index += 1;
  while (index < source.length) {
    markIgnored(ignored, index, index + 1);
    if (source[index] === '\\') {
      markIgnored(ignored, index + 1, index + 2);
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function markIgnored(ignored: boolean[], start: number, end: number): void {
  for (let index = start; index < Math.min(end, ignored.length); index += 1) ignored[index] = true;
}
