/**
 * CBS 자동 suggestion 트리거 순수 predicate 모음.
 * @file packages/vscode/src/completion/cbsAutoSuggestCore.ts
 */

const CBS_LANGUAGE_IDS = new Set([
  'risulorebook',
  'risuregex',
  'risuprompt',
  'risuhtml',
  'risulua',
]);

export interface CbsAutoSuggestInput {
  fileName?: string;
  insertedText: string;
  languageId: string;
  linePrefix: string;
}

export interface CbsAutoCloseInput {
  documentSuffix?: string;
  fileName?: string;
  insertedText: string;
  languageId: string;
  linePrefix: string;
  lineSuffix: string;
}

export interface CbsAutoSuggestDocumentInput {
  documentLength: number;
  fileName?: string;
  languageId: string;
}

export const MAX_RISULUA_AUTO_SUGGEST_TEXT_LENGTH = 512 * 1024;

const CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN =
  /\{\{\s*(?:getvar|setvar|addvar|gettempvar|settempvar|tempvar|metadata|call)::[^{}]*$/i;
const CBS_WHEN_BLOCK_OPEN_PATTERN = /^\{\{\s*#when(?=$|[\s:}])/i;
const CBS_AUTO_CLOSE_BLOCK_NAMES = new Set([
  'if',
  'if_pure',
  'when',
  'each',
  'pure',
  'puredisplay',
  'escape',
  'func',
]);
const CBS_BLOCK_OPEN_NAME_PATTERN = /^#([a-z_][\w]*)(?=$|[\s:}])/i;
const CBS_CLOSE_TAG_SUFFIX_PATTERN = /\{\{\/[a-z_][\w]*\}\}$/i;

function isRisuluaFileName(fileName: string | undefined): boolean {
  return (fileName ?? '').toLowerCase().endsWith('.risulua');
}

function isCbsDocumentInput(input: { fileName?: string; languageId: string }): boolean {
  return CBS_LANGUAGE_IDS.has(input.languageId) || (input.languageId === 'lua' && isRisuluaFileName(input.fileName));
}

function isRisuluaDocumentInput(input: { fileName?: string; languageId: string }): boolean {
  return input.languageId === 'risulua' || isRisuluaFileName(input.fileName);
}

/**
 * hasCbsBlockBoundaryAhead 함수.
 * 커서 뒤에 이미 닫힌 block header나 대응 close tag가 있는지 확인함.
 *
 * @param lineSuffix - 커서 직후부터 같은 줄 끝까지의 텍스트
 * @param documentSuffix - 커서 직후부터 문서 끝까지의 텍스트
 * @param closeText - block opener에 대응하는 close tag 텍스트
 * @returns 자동 close tag를 추가하지 않아야 하는 block 경계가 있으면 true
 */
function hasCbsBlockBoundaryAhead(
  lineSuffix: string,
  documentSuffix: string | undefined,
  closeText: string,
): boolean {
  const trimmedSuffix = lineSuffix.trimStart();
  const trimmedDocumentSuffix = documentSuffix?.trimStart() ?? '';

  return (
    trimmedSuffix.startsWith(closeText) ||
    trimmedSuffix.startsWith('}}') ||
    trimmedDocumentSuffix.startsWith(closeText)
  );
}

/**
 * hasOpenCbsWhenArgumentPrefix 함수.
 * 커서 앞 줄 prefix가 아직 닫히지 않은 #when header argument 영역인지 확인함.
 *
 * @param linePrefix - 같은 줄 시작부터 커서 직전까지의 텍스트
 * @returns #when header 안에서 `::` 뒤 suggestion이 필요하면 true
 */
function hasOpenCbsWhenArgumentPrefix(linePrefix: string): boolean {
  let whenOpenIndex = linePrefix.lastIndexOf('{{#when');
  if (whenOpenIndex === -1) {
    whenOpenIndex = linePrefix.lastIndexOf('{{ #when');
  }
  if (whenOpenIndex === -1) {
    return false;
  }

  const whenPrefix = linePrefix.slice(whenOpenIndex);
  if (!CBS_WHEN_BLOCK_OPEN_PATTERN.test(whenPrefix)) {
    return false;
  }

  let depth = 0;
  for (let index = 0; index < whenPrefix.length; index += 1) {
    const pair = whenPrefix.slice(index, index + 2);
    if (pair === '{{') {
      depth += 1;
      index += 1;
      continue;
    }
    if (pair === '}}') {
      depth = Math.max(0, depth - 1);
      index += 1;
    }
  }

  return depth > 0 && whenPrefix.includes('::');
}

/**
 * shouldTriggerCbsAutoSuggest 함수.
 * VS Code 단일 trigger character 재요청이 놓칠 수 있는 `{{` prefix를 감지함.
 *
 * @param input - 문서 언어와 방금 입력된 텍스트, 커서 앞 줄 prefix
 * @returns CBS suggestion을 명시적으로 트리거해야 하면 true
 */
export function shouldTriggerCbsAutoSuggest(input: CbsAutoSuggestInput): boolean {
  if (!isCbsDocumentInput(input)) {
    return false;
  }

  if (input.insertedText.includes('{') && input.linePrefix.endsWith('{{')) {
    return true;
  }

  return (
    input.insertedText.includes(':') &&
    (CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN.test(input.linePrefix) ||
      hasOpenCbsWhenArgumentPrefix(input.linePrefix))
  );
}

/**
 * shouldSkipCbsAutoSuggestForDocument 함수.
 * 거대 `.risulua`에서 client-side suggest fallback이 추가 텍스트를 읽지 않게 막음.
 *
 * @param input - 문서 언어와 전체 character 길이
 * @returns auto suggest fallback을 건너뛰어야 하면 true
 */
export function shouldSkipCbsAutoSuggestForDocument(input: CbsAutoSuggestDocumentInput): boolean {
  return isRisuluaDocumentInput(input) && input.documentLength > MAX_RISULUA_AUTO_SUGGEST_TEXT_LENGTH;
}

/**
 * getCbsAutoCloseText 함수.
 * CBS block open 구문이 닫히는 순간 붙일 close tag를 계산함.
 *
 * @param input - 문서 언어와 방금 입력된 텍스트, 커서 주변 텍스트
 * @returns 자동 삽입할 close tag, 대상이 아니면 null
 */
export function getCbsAutoCloseText(input: CbsAutoCloseInput): string | null {
  if (!isCbsDocumentInput(input) || !input.insertedText.includes('}')) {
    return null;
  }

  if (!input.linePrefix.endsWith('}}')) {
    return null;
  }

  if (CBS_CLOSE_TAG_SUFFIX_PATTERN.test(input.linePrefix)) {
    return null;
  }

  const blockOpenIndex = input.linePrefix.lastIndexOf('{{#');
  if (blockOpenIndex === -1) {
    return null;
  }

  const blockHeader = input.linePrefix.slice(blockOpenIndex + 2, -2).trim();
  const match = CBS_BLOCK_OPEN_NAME_PATTERN.exec(blockHeader);
  const blockName = match?.[1]?.toLowerCase();
  if (!blockName || !CBS_AUTO_CLOSE_BLOCK_NAMES.has(blockName)) {
    return null;
  }

  const closeText = `{{/${blockName}}}`;
  if (hasCbsBlockBoundaryAhead(input.lineSuffix, input.documentSuffix, closeText)) {
    return null;
  }

  return closeText;
}
