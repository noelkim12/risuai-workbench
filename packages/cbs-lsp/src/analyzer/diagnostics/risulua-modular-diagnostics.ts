/**
 * RisuLua modular-mode source diagnostics.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/risulua-modular-diagnostics.ts
 */

import fs from 'node:fs';
import path from 'node:path';

import luaparse from 'luaparse';
import {
  collectRisuLuaModuleGraphDiagnostics,
  listRisuLuaSourceModuleIds,
  moduleIdFromRisuLuaSourcePath,
  validateRisuLuaModuleId,
} from 'risu-workbench-core/node';
import { DiagnosticSeverity, type Diagnostic, type Range } from 'vscode-languageserver';

import { DiagnosticCode } from './taxonomy';

interface ParsedLuaArgument {
  kind: 'identifier' | 'other' | 'string';
  value: string | null;
  start: number;
  end: number;
}

interface ParsedCallArguments {
  arguments: ParsedLuaArgument[];
  closeParen: number;
}

interface ParsedStringLiteral {
  value: string;
  contentStart: number;
  contentEnd: number;
  end: number;
}

interface RisuLuaModularIssue {
  code: DiagnosticCode;
  message: string;
  symbol: string;
  start: number;
  end: number;
}

interface RisuLuaWorkspaceContext {
  rootDir: string;
  sourceRoot: string;
  targetName: string;
  distPath: string;
}

const RISULUA_MODULAR_SOURCE = 'risulua-modular';
const PACKAGE_LOADER_FIELDS = new Set(['path', 'cpath', 'searchers', 'loaders']);
const FORBIDDEN_LOADERS = new Set(['dofile', 'loadfile']);

/**
 * collectRisuLuaModularDiagnostics 함수.
 * 현재 `.risulua` 문서가 resolvable modular source일 때만 RisuLua 전용 진단을 반환함.
 *
 * @param filePath - host document filesystem path
 * @param source - host document text
 * @returns modular source 진단. classic/fallback/dist 문서는 빈 배열
 */
export function collectRisuLuaModularDiagnostics(filePath: string, source: string): Diagnostic[] {
  const workspace = getRisuLuaModularWorkspaceContext(filePath);
  if (!workspace || !isRisuLuaSourceFile(filePath, workspace)) {
    return [];
  }

  const parseError = getLuaParseError(filePath, source);
  if (parseError) {
    return [createDiagnostic({
      code: DiagnosticCode.RisuLuaParseError,
      message: `RisuLua modular mode source parse error: ${parseError}`,
      symbol: 'parse',
      start: 0,
      end: Math.min(source.length, Math.max(1, firstLineEnd(source))),
    }, source)];
  }

  return [
    ...scanRisuLuaModularIssues(source),
    ...collectRisuLuaGraphIssues(filePath, source, workspace),
  ].map((issue) => createDiagnostic(issue, source));
}

export function shouldAnalyzeRisuLuaModularSource(filePath: string): boolean {
  const workspace = getRisuLuaModularWorkspaceContext(filePath);
  return Boolean(workspace && isRisuLuaSourceFile(filePath, workspace));
}

export function getRisuLuaGeneratedDistMetadata(filePath: string): { rootDir: string; distPath: string; targetName: string } | null {
  const workspace = getRisuLuaModularWorkspaceContext(filePath);
  if (!workspace) return null;
  return path.resolve(filePath) === workspace.distPath
    ? { rootDir: workspace.rootDir, distPath: workspace.distPath, targetName: workspace.targetName }
    : null;
}

export function getRisuLuaModularWorkspaceContext(filePath: string): RisuLuaWorkspaceContext | null {
  const normalized = path.resolve(filePath);
  if (!normalized.toLowerCase().endsWith('.risulua')) {
    return null;
  }

  const rootDir = findRisuLuaWorkspaceRoot(normalized);
  if (!rootDir || !isResolvableModularWorkspace(rootDir)) {
    return null;
  }

  const marker = readWorkspaceMarker(rootDir);
  const targetName = sanitizeTargetName(typeof marker?.name === 'string' ? marker.name : 'module');
  return {
    rootDir,
    sourceRoot: path.join(rootDir, 'lua'),
    targetName,
    distPath: path.join(rootDir, 'dist', `${targetName}.risulua`),
  };
}

