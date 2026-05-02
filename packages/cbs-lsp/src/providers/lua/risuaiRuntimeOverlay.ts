/**
 * RisuAI Lua runtime API hover/definition overlay helpers.
 * @file packages/cbs-lsp/src/providers/lua/risuaiRuntimeOverlay.ts
 */

import {
  RISUAI_API,
  getRisuAiLuaRuntimeDocumentation,
  getRisuAiLuaRuntimeSignatures,
  type RisuAiLuaRuntimeDocumentation,
} from 'risu-workbench-core';
import {
  CompletionItemKind,
  Hover,
  InsertTextFormat,
  LocationLink,
  MarkupKind,
  Position,
  Range,
  type CompletionItem,
} from 'vscode-languageserver/node';

export interface RisuAiRuntimeToken {
  name: string;
  range: Range;
}

interface LineRange {
  text: string;
  startOffset: number;
}

export interface RisuAiRuntimeCompletionContext {
  source: string;
  position: Position;
  existingLabels?: ReadonlySet<string>;
}

interface RuntimeCompletionPrefixContext {
  prefix: string;
  range: Range;
}

const IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/gu;
const GLOBAL_TABLE_MEMBER_PATTERN = /\b_G\s*\.\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)/gu;
const LUA_IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*$/u;
const RUNTIME_COMPLETION_NAMESPACE_NAMES = new Set(['json', 'Promise']);
const RUNTIME_COMPLETION_SORT_PREFIX = '1000-risu-runtime-';
const SIGNATURES = getRisuAiLuaRuntimeSignatures();
const DOCUMENTATION = getRisuAiLuaRuntimeDocumentation();
const RUNTIME_NAMES = new Set<string>([...Object.keys(RISUAI_API), ...SIGNATURES.keys()]);

/**
 * offsetAt 함수.
 * LSP position을 UTF-16 string offset으로 변환함.
 *
 * @param source - 조회할 Lua source text
 * @param position - 변환할 LSP position
 * @returns source 내부 offset
 */
