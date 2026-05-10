import type {
  LuaRuntimeRiskPolicyFinding,
  LuaRuntimeRiskPolicyInput,
  SourceProfileRuntimeLoad,
} from '../shared/types';

const KNOWN_PRELUDE_LOAD_PATTERN = /source\s*\[\s*1\s*\]\s*\.\s*content\s*,\s*['"]@prelude['"]\s*,\s*['"]t['"]/;

export function classifyLuaRuntimeLoadRisk(load: Pick<SourceProfileRuntimeLoad, 'kind' | 'expression'>): SourceProfileRuntimeLoad['risk'] {
  if (load.kind === 'loadfile') return 'runtime-loadfile';
  if (load.kind === 'dofile') return 'runtime-dofile';
  if (KNOWN_PRELUDE_LOAD_PATTERN.test(load.expression)) return 'runtime-prelude-load';
  if (/^\s*['"]/.test(load.expression)) return 'runtime-load-string';
  return 'runtime-load-dynamic';
}

export function evaluateLuaRuntimeRiskPolicy(input: LuaRuntimeRiskPolicyInput): LuaRuntimeRiskPolicyFinding[] {
  const findings: LuaRuntimeRiskPolicyFinding[] = [];

  for (const load of input.runtimeLoads) {
    findings.push(runtimeLoadFinding(load));
  }

  for (const mutation of input.packagePathMutations) {
    findings.push({
      id: 'package-loader-mutation',
      severity: 'error',
      level: 'blocked',
      line: mutation.line,
      expression: mutation.expression,
      message: 'Mutating package.path/cpath/searchers/loaders is unsafe for risulua-split recovery.',
    });
  }

  return findings;
}

function runtimeLoadFinding(load: SourceProfileRuntimeLoad): LuaRuntimeRiskPolicyFinding {
  if (load.risk === 'runtime-prelude-load') {
    return {
      id: load.risk,
      severity: 'warning',
      level: 'warning',
      line: load.line,
      expression: load.expression,
      message: 'Known load(source[1].content, "@prelude", "t") runtime prelude pattern detected; keep as a warning.',
    };
  }

  if (load.risk === 'runtime-loadfile' || load.risk === 'runtime-dofile') {
    return {
      id: load.risk,
      severity: 'error',
      level: 'blocked',
      line: load.line,
      expression: load.expression,
      message: `${load.kind} reads runtime files and is unsafe for risulua-split recovery.`,
    };
  }

  return {
    id: load.risk,
    severity: load.risk === 'runtime-load-string' ? 'strong-warning' : 'warning',
    level: load.risk === 'runtime-load-string' ? 'high' : 'warning',
    line: load.line,
    expression: load.expression,
    message: load.risk === 'runtime-load-string'
      ? 'load(string) executes runtime Lua text and requires high-risk review.'
      : 'load(dynamicExpression) has very low recovery confidence and requires report emphasis.',
  };
}
