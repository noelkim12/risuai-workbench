/**
 * CBS scope 분석에서 변수/함수 심볼과 참조를 추적하는 심볼 테이블.
 * @file packages/cbs-lsp/src/analyzer/symbolTable.ts
 */
import type { Range } from 'risu-workbench-core';

/**
 * VariableSymbolKind 타입.
 * CBS scope analyzer가 추적하는 변수 namespace 종류를 구분함.
 */
export type VariableSymbolKind = 'chat' | 'temp' | 'global' | 'loop';

/**
 * VariableSymbolScope 타입.
 * 변수 심볼이 유효한 분석 범위와 외부 제공 여부를 나타냄.
 */
export type VariableSymbolScope = 'fragment' | 'block' | 'external';

/**
 * FunctionSymbolScope 타입.
 * CBS 로컬 함수 심볼의 lookup 범위를 나타냄.
 */
export type FunctionSymbolScope = 'fragment';

/**
 * VariableSymbol 인터페이스.
 * CBS fragment 안에서 수집된 변수 정의와 참조 범위를 표현함.
 */
export interface VariableSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: VariableSymbolKind;
  readonly scope: VariableSymbolScope;
  readonly definitionRange?: Range;
  readonly definitionRanges: readonly Range[];
  readonly references: readonly Range[];
}

/**
 * UndefinedVariableReference 인터페이스.
 * 정의를 찾지 못한 변수 참조를 diagnostics 단계로 전달함.
 */
export interface UndefinedVariableReference {
  readonly name: string;
  readonly kind: Exclude<VariableSymbolKind, 'global'>;
  readonly range: Range;
}

/**
 * InvalidArgumentReference 인터페이스.
 * arg 참조가 함수 경계나 파라미터 개수 계약을 위반한 위치를 기록함.
 */
export interface InvalidArgumentReference {
  readonly rawText: string;
  readonly index: number | null;
  readonly range: Range;
  readonly reason: 'outside-function' | 'out-of-range';
  readonly functionName?: string;
  readonly parameterCount?: number;
}

/**
 * FunctionSymbol 인터페이스.
 * CBS 로컬 함수 정의와 호출 참조를 파라미터 정보와 함께 표현함.
 */
export interface FunctionSymbol {
  readonly id: string;
  readonly name: string;
  readonly scope: FunctionSymbolScope;
  readonly definitionRange?: Range;
  readonly definitionRanges: readonly Range[];
  readonly references: readonly Range[];
  readonly parameters: readonly string[];
}

/**
 * ScopeIssue 타입.
 * scope analyzer가 diagnostics로 넘길 semantic issue union.
 */
export type ScopeIssue = UndefinedVariableReference | InvalidArgumentReference;

/**
 * ScopeAnalysisResult 인터페이스.
 * scope 분석 결과인 심볼 테이블과 issue store를 함께 전달함.
 */
export interface ScopeAnalysisResult {
  readonly symbolTable: SymbolTable;
  readonly issues: ScopeIssueStore;
}

interface MutableVariableSymbol {
  id: string;
  name: string;
  kind: VariableSymbolKind;
  scope: VariableSymbolScope;
  definitionRange?: Range;
  definitionRanges: Range[];
  references: Range[];
}

interface MutableFunctionSymbol {
  id: string;
  name: string;
  scope: FunctionSymbolScope;
  definitionRange?: Range;
  definitionRanges: Range[];
  references: Range[];
  parameters: string[];
}

/**
 * ScopeIssueStore 클래스.
 * scope 분석 중 발견한 semantic issue를 심볼 저장소와 분리해 보관함.
 */
export class ScopeIssueStore {
  private readonly undefinedReferences: UndefinedVariableReference[] = [];
  private readonly invalidArgumentReferences: InvalidArgumentReference[] = [];

