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
  insertedText: string;
  languageId: string;
  linePrefix: string;
}

export interface CbsAutoCloseInput {
  insertedText: string;
  languageId: string;
  linePrefix: string;
  lineSuffix: string;
}

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
  if (!CBS_LANGUAGE_IDS.has(input.languageId)) {
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
 * getCbsAutoCloseText 함수.
 * CBS block open 구문이 닫히는 순간 붙일 close tag를 계산함.
 *
 * @param input - 문서 언어와 방금 입력된 텍스트, 커서 주변 한 줄 텍스트
 * @returns 자동 삽입할 close tag, 대상이 아니면 null
 */
export function getCbsAutoCloseText(input: CbsAutoCloseInput): string | null {
  if (!CBS_LANGUAGE_IDS.has(input.languageId) || !input.insertedText.includes('}')) {
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
  if (input.lineSuffix.trimStart().startsWith(closeText)) {
    return null;
  }

  return closeText;
}
