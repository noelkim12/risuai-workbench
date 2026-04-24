/**
 * CBS 자동 suggestion 트리거 순수 predicate 모음.
 * @file packages/vscode/src/completion/cbsAutoSuggestCore.ts
 */

const CBS_LANGUAGE_IDS = new Set(['risulorebook', 'risuregex', 'risuprompt', 'risuhtml', 'risulua']);

export interface CbsAutoSuggestInput {
  insertedText: string;
  languageId: string;
  linePrefix: string;
}

const CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN = /\{\{\s*(?:getvar|setvar|addvar|gettempvar|settempvar|tempvar|metadata|call)::[^{}]*$/i;

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

  return input.insertedText.includes(':') && CBS_ARGUMENT_COMPLETION_PREFIX_PATTERN.test(input.linePrefix);
}
