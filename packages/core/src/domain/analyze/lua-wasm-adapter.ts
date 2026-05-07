/**
 * Lua WASM 분석기 패키지를 로드하고 반환 JSON을 domain 타입으로 정규화하는 어댑터.
 * @file packages/core/src/domain/analyze/lua-wasm-adapter.ts
 */

import { createRequire } from 'node:module';
import type {
  LuaWasmAccessDirection,
  LuaWasmAnalyzeOptions,
  LuaWasmAnalyzeResult,
  LuaWasmApiName,
  LuaWasmDiagnostic,
  LuaWasmQuoteKind,
  LuaWasmStateAccess,
  LuaWasmStringLiteral,
} from './lua-wasm-types';

interface LuaAnalyzerWasmModule {
  analyze_lua(source: string, optionsJson: string): string;
}

let wasmModulePromise: Promise<LuaAnalyzerWasmModule> | undefined;
let wasmModule: LuaAnalyzerWasmModule | undefined;
const requireFromCurrentFile = createRequire(__filename);

/**
 * loadLuaAnalyzerWasm 함수.
 * 동적 import로 Lua WASM 분석기 모듈을 한 번만 로드함.
 *
 * @returns 정규화된 Lua WASM 분석기 모듈 promise
 */
export async function loadLuaAnalyzerWasm(): Promise<LuaAnalyzerWasmModule> {
  if (wasmModule) {
    return wasmModule;
  }
  wasmModulePromise ??= import('@risuai/lua-analyzer-wasm').then((module) => {
    wasmModule = normalizeLuaAnalyzerWasmModule(module);
    return wasmModule;
  });
  return wasmModulePromise;
}

/**
 * loadLuaAnalyzerWasmSync 함수.
 * CommonJS require bridge로 Lua WASM 분석기 모듈을 동기 로드함.
 *
 * @returns 정규화된 Lua WASM 분석기 모듈
 */
export function loadLuaAnalyzerWasmSync(): LuaAnalyzerWasmModule {
  if (wasmModule) {
    return wasmModule;
  }

  wasmModule = normalizeLuaAnalyzerWasmModule(requireFromCurrentFile('@risuai/lua-analyzer-wasm'));
  return wasmModule;
}

/**
 * analyzeLuaWithWasm 함수.
 * Lua source를 비동기 WASM 분석기에 전달하고 결과를 domain 타입으로 정규화함.
 *
 * @param source - 분석할 Lua source 텍스트
 * @param options - WASM 분석기에 전달할 선택 옵션
 * @returns 정규화된 Lua WASM 분석 결과 promise
 */
export async function analyzeLuaWithWasm(
  source: string,
  options: LuaWasmAnalyzeOptions = {},
): Promise<LuaWasmAnalyzeResult> {
  const wasm = await loadLuaAnalyzerWasm();
  const rawJson = wasm.analyze_lua(source, JSON.stringify(options));
  return normalizeLuaWasmResult(JSON.parse(rawJson));
}

/**
 * analyzeLuaWithWasmSync 함수.
 * Lua source를 동기 WASM 분석기에 전달하고 결과를 domain 타입으로 정규화함.
 *
 * @param source - 분석할 Lua source 텍스트
 * @param options - WASM 분석기에 전달할 선택 옵션
 * @returns 정규화된 Lua WASM 분석 결과
 */
export function analyzeLuaWithWasmSync(
  source: string,
  options: LuaWasmAnalyzeOptions = {},
): LuaWasmAnalyzeResult {
  const wasm = loadLuaAnalyzerWasmSync();
  const rawJson = wasm.analyze_lua(source, JSON.stringify(options));
  return normalizeLuaWasmResult(JSON.parse(rawJson));
}

/**
 * normalizeLuaAnalyzerWasmModule 함수.
 * 외부 패키지 export가 analyze_lua 함수를 가진 WASM 모듈인지 확인함.
 *
 * @param module - 외부 패키지에서 로드한 unknown export 값
 * @returns 정규화된 Lua WASM 분석기 모듈
 */
function normalizeLuaAnalyzerWasmModule(module: unknown): LuaAnalyzerWasmModule {
  if (!isRecord(module) || !isAnalyzeLuaFunction(module.analyze_lua)) {
    throw new Error('Lua WASM analyzer package does not export analyze_lua');
  }
  return {
    analyze_lua: module.analyze_lua,
  };
}

