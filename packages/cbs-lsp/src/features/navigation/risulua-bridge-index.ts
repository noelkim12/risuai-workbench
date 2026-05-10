import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Hover, LocationLink, MarkupKind, Position, Range } from 'vscode-languageserver/node';

import { analyzeLuaWithWasmSync, type LuaWasmAnalyzeResult } from 'risu-workbench-core';

export interface RisuLuaBridgeModuleResult {
  readonly text: string;
  readonly wasmResult: LuaWasmAnalyzeResult;
}

export interface BuildRisuLuaBridgeIndexParams {
  readonly uri: string;
  readonly text: string;
  readonly wasmResult: LuaWasmAnalyzeResult;
  readonly moduleResults?: ReadonlyMap<string, RisuLuaBridgeModuleResult>;
}

export interface RisuLuaPublicBridge {
  readonly publicName: string;
  readonly publicRange: Range;
  readonly aliasName: string;
  readonly moduleName: string;
  readonly moduleUri: string | null;
  readonly exportName: string;
  readonly memberRange: Range;
  readonly targetDefinitionUri: string | null;
  readonly targetDefinitionRange: Range | null;
  readonly sourceOrigin: { readonly path: string; readonly line: number; readonly character: number } | null;
}

export interface RisuLuaBridgeIndex {
  readonly uri: string;
  readonly publicBridgesByName: ReadonlyMap<string, RisuLuaPublicBridge>;
}

export function buildRisuLuaBridgeIndex(params: BuildRisuLuaBridgeIndexParams): RisuLuaBridgeIndex {
  const aliases = new Map(params.wasmResult.requireAliases.map((alias) => [alias.aliasName, alias]));
  const publicBridges = new Map<string, RisuLuaPublicBridge>();

  for (const assignment of params.wasmResult.memberBridgeAssignments) {
    const alias = aliases.get(assignment.aliasName);
    if (!alias) {
      continue;
    }

    const moduleUri = resolveModuleUri(params.uri, alias.moduleName);
    const moduleResult = moduleUri ? params.moduleResults?.get(moduleUri) ?? loadModuleResult(moduleUri) : null;
    const targetDefinition =
      moduleResult?.wasmResult.moduleMemberDefinitions.find(
        (definition) => definition.exportName === assignment.memberName,
      ) ?? null;

    publicBridges.set(assignment.publicName, {
      publicName: assignment.publicName,
      publicRange: rangeFromUtf16(params.text, assignment.publicStartUtf16, assignment.publicEndUtf16),
      aliasName: assignment.aliasName,
      moduleName: alias.moduleName,
      moduleUri,
      exportName: assignment.memberName,
      memberRange: rangeFromUtf16(params.text, assignment.memberStartUtf16, assignment.memberEndUtf16),
      targetDefinitionUri: targetDefinition && moduleUri ? moduleUri : null,
      targetDefinitionRange:
        targetDefinition && moduleResult
          ? rangeFromUtf16(moduleResult.text, targetDefinition.nameStartUtf16, targetDefinition.nameEndUtf16)
          : null,
      sourceOrigin: findSourceOrigin(params.wasmResult, assignment.statementStartUtf16),
    });
  }

  return { uri: params.uri, publicBridgesByName: publicBridges };
}

export function createRisuLuaBridgeDefinition(
  text: string,
  position: Position,
  uri: string,
  moduleResults?: ReadonlyMap<string, RisuLuaBridgeModuleResult>,
): LocationLink[] | null {
  const bridge = findBridgeAtPosition(text, position, uri, moduleResults);
  if (!bridge) {
    return null;
  }
  if (!bridge.targetDefinitionUri || !bridge.targetDefinitionRange) {
    return null;
  }

  const originSelectionRange = isPositionInside(bridge.memberRange, position)
    ? bridge.memberRange
    : bridge.publicRange;
  return [
    {
      targetUri: bridge.targetDefinitionUri,
      targetRange: bridge.targetDefinitionRange,
      targetSelectionRange: bridge.targetDefinitionRange,
      originSelectionRange,
    },
  ];
}