function offsetAt(source: string, position: Position): number {
  let line = 0;
  let character = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (line === position.line && character === position.character) {
      return index;
    }
    if (source[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return source.length;
}

/**
 * positionAt 함수.
 * UTF-16 string offset을 LSP position으로 변환함.
 *
 * @param source - 조회할 Lua source text
 * @param offset - 변환할 offset
 * @returns offset에 대응하는 LSP position
 */
function positionAt(source: string, offset: number): Position {
  let line = 0;
  let character = 0;
  const end = Math.max(0, Math.min(offset, source.length));
  for (let index = 0; index < end; index += 1) {
    if (source[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return Position.create(line, character);
}

/**
 * getLineRangeAtPosition 함수.
 * 요청 위치가 속한 현재 줄만 추출해 oversized `.risulua`에서도 bounded scan을 유지함.
 *
 * @param source - 조회할 Lua source text
 * @param position - 요청 위치
 * @returns 현재 줄 text와 source 기준 시작 offset
 */
function getLineRangeAtPosition(source: string, position: Position): LineRange {
  const cursorOffset = offsetAt(source, position);
  const lineStart = source.lastIndexOf('\n', Math.max(0, cursorOffset - 1)) + 1;
  const nextLineBreak = source.indexOf('\n', cursorOffset);
  const lineEnd = nextLineBreak === -1 ? source.length : nextLineBreak;
  return {
    text: source.slice(lineStart, lineEnd),
    startOffset: lineStart,
  };
}

/**
 * hasUnclosedLuaStringBeforeCursor 함수.
 * 현재 줄에서 cursor 앞이 Lua 문자열 내부처럼 보이면 runtime completion을 막음.
 *
 * @param text - cursor 앞 현재 줄 텍스트
 * @returns 따옴표 문자열 내부면 true
 */
function hasUnclosedLuaStringBeforeCursor(text: string): boolean {
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
    }
  }

  return quote !== null;
}

/**
 * isLikelyLuaCommentContext 함수.
 * 현재 줄의 cursor 앞에 line comment marker가 있으면 runtime completion을 막음.
 *
 * @param text - cursor 앞 현재 줄 텍스트
 * @returns line comment 문맥이면 true
 */
function isLikelyLuaCommentContext(text: string): boolean {
  return text.includes('--');
}

/**
 * normalizeCompletionLabelForDedupe 함수.
 * LuaLS generated stub label인 `getState(`와 overlay label `getState`를 같은 후보로 비교함.
 *
 * @param label - completion label
 * @returns dedupe에 사용할 normalized label
 */
function normalizeCompletionLabelForDedupe(label: string): string {
  return label.replace(/\($/u, '');
}

/**
 * resolveRuntimeCompletionPrefix 함수.
 * `.risulua` Lua 영역에서 runtime global 후보를 필터링할 identifier prefix와 교체 range를 계산함.
 *
 * @param source - `.risulua` 문서 원문
 * @param position - completion 요청 위치
 * @returns runtime completion prefix context 또는 completion을 제공하지 않을 경우 null
 */
function resolveRuntimeCompletionPrefix(
  source: string,
  position: Position,
): RuntimeCompletionPrefixContext | null {
  const cursorOffset = offsetAt(source, position);
  const lineRange = getLineRangeAtPosition(source, position);
  const cursorInLine = cursorOffset - lineRange.startOffset;
  const beforeCursor = lineRange.text.slice(0, cursorInLine);

  if (beforeCursor.includes('{{')) {
    return null;
  }

  if (hasUnclosedLuaStringBeforeCursor(beforeCursor) || isLikelyLuaCommentContext(beforeCursor)) {
    return null;
  }

  if (/[.:]\s*$/u.test(beforeCursor)) {
    return null;
  }

  const identifierMatch = LUA_IDENTIFIER_PATTERN.exec(beforeCursor);
  const prefix = identifierMatch?.[0] ?? '';
  const prefixStart = cursorOffset - prefix.length;
  const charBeforePrefix = prefixStart > 0 ? source[prefixStart - 1] : '';
  if (charBeforePrefix === '.' || charBeforePrefix === ':') {
    return null;
  }

  return {
    prefix,
    range: Range.create(positionAt(source, prefixStart), positionAt(source, cursorOffset)),
  };
}

/**
 * findRuntimeGlobalTableMember 함수.
 * `_G.axLLM`처럼 Lua global table을 통해 runtime global을 조회하는 member access를 찾음.
 *
 * @param source - `.risulua` 문서 원문
 * @param lineRange - cursor가 속한 줄 정보
 * @param cursorOffset - source 기준 cursor offset
 * @returns runtime token 또는 null
 */
function findRuntimeGlobalTableMember(
  source: string,
  lineRange: LineRange,
  cursorOffset: number,
): RisuAiRuntimeToken | null {
  GLOBAL_TABLE_MEMBER_PATTERN.lastIndex = 0;

  for (const match of lineRange.text.matchAll(GLOBAL_TABLE_MEMBER_PATTERN)) {
    const name = match.groups?.name;
    if (!name || !RUNTIME_NAMES.has(name)) {
      continue;
    }

    const memberStartInLine = match.index ?? 0;
    const memberEndInLine = memberStartInLine + match[0].length;
    const memberStart = lineRange.startOffset + memberStartInLine;
    const memberEnd = lineRange.startOffset + memberEndInLine;
    if (cursorOffset < memberStart || cursorOffset > memberEnd) {
      continue;
    }

    const propertyStart = memberEnd - name.length;
    return {
      name,
      range: Range.create(positionAt(source, propertyStart), positionAt(source, memberEnd)),
    };
  }

  return null;
}

/**
 * findRisuAiRuntimeTokenAtPosition 함수.
 * cursor가 알려진 RisuAI runtime global identifier 위에 있으면 token 정보를 반환함.
 *
 * @param source - `.risulua` 문서 원문
 * @param position - hover/definition 요청 위치
 * @returns runtime token 또는 null
 */
export function findRisuAiRuntimeTokenAtPosition(
  source: string,
  position: Position,
): RisuAiRuntimeToken | null {
  const cursorOffset = offsetAt(source, position);
  const lineRange = getLineRangeAtPosition(source, position);
  const globalTableMember = findRuntimeGlobalTableMember(source, lineRange, cursorOffset);
  if (globalTableMember) {
    return globalTableMember;
  }

  IDENTIFIER_PATTERN.lastIndex = 0;

  for (const match of lineRange.text.matchAll(IDENTIFIER_PATTERN)) {
    const name = match[0];
    const start = lineRange.startOffset + (match.index ?? 0);
    const end = start + name.length;
    if (cursorOffset < start || cursorOffset > end) {
      continue;
    }
    if (!RUNTIME_NAMES.has(name)) {
      return null;
    }
    return {
      name,
      range: Range.create(positionAt(source, start), positionAt(source, end)),
    };
  }

  return null;
}

/**
 * buildRisuAiRuntimeCompletionItems 함수.
 * RisuAI runtime global completion 후보를 core runtime catalog에서 생성함.
 *
 * @param context - completion 요청 문서, 위치, 기존 LuaLS label dedupe set
 * @returns runtime global completion item 목록
 */
export function buildRisuAiRuntimeCompletionItems(
  context: RisuAiRuntimeCompletionContext,
): CompletionItem[] {
  const prefixContext = resolveRuntimeCompletionPrefix(context.source, context.position);
  if (!prefixContext) {
    return [];
  }

  const normalizedPrefix = prefixContext.prefix.toLowerCase();
  const existingLabels = new Set(
    [...(context.existingLabels ?? new Set<string>())].map(normalizeCompletionLabelForDedupe),
  );

  return [...RUNTIME_NAMES]
    .filter((name) => name.toLowerCase().startsWith(normalizedPrefix))
    .filter((name) => !existingLabels.has(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => {
      const signature = SIGNATURES.get(name) ?? `${name}(...: any): any`;
      const documentation = DOCUMENTATION.get(name);
      return {
        label: name,
        kind: RUNTIME_COMPLETION_NAMESPACE_NAMES.has(name)
          ? CompletionItemKind.Module
          : CompletionItemKind.Function,
        detail: signature,
        documentation: {
          kind: MarkupKind.Markdown,
          value: [
            '**RisuAI runtime global completion**',
            '',
            '```lua',
            signature,
            '```',
            '',
            ...createRuntimeDocumentationMarkdown(documentation),
          ]
            .filter(Boolean)
            .join('\n'),
        },
        insertText: name,
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `${RUNTIME_COMPLETION_SORT_PREFIX}${name}`,
        textEdit: {
          range: prefixContext.range,
          newText: name,
        },
      } satisfies CompletionItem;
    });
}

/**
 * createRisuAiRuntimeHover 함수.
 * RisuAI runtime global token에 대한 CBS-LSP 소유 hover markdown을 생성함.
 *
 * @param source - `.risulua` 문서 원문
 * @param position - hover 요청 위치
 * @returns hover 또는 null
 */
export function createRisuAiRuntimeHover(source: string, position: Position): Hover | null {
  const token = findRisuAiRuntimeTokenAtPosition(source, position);
  if (!token) {
    return null;
  }

  const signature = SIGNATURES.get(token.name) ?? `${token.name}(...: any): any`;
  const apiEntry = RISUAI_API[token.name];
  const documentation = DOCUMENTATION.get(token.name);
  const metadata = apiEntry
    ? [`_Category:_ ${apiEntry.cat}`, `_Access:_ ${apiEntry.access}`, `_Direction:_ ${apiEntry.rw}`]
    : [];

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: [
        `**RisuAI Runtime**`,
        '',
        '```lua',
        signature,
        '```',
        '',
        ...createRuntimeDocumentationMarkdown(documentation),
        ...metadata,
      ]
        .filter(Boolean)
        .join('\n'),
    },
    range: token.range,
  };
}

/**
 * createRuntimeDocumentationMarkdown 함수.
 * core runtime documentation catalog 항목을 hover markdown 조각으로 변환함.
 *
 * @param documentation - runtime global에 연결된 문서 항목
 * @returns hover markdown line 목록
 */
function createRuntimeDocumentationMarkdown(
  documentation: RisuAiLuaRuntimeDocumentation | undefined,
): string[] {
  if (!documentation) {
    return [];
  }

  const parameterLines = documentation.parameters.map(
    (parameter) => `- \`${parameter.name}\` — ${parameter.description}`,
  );

  return [
    documentation.summary,
    ...documentation.details,
    parameterLines.length > 0 ? '' : undefined,
    parameterLines.length > 0 ? '**Parameters**' : undefined,
    ...parameterLines,
    documentation.returns ? '' : undefined,
    documentation.returns ? `**Returns:** ${documentation.returns}` : undefined,
    ...documentation.examples.flatMap((example) => ['', '**Example**', '```lua', example, '```']),
    '',
  ].filter((line): line is string => line !== undefined);
}

/**
 * createRisuAiRuntimeDefinition 함수.
 * RisuAI runtime global token을 generated runtime documentation/stub URI로 연결함.
 *
 * @param source - `.risulua` 문서 원문
 * @param position - definition 요청 위치
 * @param runtimeDocUri - definition target으로 사용할 generated stub/document URI
 * @returns LocationLink 목록 또는 null
 */
export function createRisuAiRuntimeDefinition(
  source: string,
  position: Position,
  runtimeDocUri: string,
): LocationLink[] | null {
  const token = findRisuAiRuntimeTokenAtPosition(source, position);
  if (!token) {
    return null;
  }

  const targetRange = Range.create(Position.create(0, 0), Position.create(0, 0));
  return [
    {
      originSelectionRange: token.range,
      targetUri: runtimeDocUri,
      targetRange,
      targetSelectionRange: targetRange,
    },
  ];
}