/**
 * isAnalyzeLuaFunction 함수.
 * 값이 WASM 분석기의 analyze_lua callable인지 판별함.
 *
 * @param value - 검사할 unknown 값
 * @returns analyze_lua 함수이면 true
 */
function isAnalyzeLuaFunction(value: unknown): value is LuaAnalyzerWasmModule['analyze_lua'] {
  return typeof value === 'function';
}

/**
 * normalizeLuaWasmResult 함수.
 * WASM 분석기의 raw JSON result를 검증된 LuaWasmAnalyzeResult로 변환함.
 *
 * @param value - JSON.parse 이후의 unknown 분석 결과
 * @returns 정규화된 Lua WASM 분석 결과
 */
export function normalizeLuaWasmResult(value: unknown): LuaWasmAnalyzeResult {
  if (!isRecord(value)) {
    throw new Error('Lua WASM analyzer returned a non-object result');
  }
  if (value.version !== 1 || value.parser !== 'rust-wasm-lua') {
    throw new Error('Lua WASM analyzer returned an unsupported result version');
  }

  const stringLiterals = readArray(
    value.stringLiterals,
    normalizeStringLiteral,
    'stringLiterals',
  );
  const stateAccesses = readArray(value.stateAccesses, normalizeStateAccess, 'stateAccesses');
  const diagnostics = readArray(value.diagnostics, normalizeDiagnostic, 'diagnostics');

  return {
    ok: readBoolean(value.ok, 'ok'),
    parser: 'rust-wasm-lua',
    version: 1,
    sourceLengthUtf16: readNumber(value.sourceLengthUtf16, 'sourceLengthUtf16'),
    sourceLengthBytes: readNumber(value.sourceLengthBytes, 'sourceLengthBytes'),
    totalLines: readNumber(value.totalLines, 'totalLines'),
    stringLiterals,
    stateAccesses,
    diagnostics,
    error: value.error === null ? null : readString(value.error, 'error'),
  };
}

/**
 * normalizeStringLiteral 함수.
 * WASM string literal 항목의 위치와 quote metadata를 검증함.
 *
 * @param value - 정규화할 unknown string literal 항목
 * @returns 정규화된 Lua WASM string literal 정보
 */
function normalizeStringLiteral(value: unknown): LuaWasmStringLiteral {
  if (!isRecord(value)) {
    throw new Error('Lua WASM analyzer returned malformed string literal');
  }
  const quoteKind = readString(value.quoteKind, 'stringLiterals.quoteKind');
  if (!isLuaWasmQuoteKind(quoteKind)) {
    throw new Error('Lua WASM analyzer returned unsupported string literal quote kind');
  }
  return {
    startUtf16: readNumber(value.startUtf16, 'stringLiterals.startUtf16'),
    endUtf16: readNumber(value.endUtf16, 'stringLiterals.endUtf16'),
    contentStartUtf16: readNumber(value.contentStartUtf16, 'stringLiterals.contentStartUtf16'),
    contentEndUtf16: readNumber(value.contentEndUtf16, 'stringLiterals.contentEndUtf16'),
    startByte: readNumber(value.startByte, 'stringLiterals.startByte'),
    endByte: readNumber(value.endByte, 'stringLiterals.endByte'),
    contentStartByte: readNumber(value.contentStartByte, 'stringLiterals.contentStartByte'),
    contentEndByte: readNumber(value.contentEndByte, 'stringLiterals.contentEndByte'),
    quoteKind,
    hasCbsMarker: readBoolean(value.hasCbsMarker, 'stringLiterals.hasCbsMarker'),
  };
}

/**
 * normalizeStateAccess 함수.
 * WASM state access 항목의 API 이름, 접근 방향, 위치 정보를 검증함.
 *
 * @param value - 정규화할 unknown state access 항목
 * @returns 정규화된 Lua WASM state access 정보
 */