function isRisuLuaSourceFile(filePath: string, workspace: RisuLuaWorkspaceContext): boolean {
  const normalized = path.resolve(filePath);
  if (normalized === workspace.distPath) return false;
  const relative = path.relative(workspace.sourceRoot, normalized);
  return Boolean(relative)
    && !relative.startsWith('..')
    && !path.isAbsolute(relative)
    && normalized.toLowerCase().endsWith('.risulua')
    && !relative.split(path.sep).includes('dist');
}

function findRisuLuaWorkspaceRoot(filePath: string): string | null {
  let current = path.dirname(filePath);
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.risuchar')) || fs.existsSync(path.join(current, '.risumodule'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

function isResolvableModularWorkspace(rootDir: string): boolean {
  try {
    const marker = readWorkspaceMarker(rootDir);
    if (!marker) return false;
    if (typeof marker.name !== 'string' || marker.name.trim().length === 0) {
      return false;
    }

    const mainPath = path.join(rootDir, 'lua', 'main.risulua');
    return fs.existsSync(mainPath) && fs.statSync(mainPath).isFile();
  } catch {
    return false;
  }
}

function readWorkspaceMarker(rootDir: string): Record<string, unknown> | null {
  const hasRisuchar = fs.existsSync(path.join(rootDir, '.risuchar'));
  const hasRisumodule = fs.existsSync(path.join(rootDir, '.risumodule'));
  if (hasRisuchar === hasRisumodule) {
    return null;
  }

  return hasRisuchar
    ? readMarker(path.join(rootDir, '.risuchar'), 'risu.character')
    : readMarker(path.join(rootDir, '.risumodule'), 'risu.module');
}

function readMarker(markerPath: string, expectedKind: string): Record<string, unknown> {
  const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid marker object');
  }
  const marker = parsed as Record<string, unknown>;
  if (marker.kind !== expectedKind) {
    throw new Error('Invalid marker kind');
  }
  return marker;
}

function getLuaParseError(filePath: string, source: string): string | null {
  try {
    luaparse.parse(source, {
      comments: true,
      locations: true,
      ranges: true,
      scope: true,
      luaVersion: '5.1',
      extendedIdentifiers: true,
      encodingMode: 'none',
    });
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `${filePath}: ${detail}`;
  }
}

function scanRisuLuaModularIssues(source: string): RisuLuaModularIssue[] {
  const issues: RisuLuaModularIssue[] = [];
  let index = 0;

  while (index < source.length) {
    const skippedIndex = skipLuaTrivia(source, index);
    if (skippedIndex !== index) {
      index = skippedIndex;
      continue;
    }

    const localRequire = matchLocalRequireShadow(source, index);
    if (localRequire) {
      issues.push({
        code: DiagnosticCode.RisuLuaRequireBindingMutation,
        symbol: 'require',
        start: localRequire.start,
        end: localRequire.end,
        message: 'RisuLua modular mode forbids shadowing require; build-time module extraction must stay unambiguous.',
      });
      index = localRequire.end;
      continue;
    }

    const requireAlias = matchRequireAlias(source, index);
    if (requireAlias) {
      issues.push({
        code: DiagnosticCode.RisuLuaRequireBindingMutation,
        symbol: 'require',
        start: requireAlias.start,
        end: requireAlias.end,
        message: 'RisuLua modular mode forbids aliasing or wrapping require; use direct require("module.id") calls only.',
      });
      index = requireAlias.end;
      continue;
    }

    const requireReassign = matchRequireReassignment(source, index);
    if (requireReassign) {
      issues.push({
        code: DiagnosticCode.RisuLuaRequireBindingMutation,
        symbol: 'require',
        start: requireReassign.start,
        end: requireReassign.end,
        message: 'RisuLua modular mode forbids reassigning require; build-time module extraction must stay deterministic.',
      });
      index = requireReassign.end;
      continue;
    }

    const packageMutation = matchPackageLoaderMutation(source, index);
    if (packageMutation) {
      issues.push({
        code: DiagnosticCode.RisuLuaPackageLoaderMutation,
        symbol: packageMutation.symbol,
        start: packageMutation.start,
        end: packageMutation.end,
        message: `RisuLua modular mode forbids mutating ${packageMutation.symbol}; modular builds resolve source files statically.`,
      });
      index = packageMutation.end;
      continue;
    }

    const callName = matchIdentifier(source, index);
    if (!callName) {
      index += 1;
      continue;
    }

    const call = parseCallArguments(source, index + callName.name.length);
    if (!call) {
      index += callName.name.length;
      continue;
    }

    if (callName.name === 'require') {
      issues.push(...diagnoseRequireCall(index, call));
    } else if (FORBIDDEN_LOADERS.has(callName.name)) {
      issues.push({
        code: DiagnosticCode.RisuLuaForbiddenRuntimeLoad,
        symbol: callName.name,
        start: index,
        end: call.closeParen + 1,
        message: `RisuLua modular mode forbids ${callName.name}(); source modules must be statically bundled instead of loaded at runtime.`,
      });
    }

    index = Math.max(index + callName.name.length, call.closeParen + 1);
  }

  return issues.sort((left, right) => left.start - right.start || left.end - right.end || left.code.localeCompare(right.code));
}