  /**
   * recordUndefinedReference 함수.
   * 해석에 실패한 변수 참조를 후속 diagnostics 단계에서 읽을 수 있게 기록함.
   *
   * @param name - 정의를 찾지 못한 변수 이름
   * @param kind - 변수 종류별 diagnostics wording에 사용할 심볼 종류
   * @param range - 미해결 참조가 등장한 문서 범위
   */
  recordUndefinedReference(
    name: string,
    kind: UndefinedVariableReference['kind'],
    range: Range,
  ): void {
    this.undefinedReferences.push({
      name,
      kind,
      range,
    });
  }

  /**
   * recordInvalidArgumentReference 함수.
   * 함수 밖 arg 참조나 범위를 벗어난 인자 참조를 diagnostics용으로 보존함.
   *
   * @param reference - invalid argument diagnostics에 필요한 원본 정보 묶음
   */
  recordInvalidArgumentReference(reference: InvalidArgumentReference): void {
    this.invalidArgumentReferences.push(reference);
  }

  /**
   * getUndefinedReferences 함수.
   * 기록된 undefined variable 참조 목록을 복사본으로 반환함.
   *
   * @returns 기록된 undefined variable 참조 목록
   */
  getUndefinedReferences(): readonly UndefinedVariableReference[] {
    return [...this.undefinedReferences];
  }

  /**
   * getInvalidArgumentReferences 함수.
   * 기록된 invalid arg 참조 목록을 복사본으로 반환함.
   *
   * @returns 기록된 invalid arg 참조 목록
   */
  getInvalidArgumentReferences(): readonly InvalidArgumentReference[] {
    return [...this.invalidArgumentReferences];
  }

  /**
   * getAll 함수.
   * 현재 issue store에 쌓인 semantic issue를 단일 배열로 반환함.
   *
   * @returns undefined/invalid-argument issue 전체 목록
   */
  getAll(): readonly ScopeIssue[] {
    return [...this.undefinedReferences, ...this.invalidArgumentReferences];
  }
}

/**
 * SymbolTable 클래스.
 * CBS fragment 안에서 수집한 변수/함수 정의와 참조를 조회 가능한 형태로 유지함.
 */
export class SymbolTable {
  private nextSymbolId = 0;
  private readonly variables: MutableVariableSymbol[] = [];
  private readonly variablesByKey = new Map<string, MutableVariableSymbol[]>();
  private readonly functions: MutableFunctionSymbol[] = [];
  private readonly functionsByName = new Map<string, MutableFunctionSymbol[]>();

  /**
   * addDefinition 함수.
   * 같은 스코프에서 재사용 가능한 변수 정의를 등록하거나 기존 심볼에 정의 범위를 추가함.
   *
   * @param name - 추적할 변수 이름
   * @param kind - 변수 lookup key를 결정할 심볼 종류
   * @param range - 이번 정의가 등장한 문서 범위
   * @param options - 스코프와 중복 허용 정책을 담은 옵션
   * @returns 등록되거나 재사용된 변수 심볼
   */
  addDefinition(
    name: string,
    kind: VariableSymbolKind,
    range: Range,
    options: {
      scope?: VariableSymbolScope;
      allowDuplicate?: boolean;
    } = {},
  ): VariableSymbol {
    const { scope = 'fragment', allowDuplicate = false } = options;
    const existing = !allowDuplicate ? this.findSymbol(name, kind, scope) : undefined;
    if (existing) {
      this.addRangeOnce(existing.definitionRanges, range);

      if (!existing.definitionRange) {
        existing.definitionRange = range;
      }

      return existing;
    }

    const symbol: MutableVariableSymbol = {
      id: `symbol-${this.nextSymbolId++}`,
      name,
      kind,
      scope,
      definitionRange: range,
      definitionRanges: [range],
      references: [],
    };

    this.registerSymbol(symbol);
    return symbol;
  }