function normalizeStateAccess(value: unknown): LuaWasmStateAccess {
  if (!isRecord(value)) {
    throw new Error('Lua WASM analyzer returned malformed state access');
  }
  const apiName = readString(value.apiName, 'stateAccesses.apiName');
  const direction = readString(value.direction, 'stateAccesses.direction');
  if (!isLuaWasmApiName(apiName)) {
    throw new Error('Lua WASM analyzer returned unsupported state API name');
  }
  if (!isLuaWasmAccessDirection(direction)) {
    throw new Error('Lua WASM analyzer returned unsupported state access direction');
  }
  return {
    apiName,
    key: readString(value.key, 'stateAccesses.key'),
    direction,
    argStartUtf16: readNumber(value.argStartUtf16, 'stateAccesses.argStartUtf16'),
    argEndUtf16: readNumber(value.argEndUtf16, 'stateAccesses.argEndUtf16'),
    argStartByte: readNumber(value.argStartByte, 'stateAccesses.argStartByte'),
    argEndByte: readNumber(value.argEndByte, 'stateAccesses.argEndByte'),
    line: readNumber(value.line, 'stateAccesses.line'),
    containingFunction: readString(
      value.containingFunction,
      'stateAccesses.containingFunction',
    ),
  };
}

/**
 * normalizeDiagnostic 함수.
 * WASM diagnostic 항목의 메시지와 UTF-16 범위를 검증함.
 *
 * @param value - 정규화할 unknown diagnostic 항목
 * @returns 정규화된 Lua WASM diagnostic 정보
 */
function normalizeDiagnostic(value: unknown): LuaWasmDiagnostic {
  if (!isRecord(value)) {
    throw new Error('Lua WASM analyzer returned malformed diagnostic');
  }
  return {
    message: readString(value.message, 'diagnostics.message'),
    startUtf16: readNumber(value.startUtf16, 'diagnostics.startUtf16'),
    endUtf16: readNumber(value.endUtf16, 'diagnostics.endUtf16'),
  };
}

/**
 * readArray 함수.
 * unknown 값이 배열인지 확인하고 각 항목을 지정한 normalizer로 변환함.
 *
 * @param value - 검사할 unknown 배열 값
 * @param normalizeItem - 배열 항목을 domain 타입으로 바꾸는 함수
 * @param fieldName - 오류 메시지에 표시할 result field 이름
 * @returns 정규화된 readonly 배열
 */
function readArray<T>(
  value: unknown,
  normalizeItem: (item: unknown) => T,
  fieldName: string,
): readonly T[] {
  if (!Array.isArray(value)) {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName} array`);
  }
  return value.map((item) => normalizeItem(item));
}

/**
 * readString 함수.
 * unknown 값이 문자열인지 확인하고 반환함.
 *
 * @param value - 검사할 unknown 값
 * @param fieldName - 오류 메시지에 표시할 result field 이름
 * @returns 검증된 문자열 값
 */
function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

/**
 * readNumber 함수.
 * unknown 값이 유한한 숫자인지 확인하고 반환함.
 *
 * @param value - 검사할 unknown 값
 * @param fieldName - 오류 메시지에 표시할 result field 이름
 * @returns 검증된 숫자 값
 */
function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

/**
 * readBoolean 함수.
 * unknown 값이 boolean인지 확인하고 반환함.
 *
 * @param value - 검사할 unknown 값
 * @param fieldName - 오류 메시지에 표시할 result field 이름
 * @returns 검증된 boolean 값
 */
function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

/**
 * isLuaWasmQuoteKind 함수.
 * 문자열이 WASM 분석기가 지원하는 Lua string quote kind인지 판별함.
 *
 * @param value - 검사할 quote kind 문자열
 * @returns 지원되는 LuaWasmQuoteKind이면 true
 */
function isLuaWasmQuoteKind(value: string): value is LuaWasmQuoteKind {
  return value === 'single' || value === 'double' || value === 'long_bracket';
}

/**
 * isLuaWasmApiName 함수.
 * 문자열이 WASM 분석기가 추적하는 RisuAI state API 이름인지 판별함.
 *
 * @param value - 검사할 API 이름 문자열
 * @returns 지원되는 LuaWasmApiName이면 true
 */
function isLuaWasmApiName(value: string): value is LuaWasmApiName {
  return (
    value === 'getState' ||
    value === 'setState' ||
    value === 'getChatVar' ||
    value === 'setChatVar'
  );
}

/**
 * isLuaWasmAccessDirection 함수.
 * 문자열이 WASM state access 방향 값인지 판별함.
 *
 * @param value - 검사할 접근 방향 문자열
 * @returns 지원되는 LuaWasmAccessDirection이면 true
 */
function isLuaWasmAccessDirection(value: string): value is LuaWasmAccessDirection {
  return value === 'read' || value === 'write';
}

/**
 * isRecord 함수.
 * unknown 값이 null이 아닌 object record인지 판별함.
 *
 * @param value - 검사할 unknown 값
 * @returns object record이면 true
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
