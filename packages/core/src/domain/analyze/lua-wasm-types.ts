/**
 * Lua WASM 분석기가 반환하는 string literal, state access, diagnostic contract 타입 모음.
 * @file packages/core/src/domain/analyze/lua-wasm-types.ts
 */

/** Lua string literal을 감싼 quote 문법 종류. */
export type LuaWasmQuoteKind = 'single' | 'double' | 'long_bracket';

/** RisuAI state API 접근이 값을 읽는지 쓰는지 나타내는 방향. */
export type LuaWasmAccessDirection = 'read' | 'write';

/** Lua WASM 분석기가 추적하는 RisuAI state 계열 API 이름. */
export type LuaWasmApiName = 'getState' | 'setState' | 'getChatVar' | 'setChatVar';

/** Lua WASM 분석 요청을 조정하는 옵션. */
export interface LuaWasmAnalyzeOptions {
  /** string literal 위치와 marker 여부를 결과에 포함할지 여부. */
  readonly includeStringLiterals?: boolean;
  /** state/chat variable 접근 정보를 결과에 포함할지 여부. */
  readonly includeStateAccesses?: boolean;
  /** state key로 인정할 최대 문자열 길이. */
  readonly maxKeyLength?: number;
}

/** Lua source 안에서 발견된 string literal 위치 정보. */
export interface LuaWasmStringLiteral {
  /** literal 시작 위치의 UTF-16 offset. */
  readonly startUtf16: number;
  /** literal 끝 위치의 UTF-16 offset. */
  readonly endUtf16: number;
  /** quote를 제외한 내용 시작 위치의 UTF-16 offset. */
  readonly contentStartUtf16: number;
  /** quote를 제외한 내용 끝 위치의 UTF-16 offset. */
  readonly contentEndUtf16: number;
  /** literal 시작 위치의 byte offset. */
  readonly startByte: number;
  /** literal 끝 위치의 byte offset. */
  readonly endByte: number;
  /** quote를 제외한 내용 시작 위치의 byte offset. */
  readonly contentStartByte: number;
  /** quote를 제외한 내용 끝 위치의 byte offset. */
  readonly contentEndByte: number;
  /** literal을 감싼 quote 문법 종류. */
  readonly quoteKind: LuaWasmQuoteKind;
  /** literal 내용에 CBS marker로 볼 수 있는 패턴이 있는지 여부. */
  readonly hasCbsMarker: boolean;
}

/** Lua source 안에서 발견된 RisuAI state/chat variable 접근 정보. */
export interface LuaWasmStateAccess {
  /** 접근에 사용된 RisuAI API 이름. */
  readonly apiName: LuaWasmApiName;
  /** 읽거나 쓴 state/chat variable key. */
  readonly key: string;
  /** 접근이 read인지 write인지 나타내는 방향. */
  readonly direction: LuaWasmAccessDirection;
  /** key argument 시작 위치의 UTF-16 offset. */
  readonly argStartUtf16: number;
  /** key argument 끝 위치의 UTF-16 offset. */
  readonly argEndUtf16: number;
  /** key argument 시작 위치의 byte offset. */
  readonly argStartByte: number;
  /** key argument 끝 위치의 byte offset. */
  readonly argEndByte: number;
  /** 접근이 발견된 1-based line 번호. */
  readonly line: number;
  /** 접근을 감싼 Lua 함수 이름, 없으면 빈 문자열. */
  readonly containingFunction: string;
}

/** Lua WASM 분석 중 발견된 parser 또는 extraction diagnostic. */
export interface LuaWasmDiagnostic {
  /** 사용자와 tooling에 표시할 diagnostic 메시지. */
  readonly message: string;
  /** diagnostic 시작 위치의 UTF-16 offset. */
  readonly startUtf16: number;
  /** diagnostic 끝 위치의 UTF-16 offset. */
  readonly endUtf16: number;
}

/** Lua WASM 분석기가 반환하는 정규화된 전체 결과. */
export interface LuaWasmAnalyzeResult {
  /** 분석이 fatal error 없이 끝났는지 여부. */
  readonly ok: boolean;
  /** 결과를 생성한 parser 식별자. */
  readonly parser: 'rust-wasm-lua';
  /** 결과 contract version. */
  readonly version: 1;
  /** 입력 source 전체 길이의 UTF-16 code unit 수. */
  readonly sourceLengthUtf16: number;
  /** 입력 source 전체 길이의 byte 수. */
  readonly sourceLengthBytes: number;
  /** 입력 source 전체 line 수. */
  readonly totalLines: number;
  /** 추출된 string literal 목록. */
  readonly stringLiterals: readonly LuaWasmStringLiteral[];
  /** 추출된 RisuAI state/chat variable 접근 목록. */
  readonly stateAccesses: readonly LuaWasmStateAccess[];
  /** 분석 중 생성된 diagnostic 목록. */
  readonly diagnostics: readonly LuaWasmDiagnostic[];
  /** fatal 분석 오류 메시지, 없으면 null. */
  readonly error: string | null;
}