  /**
   * addFunctionDefinition 함수.
   * fragment 안의 로컬 함수 선언을 등록하고 첫 선언의 파라미터를 canonical definition으로 유지함.
   *
   * @param name - 추적할 로컬 함수 이름
   * @param range - 함수 선언이 시작된 문서 범위
   * @param parameters - 함수 호출 검증에 사용할 파라미터 이름 목록
   * @returns 등록되거나 재사용된 함수 심볼
   */
  addFunctionDefinition(
    name: string,
    range: Range,
    parameters: readonly string[] = [],
  ): FunctionSymbol {
    const existing = this.findFunction(name, 'fragment');
    if (existing) {
      this.addRangeOnce(existing.definitionRanges, range);
      if (!existing.definitionRange) {
        existing.definitionRange = range;
      }

      return existing;
    }

    const symbol: MutableFunctionSymbol = {
      id: `function-${this.nextSymbolId++}`,
      name,
      scope: 'fragment',
      definitionRange: range,
      definitionRanges: [range],
      references: [],
      parameters: [...parameters],
    };

    this.registerFunction(symbol);
    return symbol;
  }

  /**
   * ensureExternalSymbol 함수.
   * 문서 밖에서 들어오는 전역 심볼을 external scope placeholder로 보장함.
   *
   * @param name - 외부 전역 심볼 이름
   * @param kind - external scope로 취급할 전역 심볼 종류
   * @returns 기존 또는 새로 만든 external 변수 심볼
   */
  ensureExternalSymbol(name: string, kind: Extract<VariableSymbolKind, 'global'>): VariableSymbol {
    const existing = this.findSymbol(name, kind, 'external');
    if (existing) {
      return existing;
    }

    const symbol: MutableVariableSymbol = {
      id: `symbol-${this.nextSymbolId++}`,
      name,
      kind,
      scope: 'external',
      definitionRanges: [],
      references: [],
    };

    this.registerSymbol(symbol);
    return symbol;
  }

  /**
   * addVariableReference 함수.
   * 이미 찾은 변수 심볼에 참조 범위를 중복 없이 연결함.
   *
   * @param symbol - 참조를 연결할 변수 심볼
   * @param range - 참조가 등장한 문서 범위
   */
  addVariableReference(symbol: VariableSymbol, range: Range): void {
    this.addRangeOnce(this.toMutableVariableSymbol(symbol).references, range);
  }

  /**
   * tryAddVariableReferenceByName 함수.
   * 이름 기반 lookup으로 변수 참조를 연결하고 성공 여부를 반환함.
   *
   * @param name - lookup할 변수 이름
   * @param range - 참조가 등장한 문서 범위
   * @param kind - lookup을 좁힐 변수 종류
   * @returns 참조 연결 성공 여부
   */
  tryAddVariableReferenceByName(name: string, range: Range, kind?: VariableSymbolKind): boolean {
    const symbol = this.getVariable(name, kind);
    if (!symbol) {
      return false;
    }

    this.addVariableReference(symbol, range);
    return true;
  }

  /**
   * addFunctionReference 함수.
   * 이미 찾은 함수 심볼에 호출 참조 범위를 중복 없이 연결함.
   *
   * @param symbol - 참조를 연결할 함수 심볼
   * @param range - 함수 호출이 등장한 문서 범위
   */
  addFunctionReference(symbol: FunctionSymbol, range: Range): void {
    this.addRangeOnce(this.toMutableFunctionSymbol(symbol).references, range);
  }

  /**
   * tryAddFunctionReferenceByName 함수.
   * 이름 기반 lookup으로 함수 참조를 연결하고 성공 여부를 반환함.
   *
   * @param name - lookup할 함수 이름
   * @param range - 함수 호출이 등장한 문서 범위
   * @returns 참조 연결 성공 여부
   */
  tryAddFunctionReferenceByName(name: string, range: Range): boolean {
    const symbol = this.getFunction(name);
    if (!symbol) {
      return false;
    }

    this.addFunctionReference(symbol, range);
    return true;
  }

