import type {
  RisuLuaSourceProfile,
  SourceProfileDynamicRequire,
  SourceProfilePackagePathMutation,
  SourceProfilePreloadModule,
  SourceProfileResult,
  SourceProfileRuntimeLoad,
  SourceProfileSectionMarker,
  SourceProfileStaticRequire,
  SplitConfidence,
} from '../shared/types';
import { classifyLuaRuntimeLoadRisk } from './lua-runtime-risk-policy';

interface ScanMask {
  ignored: boolean[];
  lineStarts: number[];
  sectionMarkers: SourceProfileSectionMarker[];
}

const PRELOAD_ASSIGNMENT_PATTERN = /\bpackage\s*\.\s*preload\s*\[\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*\]\s*=/g;
const REQUIRE_CALL_PATTERN = /(^|[^\w.])require\s*\(([^)]*)\)/g;
const RUNTIME_LOAD_PATTERN = /(^|[^\w.])(loadfile|dofile|load)\s*\(([^)]*)\)/g;
const PACKAGE_MUTATION_PATTERN = /\bpackage\s*(?:\.\s*(path|cpath|searchers|loaders)|\[\s*(['"])(path|cpath|searchers|loaders)\2\s*\])(?:\s*\[[^\]]+\])?\s*=/g;

export function detectRisuLuaSourceProfile(source: string): SourceProfileResult {
  const mask = buildScanMask(source);
  const preloadModules = detectPreloadModules(source, mask);
  const staticRequires: SourceProfileStaticRequire[] = [];
  const dynamicRequires: SourceProfileDynamicRequire[] = [];
  detectRequires(source, mask, staticRequires, dynamicRequires);
  const runtimeLoads = detectRuntimeLoads(source, mask);
  const packagePathMutations = detectPackagePathMutations(source, mask);
  const profile = selectSourceProfile(preloadModules.length, mask.sectionMarkers.length, source);
  const confidence = selectConfidence(profile, mask.sectionMarkers.length, runtimeLoads, packagePathMutations, source);

  return {
    profile,
    confidence,
    preloadModules,
    sectionMarkers: mask.sectionMarkers,
    staticRequires,
    dynamicRequires,
    runtimeLoads,
    packagePathMutations,
    reasons: buildReasons({
      profile,
      confidence,
      preloadModules,
      sectionMarkers: mask.sectionMarkers,
      staticRequires,
      dynamicRequires,
      runtimeLoads,
      packagePathMutations,
      source,
    }),
  };
}

function buildScanMask(source: string): ScanMask {
  const ignored = Array.from({ length: source.length }, () => false);
  const lineStarts = [0];
  const sectionMarkers: SourceProfileSectionMarker[] = [];
  let line = 1;
  let lineStart = 0;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    if (char === '\n') {
      line += 1;
      lineStart = index + 1;
      lineStarts.push(lineStart);
      index += 1;
      continue;
    }

    if (source.startsWith('--', index)) {
      const longClose = getLongBracketClose(source, index + 2);
      if (longClose) {
        const end = markIgnoredUntilLongClose(source, ignored, index, longClose);
        for (let offset = index; offset < end; offset += 1) {
          if (source[offset] !== '\n') continue;
          line += 1;
          lineStart = offset + 1;
          lineStarts.push(lineStart);
        }
        index = end;
        continue;
      }

      const end = findLineEnd(source, index);
      const text = source.slice(index, end);
      const marker = /^--\s*\[BUNDLE\]\s+(.+?)\s*$/.exec(text.trimStart());
      if (marker) {
        sectionMarkers.push({ label: marker[1], line, startOffset: index });
      }
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
      const end = markIgnoredUntilLongClose(source, ignored, index, longClose);
      for (let offset = index; offset < end; offset += 1) {
        if (source[offset] !== '\n') continue;
        line += 1;
        lineStart = offset + 1;
        lineStarts.push(lineStart);
      }
      index = end;
      continue;
    }

    index += 1;
  }

  return { ignored, lineStarts, sectionMarkers };
}

function detectPreloadModules(source: string, mask: ScanMask): SourceProfilePreloadModule[] {
  const modules: SourceProfilePreloadModule[] = [];
  for (const match of source.matchAll(PRELOAD_ASSIGNMENT_PATTERN)) {
    if (match.index === undefined || isIgnored(mask, match.index)) continue;
    const endOffset = findPreloadFunctionEnd(source, mask, match.index + match[0].length);
    modules.push({
      id: unescapeSimpleLuaString(match[2]),
      startLine: lineAt(mask, match.index),
      endLine: endOffset === undefined ? undefined : lineAt(mask, endOffset),
      startOffset: match.index,
      endOffset,
    });
  }
  return modules;
}

function detectRequires(
  source: string,
  mask: ScanMask,
  staticRequires: SourceProfileStaticRequire[],
  dynamicRequires: SourceProfileDynamicRequire[],
): void {
  for (const match of source.matchAll(REQUIRE_CALL_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    if (isIgnored(mask, start)) continue;
    const raw = match[2].trim();
    const literal = parseSimpleLuaString(raw);
    if (literal !== null) {
      staticRequires.push({ id: literal, line: lineAt(mask, start), raw });
    } else {
      dynamicRequires.push({ line: lineAt(mask, start), expression: raw });
    }
  }
}

function detectRuntimeLoads(source: string, mask: ScanMask): SourceProfileRuntimeLoad[] {
  const loads: SourceProfileRuntimeLoad[] = [];
  for (const match of source.matchAll(RUNTIME_LOAD_PATTERN)) {
    const start = (match.index ?? 0) + match[1].length;
    if (isIgnored(mask, start)) continue;
    const expression = match[3].trim();
    const kind = match[2] as SourceProfileRuntimeLoad['kind'];
    loads.push({ kind, line: lineAt(mask, start), expression, risk: classifyLuaRuntimeLoadRisk({ kind, expression }) });
  }
  return loads;
}

function detectPackagePathMutations(source: string, mask: ScanMask): SourceProfilePackagePathMutation[] {
  const mutations: SourceProfilePackagePathMutation[] = [];
  for (const match of source.matchAll(PACKAGE_MUTATION_PATTERN)) {
    if (match.index === undefined || isIgnored(mask, match.index)) continue;
    mutations.push({ line: lineAt(mask, match.index), expression: source.slice(match.index, findLineEnd(source, match.index)).trim() });
  }
  return mutations;
}

function selectSourceProfile(preloadCount: number, markerCount: number, source: string): RisuLuaSourceProfile {
  if (source.trim().length === 0) return 'unknown';
  if (preloadCount > 0 && markerCount > 0) return 'mixed-bundle';
  if (preloadCount > 0) return 'preload-bundle';
  if (markerCount >= 2) return 'section-bundle';
  if (preloadCount === 0 && markerCount === 0) return 'plain-single';
  return 'unknown';
}

function selectConfidence(
  profile: RisuLuaSourceProfile,
  markerCount: number,
  runtimeLoads: SourceProfileRuntimeLoad[],
  packagePathMutations: SourceProfilePackagePathMutation[],
  source: string,
): SplitConfidence {
  if (source.trim().length === 0 || profile === 'unknown') return 'very-low';
  if (packagePathMutations.length > 0 || runtimeLoads.some((load) => load.risk === 'runtime-load-dynamic')) return 'low';
  if (markerCount === 1 || runtimeLoads.length > 0 || profile === 'mixed-bundle') return 'medium';
  return 'high';
}

function buildReasons(result: Omit<SourceProfileResult, 'reasons'> & { source: string }): string[] {
  const reasons = [
    `Detected ${result.preloadModules.length} package.preload registrations and ${result.staticRequires.length} static require calls.`,
    `Detected ${result.sectionMarkers.length} [BUNDLE] markers and ${result.dynamicRequires.length} dynamic require calls.`,
    `Detected ${result.runtimeLoads.length} runtime load calls and ${result.packagePathMutations.length} package loader mutations.`,
  ];
  if (result.source.trim().length === 0) reasons.push('Source is empty or whitespace-only; selected unknown profile.');
  if (result.sectionMarkers.length === 1 && result.preloadModules.length === 0) {
    reasons.push('Only one [BUNDLE] marker was found, so section-bundle was not inferred.');
  }
  reasons.push(`Selected profile: ${result.profile}.`);
  reasons.push(`Selected confidence: ${result.confidence}.`);
  return reasons;
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

function getLongBracketClose(source: string, start: number): string | null {
  if (source[start] !== '[') return null;
  let index = start + 1;
  while (source[index] === '=') index += 1;
  if (source[index] !== '[') return null;
  return `]${'='.repeat(index - start - 1)}]`;
}

function markIgnoredUntilLongClose(source: string, ignored: boolean[], start: number, close: string): number {
  const closeIndex = source.indexOf(close, start + close.length);
  const end = closeIndex === -1 ? source.length : closeIndex + close.length;
  markIgnored(ignored, start, end);
  return end;
}

function markIgnored(ignored: boolean[], start: number, end: number): void {
  for (let index = start; index < Math.min(end, ignored.length); index += 1) ignored[index] = true;
}

function isIgnored(mask: ScanMask, index: number): boolean {
  return Boolean(mask.ignored[index]);
}

function findLineEnd(source: string, start: number): number {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end;
}

function lineAt(mask: ScanMask, offset: number): number {
  let low = 0;
  let high = mask.lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mask.lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  return high + 1;
}

function parseSimpleLuaString(raw: string): string | null {
  const match = /^(['"])((?:\\.|(?!\1)[^\\])*)\1$/.exec(raw.trim());
  return match ? unescapeSimpleLuaString(match[2]) : null;
}

function unescapeSimpleLuaString(value: string): string {
  return value.replace(/\\([\\'"abfnrtv])/g, (_match, escaped: string) => {
    switch (escaped) {
      case 'a': return '\x07';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'v': return '\v';
      default: return escaped;
    }
  });
}

function findPreloadFunctionEnd(source: string, mask: ScanMask, afterAssignment: number): number | undefined {
  const tail = source.slice(afterAssignment);
  const functionMatch = /\bfunction\b/.exec(tail);
  if (!functionMatch) return undefined;
  const functionStart = afterAssignment + functionMatch.index;
  if (isIgnored(mask, functionStart)) return undefined;
  const blockTokenPattern = /\b(function|do|then|repeat|end|until)\b/g;
  blockTokenPattern.lastIndex = functionStart - afterAssignment;
  let depth = 0;
  for (const match of tail.matchAll(blockTokenPattern)) {
    const tokenStart = afterAssignment + (match.index ?? 0);
    if (isIgnored(mask, tokenStart)) continue;
    const token = match[1];
    if (token === 'function' || token === 'do' || token === 'then' || token === 'repeat') {
      depth += 1;
      continue;
    }
    if (token === 'end' || token === 'until') {
      depth -= 1;
      if (depth === 0) return tokenStart + token.length;
    }
  }
  return undefined;
}