function diagnoseRequireCall(
  callStart: number,
  call: ParsedCallArguments,
): RisuLuaModularIssue[] {
  const [argument] = call.arguments;
  if (call.arguments.length !== 1 || !argument || argument.kind !== 'string') {
    return [{
      code: DiagnosticCode.RisuLuaDynamicRequire,
      symbol: 'require',
      start: callStart,
      end: call.closeParen + 1,
      message: 'RisuLua modular mode supports only direct static require("module.id") calls; dynamic require shapes cannot be bundled safely.',
    }];
  }

  try {
    if (!argument.value) throw new Error('Missing RisuLua module ID');
    validateRisuLuaModuleId(argument.value);
  } catch {
    return [{
      code: DiagnosticCode.RisuLuaInvalidRequire,
      symbol: 'require',
      start: argument.start,
      end: argument.end,
      message: `RisuLua modular mode require ID must be dot-separated Lua identifiers without slashes, empty segments, or .risulua suffixes: ${JSON.stringify(argument.value)}.`,
    }];
  }

  return [];
}

function collectRisuLuaGraphIssues(
  filePath: string,
  source: string,
  workspace: RisuLuaWorkspaceContext,
): RisuLuaModularIssue[] {
  const moduleId = moduleIdFromRisuLuaSourcePath(filePath, workspace.sourceRoot);
  if (!moduleId) return [];

  return collectRisuLuaModuleGraphDiagnostics({
    sourceRoot: workspace.sourceRoot,
    filePath,
    source,
  }).map((diagnostic): RisuLuaModularIssue => ({
    code: diagnostic.code === 'missing_module'
      ? DiagnosticCode.RisuLuaMissingModule
      : DiagnosticCode.RisuLuaDependencyCycle,
    symbol: 'require',
    start: diagnostic.requireIdRange?.start ?? 0,
    end: diagnostic.requireIdRange?.end ?? Math.min(source.length, Math.max(1, firstLineEnd(source))),
    message: diagnostic.code === 'missing_module'
      ? `RisuLua modular mode cannot resolve required module ${JSON.stringify(diagnostic.requireId)} from ${moduleId}.`
      : diagnostic.message,
  }));
}

export function listRisuLuaModuleIdsForCompletion(filePath: string): string[] {
  const workspace = getRisuLuaModularWorkspaceContext(filePath);
  if (!workspace) return [];
  return listRisuLuaSourceModuleIds(workspace.sourceRoot, { includeEntry: false });
}

