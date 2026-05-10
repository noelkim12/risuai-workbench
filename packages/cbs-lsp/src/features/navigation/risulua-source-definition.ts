/**
 * RisuLua generated source comment Go to Definition support.
 * @file packages/cbs-lsp/src/features/navigation/risulua-source-definition.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hover, LocationLink, MarkupKind, Position, Range } from 'vscode-languageserver/node';

import { CbsLspPathHelper } from '../../helpers/path-helper';

const SOURCE_COMMENT_PATTERN = /^\s*---@source\s+(.+):([0-9]+):([0-9]+)\s*$/u;
const SOURCE_MARKER = '---@source';
const MODULE_TABLE_DOCS_MARKER = path.join('docs', 'risulua-button-action-index.json');

export interface RisuLuaSourceCommentTarget {
  column: number;
  line: number;
  sourcePath: string;
}

export interface RisuLuaSourceCommentDefinitionOptions {
  exists?: (filePath: string) => boolean;
}

export function parseRisuLuaSourceCommentLine(lineText: string): RisuLuaSourceCommentTarget | null {
  const match = SOURCE_COMMENT_PATTERN.exec(lineText);
  if (!match) {
    return null;
  }

  const sourcePath = match[1]?.trim() ?? '';
  const line = Number.parseInt(match[2] ?? '', 10);
  const column = Number.parseInt(match[3] ?? '', 10);

  if (
    sourcePath.length === 0 ||
    !Number.isInteger(line) ||
    !Number.isInteger(column) ||
    line < 1 ||
    column < 0
  ) {
    return null;
  }

  return { column, line, sourcePath };
}

export function hasRisuLuaSourceCommentAtPosition(source: string, position: Position): boolean {
  const lines = source.split(/\n/u);
  const lineText = lines[position.line];
  return lineText !== undefined && parseRisuLuaSourceCommentLine(lineText) !== null;
}

export function createRisuLuaSourceCommentDefinition(
  source: string,
  position: Position,
  sourceUri: string,
  options: RisuLuaSourceCommentDefinitionOptions = {},
): LocationLink[] | null {
  const lines = source.split(/\n/u);
  const lineText = lines[position.line];
  if (lineText === undefined) {
    return null;
  }

  const target = parseRisuLuaSourceCommentLine(lineText);
  if (!target) {
    return null;
  }

  const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(sourceUri);
  const targetFilePath = resolveRisuLuaSourceTargetPath(sourceFilePath, target.sourcePath);
  const exists = options.exists ?? fs.existsSync;
  if (!exists(targetFilePath)) {
    return null;
  }

  const targetPosition = Position.create(target.line - 1, target.column);
  const targetRange = Range.create(targetPosition, targetPosition);
  return [
    {
      originSelectionRange: createSourceCommentOriginRange(lineText, position.line),
      targetUri: pathToFileURL(targetFilePath).href,
      targetRange,
      targetSelectionRange: targetRange,
    },
  ];
}

export function createRisuLuaSourceCommentHover(
  source: string,
  position: Position,
  sourceUri: string,
  options: RisuLuaSourceCommentDefinitionOptions = {},
): Hover | null {
  const lines = source.split(/\n/u);
  const lineText = lines[position.line];
  if (lineText === undefined) {
    return null;
  }

  const target = parseRisuLuaSourceCommentLine(lineText);
  if (!target) {
    return null;
  }

  const sourceFilePath = CbsLspPathHelper.getFilePathFromUri(sourceUri);
  const targetFilePath = resolveRisuLuaSourceTargetPath(sourceFilePath, target.sourcePath);
  const exists = options.exists ?? fs.existsSync;
  const targetExists = exists(targetFilePath);
  const sourceLocation = `${target.sourcePath}:${target.line}:${target.column}`;
  const availabilityLine = targetExists
    ? 'Go to Definition opens the original source location directly; LuaLS is skipped for this generated source marker.'
    : 'The referenced source file is missing, so Go to Definition has no target; LuaLS is still skipped for this generated source marker.';

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        '**RisuLua generated source**',
        '',
        `Generated from \`${sourceLocation}\`.`,
        '',
        availabilityLine,
      ].join('\n'),
    },
    range: createSourceCommentOriginRange(lineText, position.line),
  };
}

function resolveRisuLuaSourceTargetPath(sourceFilePath: string, sourcePath: string): string {
  if (path.isAbsolute(sourcePath)) {
    return path.normalize(sourcePath);
  }

  const workspaceRoot = resolveGeneratedRisuLuaWorkspaceRoot(sourceFilePath);
  return path.normalize(path.join(workspaceRoot, sourcePath));
}

function resolveGeneratedRisuLuaWorkspaceRoot(sourceFilePath: string): string {
  const markerRoot = findAncestorContaining(sourceFilePath, MODULE_TABLE_DOCS_MARKER);
  if (markerRoot) {
    return markerRoot;
  }

  const artifactRoot = CbsLspPathHelper.resolveWorkspaceRootFromFilePath(sourceFilePath);
  if (artifactRoot) {
    return artifactRoot;
  }

  const normalized = path.normalize(sourceFilePath);
  const segments = normalized.split(path.sep);
  const luaIndex = segments.lastIndexOf('lua');
  if (luaIndex > 0) {
    const root = segments.slice(0, luaIndex).join(path.sep);
    return root.length > 0 ? root : path.sep;
  }

  return path.dirname(sourceFilePath);
}

function findAncestorContaining(filePath: string, relativeMarkerPath: string): string | null {
  let current = path.dirname(path.normalize(filePath));
  while (true) {
    if (fs.existsSync(path.join(current, relativeMarkerPath))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function createSourceCommentOriginRange(lineText: string, line: number): Range {
  const markerIndex = lineText.indexOf(SOURCE_MARKER);
  const startCharacter = markerIndex >= 0 ? markerIndex + SOURCE_MARKER.length + 1 : 0;
  const endCharacter = lineText.trimEnd().length;
  return Range.create(
    Position.create(line, startCharacter),
    Position.create(line, Math.max(startCharacter, endCharacter)),
  );
}