  /**
   * getVariable 함수.
   * 이름과 종류로 조회한 변수 심볼 중 가장 우선순위가 높은 첫 항목을 반환함.
   *
   * @param name - 조회할 변수 이름
   * @param kind - 변수 종류를 좁혀서 lookup할 때 사용할 값
   * @returns 첫 번째로 매칭된 변수 심볼
   */
  getVariable(name: string, kind?: VariableSymbolKind): VariableSymbol | undefined {
    return this.getVariables(name, kind)[0];
  }

  /**
   * getVariables 함수.
   * 이름 기준으로 등록된 변수 심볼을 조회하고 필요하면 종류별로 필터링함.
   *
   * @param name - 조회할 변수 이름
   * @param kind - 단일 종류만 보고 싶을 때 사용할 심볼 종류
   * @returns 조건에 맞는 변수 심볼 목록
   */
  getVariables(name: string, kind?: VariableSymbolKind): readonly VariableSymbol[] {
    if (kind) {
      return [...(this.variablesByKey.get(this.createKey(name, kind)) ?? [])];
    }

    return this.variables.filter((variable) => variable.name === name);
  }

  /**
   * getAllVariables 함수.
   * 현재 테이블이 보유한 변수 심볼 스냅샷을 읽기 전용 배열로 돌려줌.
   *
   * @returns 등록된 전체 변수 심볼 목록
   */
  getAllVariables(): readonly VariableSymbol[] {
    return [...this.variables];
  }

  /**
   * getFunction 함수.
   * 이름으로 조회한 로컬 함수 심볼 중 첫 항목을 반환함.
   *
   * @param name - 조회할 함수 이름
   * @returns 첫 번째로 매칭된 함수 심볼
   */
  getFunction(name: string): FunctionSymbol | undefined {
    return this.getFunctions(name)[0];
  }

  /**
   * getFunctions 함수.
   * 같은 이름으로 등록된 로컬 함수 심볼 목록을 복사해서 반환함.
   *
   * @param name - 조회할 함수 이름
   * @returns 조건에 맞는 함수 심볼 목록
   */
  getFunctions(name: string): readonly FunctionSymbol[] {
    return [...(this.functionsByName.get(name) ?? [])];
  }

  /**
   * getAllFunctions 함수.
   * 현재 fragment 분석에서 수집한 전체 함수 심볼을 반환함.
   *
   * @returns 등록된 전체 함수 심볼 목록
   */
  getAllFunctions(): readonly FunctionSymbol[] {
    return [...this.functions];
  }

  /**
   * getUnusedVariables 함수.
   * 정의는 있지만 참조가 없는 변수 심볼만 골라 unused 진단 입력으로 넘김.
   *
   * @returns unused 후보 변수 심볼 목록
   */
  getUnusedVariables(): readonly VariableSymbol[] {
    return this.variables.filter(
      (variable) => variable.definitionRanges.length > 0 && variable.references.length === 0,
    );
  }

  /**
   * registerSymbol 함수.
   * 새 변수 심볼을 전체 목록과 종류별 인덱스에 함께 등록함.
   *
   * @param symbol - 인덱싱할 변수 심볼
   * @returns 반환값 없음
   */
  private registerSymbol(symbol: MutableVariableSymbol): void {
    this.variables.push(symbol);

    const key = this.createKey(symbol.name, symbol.kind);
    const existing = this.variablesByKey.get(key);
    if (existing) {
      existing.push(symbol);
      return;
    }

    this.variablesByKey.set(key, [symbol]);
  }

  /**
   * registerFunction 함수.
   * 새 함수 심볼을 전체 목록과 이름별 인덱스에 함께 등록함.
   *
   * @param symbol - 인덱싱할 함수 심볼
   * @returns 반환값 없음
   */
  private registerFunction(symbol: MutableFunctionSymbol): void {
    this.functions.push(symbol);

    const existing = this.functionsByName.get(symbol.name);
    if (existing) {
      existing.push(symbol);
      return;
    }

    this.functionsByName.set(symbol.name, [symbol]);
  }