function sanitizeTargetName(targetName: string): string {
  const sanitized = targetName
    .replace(/[<>:"/\\|?*]/gu, '_')
    .replace(/[\s\S]/gu, (char) => (char.charCodeAt(0) < 32 ? '_' : char))
    .replace(/\.\.+/gu, '_')
    .replace(/\s+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^[._]+|[._]+$/gu, '')
    .slice(0, 100);
  return sanitized || 'module';
}

function createDiagnostic(issue: RisuLuaModularIssue, source: string): Diagnostic {
  return {
    severity: DiagnosticSeverity.Error,
    range: rangeFromOffsets(source, issue.start, issue.end),
    message: issue.message,
    code: issue.code,
    source: RISULUA_MODULAR_SOURCE,
    data: {
      rule: {
        category: 'risulua-modular',
        symbol: issue.symbol,
      },
    },
  };
}

function matchLocalRequireShadow(source: string, index: number): { start: number; end: number } | null {
  if (!matchesKeyword(source, index, 'local')) return null;
  let cursor = skipWhitespace(source, index + 'local'.length);
  if (source.startsWith('function', cursor) && !isLuaIdentifierPart(source[cursor + 'function'.length] ?? '')) {
    return null;
  }

  while (cursor < source.length) {
    cursor = skipWhitespace(source, cursor);
    const identifier = matchIdentifier(source, cursor);
    if (!identifier) return null;
    if (identifier.name === 'require') {
      return { start: cursor, end: cursor + identifier.name.length };
    }
    cursor += identifier.name.length;
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === ',') {
      cursor += 1;
      continue;
    }
    return null;
  }
  return null;
}

function matchRequireAlias(source: string, index: number): { start: number; end: number } | null {
  if (!matchesKeyword(source, index, 'require')) return null;
  const before = previousMeaningfulCharacter(source, index);
  const after = nextMeaningfulCharacter(source, index + 'require'.length);
  if (after === '(' || before === '.') {
    return null;
  }
  return { start: index, end: index + 'require'.length };
}

function matchRequireReassignment(source: string, index: number): { start: number; end: number } | null {
  if (!matchesKeyword(source, index, 'require')) return null;
  const cursor = skipWhitespace(source, index + 'require'.length);
  if (source[cursor] !== '=' || source[cursor + 1] === '=') {
    return null;
  }
  return { start: index, end: index + 'require'.length };
}

function matchPackageLoaderMutation(source: string, index: number): { symbol: string; start: number; end: number } | null {
  if (!matchesKeyword(source, index, 'package')) return null;
  const parsed = parsePackageLoaderReference(source, index);
  if (!parsed) return null;

  const cursor = skipWhitespace(source, parsed.end);
  if (source[cursor] !== '=' || source[cursor + 1] === '=') {
    return null;
  }
  return parsed;
}

function parsePackageLoaderReference(source: string, index: number): { symbol: string; start: number; end: number } | null {
  let cursor = index + 'package'.length;
  cursor = skipWhitespace(source, cursor);
  let field: string | null = null;
  let end = cursor;

  if (source[cursor] === '.') {
    cursor += 1;
    const identifier = matchIdentifier(source, cursor);
    if (!identifier) return null;
    field = identifier.name;
    end = cursor + identifier.name.length;
  } else if (source[cursor] === '[') {
    cursor = skipWhitespace(source, cursor + 1);
    const literal = parseStringLiteral(source, cursor);
    if (!literal) return null;
    cursor = skipWhitespace(source, literal.end);
    if (source[cursor] !== ']') return null;
    field = literal.value;
    end = cursor + 1;
  }

  if (!field || !PACKAGE_LOADER_FIELDS.has(field)) {
    return null;
  }

  while (source[skipWhitespace(source, end)] === '[') {
    const open = skipWhitespace(source, end);
    const close = findMatchingBracket(source, open);
    if (close === null) break;
    end = close + 1;
  }

  return { symbol: `package.${field}`, start: index, end };
}

function parseCallArguments(source: string, cursor: number): ParsedCallArguments | null {
  cursor = skipWhitespace(source, cursor);
  if (source[cursor] !== '(') return null;
  const parsed = parseTopLevelArguments(source, cursor + 1);
  if (!parsed) return null;
  return { arguments: parsed.arguments, closeParen: parsed.closeParen };
}

function parseTopLevelArguments(
  source: string,
  start: number,
): { arguments: ParsedLuaArgument[]; closeParen: number } | null {
  const args: ParsedLuaArgument[] = [];
  let cursor = start;
  let argumentStart = skipWhitespace(source, cursor);
  let nestedDepth = 0;

  while (cursor < source.length) {
    const skippedIndex = skipLuaTrivia(source, cursor);
    if (skippedIndex !== cursor) {
      cursor = skippedIndex;
      continue;
    }

    const char = source[cursor];
    if (char === '(' || char === '{' || char === '[') {
      nestedDepth += 1;
      cursor += 1;
      continue;
    }
    if (char === ')' && nestedDepth === 0) {
      const end = trimTrailingWhitespace(source, argumentStart, cursor);
      if (end > argumentStart || args.length > 0) {
        args.push(parseArgument(source, argumentStart, end));
      }
      return { arguments: args, closeParen: cursor };
    }
    if ((char === ')' || char === '}' || char === ']') && nestedDepth > 0) {
      nestedDepth -= 1;
      cursor += 1;
      continue;
    }
    if (char === ',' && nestedDepth === 0) {
      const end = trimTrailingWhitespace(source, argumentStart, cursor);
      args.push(parseArgument(source, argumentStart, end));
      cursor += 1;
      argumentStart = skipWhitespace(source, cursor);
      continue;
    }
    cursor += 1;
  }
  return null;
}

function parseArgument(source: string, start: number, end: number): ParsedLuaArgument {
  const stringLiteral = parseStringLiteral(source, start);
  if (stringLiteral && stringLiteral.end === end) {
    return {
      kind: 'string',
      value: stringLiteral.value,
      start: stringLiteral.contentStart,
      end: stringLiteral.contentEnd,
    };
  }
  const raw = source.slice(start, end);
  if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(raw)) {
    return { kind: 'identifier', value: raw, start, end };
  }
  return { kind: 'other', value: null, start, end };
}

