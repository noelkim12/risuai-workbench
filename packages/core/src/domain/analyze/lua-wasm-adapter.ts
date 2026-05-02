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

export function loadLuaAnalyzerWasmSync(): LuaAnalyzerWasmModule {
  if (wasmModule) {
    return wasmModule;
  }

  wasmModule = normalizeLuaAnalyzerWasmModule(requireFromCurrentFile('@risuai/lua-analyzer-wasm'));
  return wasmModule;
}

export async function analyzeLuaWithWasm(
  source: string,
  options: LuaWasmAnalyzeOptions = {},
): Promise<LuaWasmAnalyzeResult> {
  const wasm = await loadLuaAnalyzerWasm();
  const rawJson = wasm.analyze_lua(source, JSON.stringify(options));
  return normalizeLuaWasmResult(JSON.parse(rawJson));
}

export function analyzeLuaWithWasmSync(
  source: string,
  options: LuaWasmAnalyzeOptions = {},
): LuaWasmAnalyzeResult {
  const wasm = loadLuaAnalyzerWasmSync();
  const rawJson = wasm.analyze_lua(source, JSON.stringify(options));
  return normalizeLuaWasmResult(JSON.parse(rawJson));
}

function normalizeLuaAnalyzerWasmModule(module: unknown): LuaAnalyzerWasmModule {
  if (!isRecord(module) || !isAnalyzeLuaFunction(module.analyze_lua)) {
    throw new Error('Lua WASM analyzer package does not export analyze_lua');
  }
  return {
    analyze_lua: module.analyze_lua,
  };
}

function isAnalyzeLuaFunction(value: unknown): value is LuaAnalyzerWasmModule['analyze_lua'] {
  return typeof value === 'function';
}

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

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

function readNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Lua WASM analyzer returned malformed ${fieldName}`);
  }
  return value;
}

function isLuaWasmQuoteKind(value: string): value is LuaWasmQuoteKind {
  return value === 'single' || value === 'double' || value === 'long_bracket';
}

function isLuaWasmApiName(value: string): value is LuaWasmApiName {
  return (
    value === 'getState' ||
    value === 'setState' ||
    value === 'getChatVar' ||
    value === 'setChatVar'
  );
}

function isLuaWasmAccessDirection(value: string): value is LuaWasmAccessDirection {
  return value === 'read' || value === 'write';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
