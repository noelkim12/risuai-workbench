import {
  RISULUA_RUNTIME_LIMITS,
  type RisuLuaDiagnostic,
  type RisuLuaExecutionResult,
  type RisuLuaJsonValue,
  type RisuLuaParityScenario,
  type RisuLuaScenarioResult,
  type RisuLuaSmokeRequest,
  type RisuLuaSmokeResult,
  type RisuLuaSmokeScenario,
} from './contracts';
import { executeRisuLua } from './worker-runner';

export async function runRisuLuaSmoke(request: RisuLuaSmokeRequest): Promise<RisuLuaSmokeResult> {
  if (request.scenarios.length > RISULUA_RUNTIME_LIMITS.maxScenarios) {
    return {
      status: 'error',
      scenarios: [],
      diagnostics: [{
        id: 'RUNTIME_INVALID_REQUEST',
        message: `RisuLua smoke supports at most ${RISULUA_RUNTIME_LIMITS.maxScenarios} scenarios`,
      }],
    };
  }
  const invalidId = validateScenarioIds(request.scenarios.map((item) => item.id));
  if (invalidId) return { status: 'error', scenarios: [], diagnostics: [invalidId] };

  const scenarios: RisuLuaScenarioResult[] = [];
  if (request.kind === 'smoke') {
    for (const item of request.scenarios) {
      scenarios.push(await runSmokeScenario(request.moduleMap, item));
    }
  } else {
    for (const item of request.scenarios) {
      scenarios.push(await runParityScenario(item));
    }
  }
  const diagnostics = scenarios.flatMap((item) => item.diagnostics);
  return {
    status: scenarios.every((item) => item.status === 'passed') ? 'ok' : 'error',
    scenarios,
    diagnostics,
  };
}

async function runSmokeScenario(
  moduleMap: Extract<RisuLuaSmokeRequest, { kind: 'smoke' }>['moduleMap'],
  scenario: RisuLuaSmokeScenario,
): Promise<RisuLuaScenarioResult> {
  const execution = await executeRisuLua({
    moduleMap,
    target: scenario.target,
    hostProfile: scenario.hostProfile,
    host: scenario.host,
    limits: scenario.limits,
  });
  const assertion = assertScenario(scenario, execution);
  return {
    id: scenario.id,
    status: assertion ? 'failed' : 'passed',
    execution,
    diagnostics: assertion ? [...execution.diagnostics, assertion] : [],
  };
}

async function runParityScenario(item: RisuLuaParityScenario): Promise<RisuLuaScenarioResult> {
  const [canonical, dist] = await Promise.all([
    executeRisuLua({
      moduleMap: item.canonical,
      target: item.scenario.target,
      hostProfile: item.scenario.hostProfile,
      host: item.scenario.host,
      limits: item.scenario.limits,
    }),
    executeRisuLua({
      moduleMap: item.dist,
      target: item.scenario.target,
      hostProfile: item.scenario.hostProfile,
      host: item.scenario.host,
      limits: item.scenario.limits,
    }),
  ]);
  const canonicalSignature = paritySignature(canonical);
  const distSignature = paritySignature(dist);
  const matches = jsonEqual(canonicalSignature, distSignature);
  const diagnostics: RisuLuaDiagnostic[] = matches ? [] : [{
    id: 'RUNTIME_ASSERTION_FAILED',
    message: `RisuLua parity scenario failed: ${item.id}`,
    details: {
      scenarioId: item.id,
      canonical: canonicalSignature,
      dist: distSignature,
    },
  }];
  return {
    id: item.id,
    status: matches ? 'passed' : 'failed',
    execution: dist,
    canonical,
    dist,
    diagnostics,
  };
}

function assertScenario(
  scenario: RisuLuaSmokeScenario,
  execution: RisuLuaExecutionResult,
): RisuLuaDiagnostic | undefined {
  const expected = scenario.expected;
  const expectedStatus = expected?.status ?? 'ok';
  const actualDiagnosticIds = execution.diagnostics.map((item) => item.id).sort();
  const expectedDiagnosticIds = expected?.diagnosticIds ? [...expected.diagnosticIds].sort() : undefined;
  const mismatches: Record<string, RisuLuaJsonValue> = {};

  if (execution.status !== expectedStatus) {
    mismatches.status = { expected: expectedStatus, actual: execution.status };
  }
  if (expected && Object.prototype.hasOwnProperty.call(expected, 'value')
    && !jsonEqual(execution.value ?? null, expected.value ?? null)) {
    mismatches.value = { expected: expected.value ?? null, actual: execution.value ?? null };
  }
  if (expected?.state && !jsonEqual(execution.state ?? {}, expected.state)) {
    mismatches.state = { expected: expected.state, actual: execution.state ?? {} };
  }
  if (expectedDiagnosticIds && !jsonEqual(actualDiagnosticIds, expectedDiagnosticIds)) {
    mismatches.diagnosticIds = { expected: expectedDiagnosticIds, actual: actualDiagnosticIds };
  }
  if (Object.keys(mismatches).length === 0) return undefined;
  return {
    id: 'RUNTIME_ASSERTION_FAILED',
    message: `RisuLua smoke scenario failed: ${scenario.id}`,
    details: { scenarioId: scenario.id, mismatches },
  };
}

function paritySignature(result: RisuLuaExecutionResult): RisuLuaJsonValue {
  const hostCallCounts: Record<string, number> = {};
  for (const event of result.trace) {
    if (event.kind === 'host-call') hostCallCounts[event.name] = (hostCallCounts[event.name] ?? 0) + 1;
  }
  return {
    status: result.status,
    value: result.value ?? null,
    stateDiff: result.stateDiff as Record<string, RisuLuaJsonValue>,
    hostCalls: hostCallCounts,
    diagnosticIds: result.diagnostics.map((item) => item.id).sort(),
  };
}

function validateScenarioIds(ids: readonly string[]): RisuLuaDiagnostic | undefined {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.trim().length === 0) {
      return { id: 'RUNTIME_INVALID_REQUEST', message: 'RisuLua scenario id must not be empty' };
    }
    if (seen.has(id)) {
      return { id: 'RUNTIME_INVALID_REQUEST', message: `Duplicate RisuLua scenario id: ${id}` };
    }
    seen.add(id);
  }
  return undefined;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJson(item)]),
  );
}
