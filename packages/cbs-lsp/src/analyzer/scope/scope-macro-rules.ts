/**
 * scope analyzer macro 의미 규칙 선언 테이블.
 * @file packages/cbs-lsp/src/analyzer/scope/scope-macro-rules.ts
 */

import type { VariableSymbolKind } from '../symbolTable';

export type FragmentVariableKind = Extract<VariableSymbolKind, 'chat' | 'temp'>;

export type ScopeMacroRule =
  | {
      kind: 'define-variable';
      variableKind: FragmentVariableKind;
      argumentIndex: number;
    }
  | {
      kind: 'reference-variable';
      variableKind: FragmentVariableKind;
      argumentIndex: number;
    }
  | {
      kind: 'reference-global-variable';
      argumentIndex: number;
    }
  | {
      kind: 'reference-loop-binding';
      argumentIndex: number;
    }
  | {
      kind: 'reference-function';
      argumentIndex: number;
    }
  | {
      kind: 'reference-function-argument';
    };

const SCOPE_MACRO_RULES = {
  setvar: [{ kind: 'define-variable', variableKind: 'chat', argumentIndex: 0 }],
  setdefaultvar: [{ kind: 'define-variable', variableKind: 'chat', argumentIndex: 0 }],
  addvar: [
    { kind: 'define-variable', variableKind: 'chat', argumentIndex: 0 },
    { kind: 'reference-variable', variableKind: 'chat', argumentIndex: 0 },
  ],
  settempvar: [{ kind: 'define-variable', variableKind: 'temp', argumentIndex: 0 }],
  getvar: [{ kind: 'reference-variable', variableKind: 'chat', argumentIndex: 0 }],
  tempvar: [{ kind: 'reference-variable', variableKind: 'temp', argumentIndex: 0 }],
  gettempvar: [{ kind: 'reference-variable', variableKind: 'temp', argumentIndex: 0 }],
  getglobalvar: [{ kind: 'reference-global-variable', argumentIndex: 0 }],
  slot: [{ kind: 'reference-loop-binding', argumentIndex: 0 }],
  call: [{ kind: 'reference-function', argumentIndex: 0 }],
  arg: [{ kind: 'reference-function-argument' }],
} satisfies Record<string, readonly ScopeMacroRule[]>;

/**
 * getScopeMacroRules 함수.
 * 정규화된 macro 이름에 대응하는 scope 영향 규칙을 돌려줌.
 *
 * @param normalizedName - 대소문자/구분문자 제거가 끝난 macro 이름
 * @returns 해당 macro의 scope rule 목록
 */
export function getScopeMacroRules(normalizedName: string): readonly ScopeMacroRule[] {
  return SCOPE_MACRO_RULES[normalizedName as keyof typeof SCOPE_MACRO_RULES] ?? [];
}