function parseStringLiteral(source: string, start: number): ParsedStringLiteral | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let cursor = start + 1;
  let value = '';
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      const next = source[cursor + 1];
      if (next === undefined) return null;
      value += next;
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return { value, contentStart: start + 1, contentEnd: cursor, end: cursor + 1 };
    }
    value += char;
    cursor += 1;
  }
  return null;
}

function skipLuaTrivia(source: string, index: number): number {
  const char = source[index];
  if (char === '"' || char === "'") return skipQuotedString(source, index);
  if (source.startsWith('--[[', index)) {
    const end = source.indexOf(']]', index + 4);
    return end === -1 ? source.length : end + 2;
  }
  if (source.startsWith('--', index)) {
    const end = source.indexOf('\n', index + 2);
    return end === -1 ? source.length : end + 1;
  }
  if (source.startsWith('[[', index)) {
    const end = source.indexOf(']]', index + 2);
    return end === -1 ? source.length : end + 2;
  }
  return index;
}

function skipQuotedString(source: string, start: number): number {
  const quote = source[start];
  let cursor = start + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) return cursor + 1;
    cursor += 1;
  }
  return source.length;
}

function matchIdentifier(source: string, index: number): { name: string } | null {
  const previous = index > 0 ? source[index - 1] : '';
  if (isLuaIdentifierPart(previous)) return null;
  const match = /^[A-Za-z_][A-Za-z0-9_]*/u.exec(source.slice(index));
  if (!match) return null;
  const next = source[index + match[0].length] ?? '';
  if (isLuaIdentifierPart(next)) return null;
  return { name: match[0] };
}

function matchesKeyword(source: string, index: number, keyword: string): boolean {
  const identifier = matchIdentifier(source, index);
  return identifier?.name === keyword;
}

function previousMeaningfulCharacter(source: string, index: number): string {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/u.test(source[cursor] ?? '')) cursor -= 1;
  return source[cursor] ?? '';
}

function nextMeaningfulCharacter(source: string, index: number): string {
  let cursor = skipWhitespace(source, index);
  return source[cursor] ?? '';
}

function skipWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length && /\s/u.test(source[cursor] ?? '')) cursor += 1;
  return cursor;
}

function trimTrailingWhitespace(source: string, start: number, end: number): number {
  let cursor = end;
  while (cursor > start && /\s/u.test(source[cursor - 1] ?? '')) cursor -= 1;
  return cursor;
}

function findMatchingBracket(source: string, open: number): number | null {
  let cursor = open + 1;
  while (cursor < source.length) {
    const skippedIndex = skipLuaTrivia(source, cursor);
    if (skippedIndex !== cursor) {
      cursor = skippedIndex;
      continue;
    }
    if (source[cursor] === ']') return cursor;
    cursor += 1;
  }
  return null;
}

function rangeFromOffsets(source: string, start: number, end: number): Range {
  return {
    start: positionFromOffset(source, start),
    end: positionFromOffset(source, Math.max(start, end)),
  };
}

function positionFromOffset(source: string, offset: number): Range['start'] {
  let line = 0;
  let character = 0;
  const boundedOffset = Math.max(0, Math.min(offset, source.length));
  for (let index = 0; index < boundedOffset; index += 1) {
    if (source[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return { line, character };
}

function firstLineEnd(source: string): number {
  const newline = source.indexOf('\n');
  return newline === -1 ? source.length : newline;
}

function isLuaIdentifierPart(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z0-9_]/u.test(value));
}
