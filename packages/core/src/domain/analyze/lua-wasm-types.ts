/**
 * Lua WASM 분석기가 반환하는 string literal, state access, generated bridge, diagnostic contract 타입 모음.
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
  /** generated `local alias = require("module.id")` 인덱스를 결과에 포함할지 여부. */
  readonly includeRequireAliases?: boolean;
  /** generated `publicName = alias.memberName` bridge assignment를 결과에 포함할지 여부. */
  readonly includeMemberBridgeAssignments?: boolean;
  /** generated module table export definition 인덱스를 결과에 포함할지 여부. */
  readonly includeModuleMemberDefinitions?: boolean;
  /** generated `---@source path:line:character` 주석 인덱스를 결과에 포함할지 여부. */
  readonly includeSourceComments?: boolean;
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

/** generated module table member definition의 문법 형태. */
export type LuaWasmModuleMemberDefinitionKind = 'table-method-function' | 'table-field-function';

/** generated RisuLua require alias 위치 정보. */
export interface LuaWasmRequireAlias {
  /** require 결과를 담는 local alias 이름. */
  readonly aliasName: string;
  /** require 문자열에 기록된 module id. */
  readonly moduleName: string;
  /** alias 이름 시작 위치의 UTF-16 offset. */
  readonly aliasStartUtf16: number;
  /** alias 이름 끝 위치의 UTF-16 offset. */
  readonly aliasEndUtf16: number;
  /** module id 시작 위치의 UTF-16 offset. */
  readonly moduleStartUtf16: number;
  /** module id 끝 위치의 UTF-16 offset. */
  readonly moduleEndUtf16: number;
  /** require statement 시작 위치의 UTF-16 offset. */
  readonly statementStartUtf16: number;
  /** require statement 끝 위치의 UTF-16 offset. */
  readonly statementEndUtf16: number;
  /** alias가 발견된 1-based line 번호. */
  readonly line: number;
}

/** generated public bridge assignment 위치 정보. */
export interface LuaWasmMemberBridgeAssignment {
  /** main scope에 노출되는 public bridge 이름. */
  readonly publicName: string;
  /** module require alias 이름. */
  readonly aliasName: string;
  /** alias에서 참조하는 module member 이름. */
  readonly memberName: string;
  /** public 이름 시작 위치의 UTF-16 offset. */
  readonly publicStartUtf16: number;
  /** public 이름 끝 위치의 UTF-16 offset. */
  readonly publicEndUtf16: number;
  /** alias 이름 시작 위치의 UTF-16 offset. */
  readonly aliasStartUtf16: number;
  /** alias 이름 끝 위치의 UTF-16 offset. */
  readonly aliasEndUtf16: number;
  /** member 이름 시작 위치의 UTF-16 offset. */
  readonly memberStartUtf16: number;
  /** member 이름 끝 위치의 UTF-16 offset. */
  readonly memberEndUtf16: number;
  /** assignment statement 시작 위치의 UTF-16 offset. */
  readonly statementStartUtf16: number;
  /** assignment statement 끝 위치의 UTF-16 offset. */
  readonly statementEndUtf16: number;
  /** bridge가 발견된 1-based line 번호. */
  readonly line: number;
}

/** generated module 파일 안에서 발견된 export member definition 위치 정보. */
export interface LuaWasmModuleMemberDefinition {
  /** module 밖에서 찾을 export member 이름. */
  readonly exportName: string;
  /** export를 담는 table 이름, 없으면 null. */
  readonly containerName: string | null;
  /** definition의 문법 형태. */
  readonly definitionKind: LuaWasmModuleMemberDefinitionKind;
  /** export 이름 시작 위치의 UTF-16 offset. */
  readonly nameStartUtf16: number;
  /** export 이름 끝 위치의 UTF-16 offset. */
  readonly nameEndUtf16: number;
  /** definition 시작 위치의 UTF-16 offset. */
  readonly definitionStartUtf16: number;
  /** definition 끝 위치의 UTF-16 offset. */
  readonly definitionEndUtf16: number;
  /** definition이 발견된 1-based line 번호. */
  readonly line: number;
}

/** generated `---@source` navigation comment 위치 정보. */
export interface LuaWasmSourceComment {
  /** 원본 artifact의 workspace-relative source path. */
  readonly sourcePath: string;
  /** 원본 artifact의 1-based line 번호. */
  readonly sourceLine: number;
  /** 원본 artifact의 0-based character 위치. */
  readonly sourceCharacter: number;
  /** source comment 시작 위치의 UTF-16 offset. */
  readonly commentStartUtf16: number;
  /** source comment 끝 위치의 UTF-16 offset. */
  readonly commentEndUtf16: number;
  /** comment가 가리키는 다음 statement 시작 위치, 없으면 null. */
  readonly appliesToStatementStartUtf16: number | null;
  /** source comment가 발견된 1-based line 번호. */
  readonly line: number;
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
  /** 추출된 generated require alias 목록. */
  readonly requireAliases: readonly LuaWasmRequireAlias[];
  /** 추출된 generated public bridge assignment 목록. */
  readonly memberBridgeAssignments: readonly LuaWasmMemberBridgeAssignment[];
  /** 추출된 generated module member definition 목록. */
  readonly moduleMemberDefinitions: readonly LuaWasmModuleMemberDefinition[];
  /** 추출된 generated source navigation comment 목록. */
  readonly sourceComments: readonly LuaWasmSourceComment[];
  /** 분석 중 생성된 diagnostic 목록. */
  readonly diagnostics: readonly LuaWasmDiagnostic[];
  /** fatal 분석 오류 메시지, 없으면 null. */
  readonly error: string | null;
}
