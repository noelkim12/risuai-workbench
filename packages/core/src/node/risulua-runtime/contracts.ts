export type RisuLuaJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly RisuLuaJsonValue[]
  | { readonly [key: string]: RisuLuaJsonValue };

export type RisuLuaHostProfile = 'minimal' | 'button-action' | 'chat-state';

export interface RisuLuaExecutionLimits {
  timeoutMs: number;
  instructionLimit: number;
  hostCallLimit: number;
  maxTraceEvents: number;
}

export const RISULUA_RUNTIME_LIMITS = Object.freeze({
  maxInlineBytes: 128 * 1024,
  maxModuleBytes: 2 * 1024 * 1024,
  maxBundleBytes: 8 * 1024 * 1024,
  defaultTimeoutMs: 2_000,
  defaultInstructionLimit: 1_000_000,
  defaultHostCallLimit: 1_000,
  defaultMaxTraceEvents: 2_000,
  maxInlineTraceEvents: 250,
  maxCompactResultBytes: 256 * 1024,
  maxValueDepth: 20,
  maxValueEntries: 1_000,
  maxScenarios: 20,
});

export const DEFAULT_RISULUA_EXECUTION_LIMITS: Readonly<RisuLuaExecutionLimits> = Object.freeze({
  timeoutMs: RISULUA_RUNTIME_LIMITS.defaultTimeoutMs,
  instructionLimit: RISULUA_RUNTIME_LIMITS.defaultInstructionLimit,
  hostCallLimit: RISULUA_RUNTIME_LIMITS.defaultHostCallLimit,
  maxTraceEvents: RISULUA_RUNTIME_LIMITS.defaultMaxTraceEvents,
});

export interface RisuLuaModuleMap {
  entryModuleId: string;
  modules: Readonly<Record<string, string>>;
}

export interface RisuLuaHostOverrides {
  globals?: Readonly<Record<string, RisuLuaJsonValue>>;
  chatVariables?: Readonly<Record<string, RisuLuaJsonValue>>;
  globalVariables?: Readonly<Record<string, RisuLuaJsonValue>>;
  state?: Readonly<Record<string, RisuLuaJsonValue>>;
  randomSeed?: number;
}

export type RisuLuaDiagnosticId =
  | 'RUNTIME_INVALID_REQUEST'
  | 'RUNTIME_MODULE_NOT_FOUND'
  | 'RUNTIME_COMPILE_ERROR'
  | 'RUNTIME_LUA_ERROR'
  | 'RUNTIME_TIMEOUT'
  | 'RUNTIME_ABORTED'
  | 'RUNTIME_INSTRUCTION_LIMIT'
  | 'RUNTIME_HOST_CALL_LIMIT'
  | 'RUNTIME_VALUE_LIMIT'
  | 'RUNTIME_ASSERTION_FAILED'
  | 'RUNTIME_INTERNAL_ERROR';

export interface RisuLuaDiagnostic {
  id: RisuLuaDiagnosticId;
  message: string;
  moduleId?: string;
  line?: number;
  details?: Readonly<Record<string, RisuLuaJsonValue>>;
}

export type RisuLuaEngineTarget =
  | { kind: 'module'; moduleId?: string }
  | {
      kind: 'export';
      moduleId?: string;
      exportName: string;
      args?: readonly RisuLuaJsonValue[];
    };

export interface RisuLuaTraceEvent {
  sequence: number;
  kind: 'module' | 'host-call';
  name: string;
  args?: readonly RisuLuaJsonValue[];
  result?: RisuLuaJsonValue;
}

export interface RisuLuaExecutionRequest {
  moduleMap: RisuLuaModuleMap;
  target: RisuLuaEngineTarget;
  hostProfile?: RisuLuaHostProfile;
  host?: RisuLuaHostOverrides;
  limits?: Partial<RisuLuaExecutionLimits>;
}

export type RisuLuaEngineRequest = RisuLuaExecutionRequest & {
  limits: RisuLuaExecutionLimits;
};

export interface RisuLuaStateDiff {
  chatVariables?: Readonly<Record<string, RisuLuaJsonValue | null>>;
  globalVariables?: Readonly<Record<string, RisuLuaJsonValue | null>>;
  state?: Readonly<Record<string, RisuLuaJsonValue | null>>;
}

export interface RisuLuaExecutionResult {
  status: 'ok' | 'error';
  value?: RisuLuaJsonValue;
  state?: Readonly<Record<string, RisuLuaJsonValue>>;
  stateDiff: RisuLuaStateDiff;
  trace: readonly RisuLuaTraceEvent[];
  diagnostics: readonly RisuLuaDiagnostic[];
  metrics: {
    instructions: number;
    hostCalls: number;
    traceEvents: number;
    traceTruncated: boolean;
  };
}

export type RisuLuaEngineResult = RisuLuaExecutionResult;

export interface RisuLuaSmokeScenario {
  id: string;
  target: RisuLuaEngineTarget;
  hostProfile: RisuLuaHostProfile;
  host?: RisuLuaHostOverrides;
  limits?: Partial<RisuLuaExecutionLimits>;
  expected?: {
    status?: 'ok' | 'error';
    value?: RisuLuaJsonValue;
    state?: Readonly<Record<string, RisuLuaJsonValue>>;
    diagnosticIds?: readonly RisuLuaDiagnosticId[];
  };
}

export interface RisuLuaParityScenario {
  id: string;
  canonical: RisuLuaModuleMap;
  dist: RisuLuaModuleMap;
  scenario: RisuLuaSmokeScenario;
}

export type RisuLuaSmokeRequest =
  | {
      kind: 'smoke';
      moduleMap: RisuLuaModuleMap;
      scenarios: readonly RisuLuaSmokeScenario[];
    }
  | {
      kind: 'parity';
      scenarios: readonly RisuLuaParityScenario[];
    };

export interface RisuLuaScenarioResult {
  id: string;
  status: 'passed' | 'failed';
  execution: RisuLuaExecutionResult;
  canonical?: RisuLuaExecutionResult;
  dist?: RisuLuaExecutionResult;
  diagnostics: readonly RisuLuaDiagnostic[];
}

export interface RisuLuaSmokeResult {
  status: 'ok' | 'error';
  scenarios: readonly RisuLuaScenarioResult[];
  diagnostics: readonly RisuLuaDiagnostic[];
}