  /**
   * findSymbol 함수.
   * 같은 이름/종류 조합 안에서 원하는 스코프에 속한 변수 심볼을 찾음.
   *
   * @param name - 조회할 변수 이름
   * @param kind - 변수 인덱스 key를 구성할 심볼 종류
   * @param scope - 동일 이름 충돌을 해소할 스코프 종류
   * @returns 조건과 일치한 변수 심볼
   */
  private findSymbol(
    name: string,
    kind: VariableSymbolKind,
    scope: VariableSymbolScope,
  ): MutableVariableSymbol | undefined {
    return this.variablesByKey
      .get(this.createKey(name, kind))
      ?.find((variable) => variable.scope === scope);
  }

  /**
   * findFunction 함수.
   * 같은 이름으로 등록된 함수 중 요청한 스코프에 속한 항목을 찾음.
   *
   * @param name - 조회할 함수 이름
   * @param scope - 함수 lookup을 제한할 스코프 종류
   * @returns 조건과 일치한 함수 심볼
   */
  private findFunction(name: string, scope: FunctionSymbolScope): MutableFunctionSymbol | undefined {
    return this.functionsByName.get(name)?.find((symbol) => symbol.scope === scope);
  }

  /**
   * addRangeOnce 함수.
   * 동일한 range가 아직 없을 때만 목록에 추가함.
   *
   * @param ranges - 범위를 누적할 대상 배열
   * @param range - 새로 추가할 문서 범위
   */
  private addRangeOnce(ranges: Range[], range: Range): void {
    if (!this.hasRange(ranges, range)) {
      ranges.push(range);
    }
  }

  /**
   * createKey 함수.
   * 변수 종류와 이름을 합쳐 Map 인덱스에서 재사용할 key를 만듦.
   *
   * @param name - key에 포함할 변수 이름
   * @param kind - key prefix로 사용할 변수 종류
   * @returns 종류와 이름을 결합한 문자열 key
   */
  private createKey(name: string, kind: VariableSymbolKind): string {
    return `${kind}::${name}`;
  }

  /**
   * hasRange 함수.
   * 이미 같은 위치가 기록돼 있는지 확인해 중복 range push를 막음.
   *
   * @param existingRanges - 기존에 저장된 정의 범위 목록
   * @param targetRange - 새로 추가하려는 범위
   * @returns 동일한 위치가 이미 존재하는지 여부
   */
  private hasRange(existingRanges: Range[], targetRange: Range): boolean {
    return existingRanges.some((range) => this.rangesEqual(range, targetRange));
  }

  /**
   * toMutableVariableSymbol 함수.
   * public readonly view를 내부 mutation 전용 심볼 형태로 되돌림.
   *
   * @param symbol - 내부 저장소에서 꺼낸 변수 심볼
   * @returns 내부 mutation에 사용할 변수 심볼
   */
  private toMutableVariableSymbol(symbol: VariableSymbol): MutableVariableSymbol {
    return symbol as MutableVariableSymbol;
  }

  /**
   * toMutableFunctionSymbol 함수.
   * public readonly view를 내부 mutation 전용 함수 심볼 형태로 되돌림.
   *
   * @param symbol - 내부 저장소에서 꺼낸 함수 심볼
   * @returns 내부 mutation에 사용할 함수 심볼
   */
  private toMutableFunctionSymbol(symbol: FunctionSymbol): MutableFunctionSymbol {
    return symbol as MutableFunctionSymbol;
  }

  /**
   * rangesEqual 함수.
   * 두 Range가 같은 시작/끝 좌표를 가리키는지 비교함.
   *
   * @param left - 기준이 되는 범위
   * @param right - 비교할 대상 범위
   * @returns 두 범위의 좌표가 모두 같으면 true
   */
  private rangesEqual(left: Range, right: Range): boolean {
    return (
      left.start.line === right.start.line &&
      left.start.character === right.start.character &&
      left.end.line === right.end.line &&
      left.end.character === right.end.character
    );
  }
}