export function createRisuLuaBridgeHover(
  text: string,
  position: Position,
  uri: string,
  moduleResults?: ReadonlyMap<string, RisuLuaBridgeModuleResult>,
): Hover | null {
  const bridge = findBridgeAtPosition(text, position, uri, moduleResults);
  if (!bridge) {
    return null;
  }

  const lines = [
    `**${bridge.publicName}**`,
    '',
    'Generated RisuLua bridge.',
    '',
    `- Public symbol: \`${bridge.publicName}\``,
    `- Module export: \`${bridge.moduleName}.${bridge.exportName}\``,
  ];
  if (bridge.sourceOrigin) {
    lines.push(
      `- Source: \`${bridge.sourceOrigin.path}:${bridge.sourceOrigin.line}:${bridge.sourceOrigin.character}\``,
    );
  }

  return {
    contents: { kind: MarkupKind.Markdown, value: lines.join('\n') },
    range: bridge.publicRange,
  };
}

function findBridgeAtPosition(
  text: string,
  position: Position,
  uri: string,
  moduleResults?: ReadonlyMap<string, RisuLuaBridgeModuleResult>,
): RisuLuaPublicBridge | null {
  const wasmResult = analyzeLuaWithWasmSync(text, {
    includeRequireAliases: true,
    includeMemberBridgeAssignments: true,
    includeModuleMemberDefinitions: false,
    includeSourceComments: true,
  });
  const index = buildRisuLuaBridgeIndex({ uri, text, wasmResult, moduleResults });
  for (const bridge of index.publicBridgesByName.values()) {
    if (isPositionInside(bridge.publicRange, position) || isPositionInside(bridge.memberRange, position)) {
      return bridge;
    }
  }
  return null;
}

function loadModuleResult(moduleUri: string): RisuLuaBridgeModuleResult | null {
  try {
    const filePath = fileURLToPath(moduleUri);
    const text = fs.readFileSync(filePath, 'utf8');
    return {
      text,
      wasmResult: analyzeLuaWithWasmSync(text, { includeModuleMemberDefinitions: true }),
    };
  } catch {
    return null;
  }
}

function findSourceOrigin(
  wasmResult: LuaWasmAnalyzeResult,
  statementStartUtf16: number,
): RisuLuaPublicBridge['sourceOrigin'] {
  const exact = wasmResult.sourceComments.find(
    (comment) => comment.appliesToStatementStartUtf16 === statementStartUtf16,
  );
  const fallback = [...wasmResult.sourceComments]
    .reverse()
    .find((comment) => comment.commentEndUtf16 <= statementStartUtf16);
  const sourceComment = exact ?? fallback;
  if (!sourceComment) {
    return null;
  }
  return {
    path: sourceComment.sourcePath,
    line: sourceComment.sourceLine,
    character: sourceComment.sourceCharacter,
  };
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }
  return starts;
}

function positionAt(lineStarts: readonly number[], offset: number): Position {
  let line = 0;
  for (let index = 0; index < lineStarts.length; index += 1) {
    if ((lineStarts[index] ?? 0) > offset) {
      break;
    }
    line = index;
  }
  return Position.create(line, offset - (lineStarts[line] ?? 0));
}

function rangeFromUtf16(text: string, start: number, end: number): Range {
  const lineStarts = buildLineStarts(text);
  return Range.create(positionAt(lineStarts, start), positionAt(lineStarts, end));
}

function comparePositions(left: Position, right: Position): number {
  return left.line - right.line || left.character - right.character;
}

function isPositionInside(range: Range, position: Position): boolean {
  return comparePositions(range.start, position) <= 0 && comparePositions(position, range.end) < 0;
}

function resolveModuleUri(mainUri: string, moduleName: string): string | null {
  if (!isSafeModuleName(moduleName)) {
    return null;
  }
  try {
    const mainPath = fileURLToPath(mainUri);
    const luaRoot = path.dirname(mainPath);
    const targetPath = path.join(luaRoot, ...moduleName.split('.')) + '.risulua';
    if (!fs.existsSync(targetPath)) {
      return null;
    }
    return pathToFileURL(targetPath).href;
  } catch {
    return null;
  }
}

function isSafeModuleName(moduleName: string): boolean {
  return moduleName
    .split('.')
    .every((segment) => segment.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment));
}
