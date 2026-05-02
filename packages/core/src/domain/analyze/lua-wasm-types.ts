export type LuaWasmQuoteKind = 'single' | 'double' | 'long_bracket';
export type LuaWasmAccessDirection = 'read' | 'write';
export type LuaWasmApiName = 'getState' | 'setState' | 'getChatVar' | 'setChatVar';

export interface LuaWasmAnalyzeOptions {
  readonly includeStringLiterals?: boolean;
  readonly includeStateAccesses?: boolean;
  readonly maxKeyLength?: number;
}

export interface LuaWasmStringLiteral {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly contentStartUtf16: number;
  readonly contentEndUtf16: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly contentStartByte: number;
  readonly contentEndByte: number;
  readonly quoteKind: LuaWasmQuoteKind;
  readonly hasCbsMarker: boolean;
}

export interface LuaWasmStateAccess {
  readonly apiName: LuaWasmApiName;
  readonly key: string;
  readonly direction: LuaWasmAccessDirection;
  readonly argStartUtf16: number;
  readonly argEndUtf16: number;
  readonly argStartByte: number;
  readonly argEndByte: number;
  readonly line: number;
  readonly containingFunction: string;
}

export interface LuaWasmDiagnostic {
  readonly message: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}

export interface LuaWasmAnalyzeResult {
  readonly ok: boolean;
  readonly parser: 'rust-wasm-lua';
  readonly version: 1;
  readonly sourceLengthUtf16: number;
  readonly sourceLengthBytes: number;
  readonly totalLines: number;
  readonly stringLiterals: readonly LuaWasmStringLiteral[];
  readonly stateAccesses: readonly LuaWasmStateAccess[];
  readonly diagnostics: readonly LuaWasmDiagnostic[];
  readonly error: string | null;
}
