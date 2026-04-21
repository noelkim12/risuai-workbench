/**
 * scope analyzer frame 체인과 lookup helper 모음.
 * @file packages/cbs-lsp/src/analyzer/scope/scope-frame.ts
 */

import type { FunctionSymbol, VariableSymbol } from '../symbolTable';

export interface ScopeFrame {
  parent: ScopeFrame | null;
  loopBindings: Map<string, VariableSymbol>;
  activeFunction: FunctionSymbol | null;
}

/**
 * createScopeFrame 함수.
 * loop binding과 active function 문맥을 담는 새 scope frame을 생성함.
 *
 * @param parent - 부모 scope frame, 최상위면 null
 * @returns parent chain이 연결된 새 scope frame
 */
export function createScopeFrame(parent: ScopeFrame | null = null): ScopeFrame {
  return {
    parent,
    loopBindings: new Map(),
    activeFunction: parent?.activeFunction ?? null,
  };
}

/**
 * findLoopBinding 함수.
 * 현재 scope에서 부모 방향으로 올라가며 보이는 loop alias 정의를 찾음.
 *
 * @param scope - 검색을 시작할 현재 scope frame
 * @param name - 찾을 loop alias 이름
 * @returns 현재 scope 체인에서 연결된 loop symbol, 없으면 undefined
 */
export function findLoopBinding(scope: ScopeFrame, name: string): VariableSymbol | undefined {
  let currentScope: ScopeFrame | null = scope;

  while (currentScope) {
    const loopSymbol = currentScope.loopBindings.get(name);
    if (loopSymbol) {
      return loopSymbol;
    }

    currentScope = currentScope.parent;
  }

  return undefined;
}

/**
 * findActiveFunction 함수.
 * 현재 scope 체인에서 유효한 active function 문맥을 찾음.
 *
 * @param scope - 검색을 시작할 현재 scope frame
 * @returns 가장 안쪽에서 보이는 function symbol, 없으면 null
 */
export function findActiveFunction(scope: ScopeFrame): FunctionSymbol | null {
  let currentScope: ScopeFrame | null = scope;

  while (currentScope) {
    if (currentScope.activeFunction) {
      return currentScope.activeFunction;
    }

    currentScope = currentScope.parent;
  }

  return null;
}
