export type LuaWasmQuoteKind = 'single' | 'double' | 'long_bracket';
export type LuaWasmAccessDirection = 'read' | 'write';
export type LuaWasmApiName = 'getState' | 'setState' | 'getChatVar' | 'setChatVar';

export interface LuaWasmAnalyzeOptions {
  readonly includeStringLiterals?: boolean;
  readonly includeStateAccesses?: boolean;
  readonly includeRequireAliases?: boolean;
  readonly includeMemberBridgeAssignments?: boolean;
  readonly includeModuleMemberDefinitions?: boolean;
  readonly includeSourceComments?: boolean;
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

export type LuaWasmModuleMemberDefinitionKind = 'table-method-function' | 'table-field-function';

export interface LuaWasmRequireAlias {
  readonly aliasName: string;
  readonly moduleName: string;
  readonly aliasStartUtf16: number;
  readonly aliasEndUtf16: number;
  readonly moduleStartUtf16: number;
  readonly moduleEndUtf16: number;
  readonly statementStartUtf16: number;
  readonly statementEndUtf16: number;
  readonly line: number;
}

export interface LuaWasmMemberBridgeAssignment {
  readonly publicName: string;
  readonly aliasName: string;
  readonly memberName: string;
  readonly publicStartUtf16: number;
  readonly publicEndUtf16: number;
  readonly aliasStartUtf16: number;
  readonly aliasEndUtf16: number;
  readonly memberStartUtf16: number;
  readonly memberEndUtf16: number;
  readonly statementStartUtf16: number;
  readonly statementEndUtf16: number;
  readonly line: number;
}

export interface LuaWasmModuleMemberDefinition {
  readonly exportName: string;
  readonly containerName: string | null;
  readonly definitionKind: LuaWasmModuleMemberDefinitionKind;
  readonly nameStartUtf16: number;
  readonly nameEndUtf16: number;
  readonly definitionStartUtf16: number;
  readonly definitionEndUtf16: number;
  readonly line: number;
}

export interface LuaWasmSourceComment {
  readonly sourcePath: string;
  readonly sourceLine: number;
  readonly sourceCharacter: number;
  readonly commentStartUtf16: number;
  readonly commentEndUtf16: number;
  readonly appliesToStatementStartUtf16: number | null;
  readonly line: number;
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
  readonly requireAliases: readonly LuaWasmRequireAlias[];
  readonly memberBridgeAssignments: readonly LuaWasmMemberBridgeAssignment[];
  readonly moduleMemberDefinitions: readonly LuaWasmModuleMemberDefinition[];
  readonly sourceComments: readonly LuaWasmSourceComment[];
  readonly diagnostics: readonly LuaWasmDiagnostic[];
  readonly error: string | null;
}
