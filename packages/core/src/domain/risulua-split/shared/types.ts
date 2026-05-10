export type RisuLuaSplitMode = 'none' | 'report' | 'coarse' | 'module-table';

export type RisuLuaSourceProfile =
  | 'plain-single'
  | 'section-bundle'
  | 'preload-bundle'
  | 'mixed-bundle'
  | 'unknown';

export type DistBuildStrategy =
  | 'concat-build-time-require'
  | 'section-order-concat'
  | 'preload-recovery-no-dist'
  | 'report-only';

export type ModuleKind =
  | 'chunk-fragment'
  | 'preload-module'
  | 'coarse-block'
  | 'entry-tail'
  | 'legacy-original';

export type SplitConfidence = 'high' | 'medium' | 'low' | 'very-low';

export type RisuLuaValidatorSeverity = 'error' | 'strong-warning' | 'warning' | 'info';

export interface LuaSourceRange {
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
}

export interface LuaPlannedFile {
  path: string;
  kind: ModuleKind;
  sourceRanges: LuaSourceRange[];
  preloadId?: string;
  sectionLabel?: string;
  confidence: SplitConfidence;
  reason: string;
  preserveOrderIndex: number;
}

export interface LuaPlanRisk {
  id: string;
  severity: RisuLuaValidatorSeverity;
  message: string;
  sourceRanges: LuaSourceRange[];
  riskFlags: string[];
}

export type RisuLuaSplitValidationCode =
  | 'dist-not-required'
  | 'dist-written'
  | 'dynamic-require'
  | 'executable-require-in-dist'
  | 'host-global-shadowed'
  | 'inbound-root-missing-from-dist'
  | 'legacy-original-in-source-graph'
  | 'local-budget'
  | 'missing-dist-output'
  | 'module-table-build-time-fragment-marker'
  | 'module-table-content-mismatch'
  | 'module-table-empty-module'
  | 'module-table-forbidden-output-path'
  | 'module-table-missing-refactor-map'
  | 'module-table-refactor-map-invalid'
  | 'module-table-refactor-map-mismatch'
  | 'module-table-refactor-map-missing-entry'
  | 'module-table-stale-chunk-fragment'
  | 'package-loader-mutation'
  | 'preload-duplicate-id'
  | 'preload-recovery-safe'
  | 'source-range-invalid'
  | 'stale-dist-output'
  | 'unsupported-dist-strategy';

export interface RisuLuaSplitValidationFinding {
  code: RisuLuaSplitValidationCode;
  severity: RisuLuaValidatorSeverity;
  message: string;
  filePath?: string;
  sourceRanges?: LuaSourceRange[];
}

export interface RisuLuaSplitValidationSummary {
  ok: boolean;
  packable: boolean;
  strategy: DistBuildStrategy;
  distPath: string | null;
  wroteDist: boolean;
  findings: RisuLuaSplitValidationFinding[];
}

export interface LuaDetectedRoot {
  name: string;
  kind: 'function' | 'listener' | 'handler-assignment' | 'preload-module' | 'bundle-section' | 'unknown';
  sourceRange: LuaSourceRange;
}

export interface LuaHostApiSummary {
  reads: string[];
  writes: string[];
  asyncCalls: string[];
  unknownGlobals: string[];
}

export interface SourceProfileSummary {
  profile: RisuLuaSourceProfile;
  confidence: SplitConfidence;
  reasons: string[];
  preloadModuleCount: number;
  sectionMarkerCount: number;
  staticRequireCount: number;
  dynamicRequireCount: number;
}

export interface RisuLuaPreloadRequireDiagnostic {
  line: number;
  expression: string;
}

export interface RisuLuaPreloadModulePlan {
  preloadId: string;
  path: string;
  sourceRange: LuaSourceRange;
  bodyRange: LuaSourceRange;
  requires: string[];
  unresolvedRequires: string[];
  dynamicRequires: RisuLuaPreloadRequireDiagnostic[];
}

export interface RisuLuaPreloadRecoveryMetadata {
  modules: RisuLuaPreloadModulePlan[];
  duplicateIds: Array<{
    preloadId: string;
    sourceRanges: LuaSourceRange[];
  }>;
  dynamicRequires: RisuLuaPreloadRequireDiagnostic[];
  unresolvedRequires: Array<{
    preloadId: string;
    requires: string[];
  }>;
}

export interface SourceProfilePreloadModule {
  id: string;
  startLine: number;
  endLine?: number;
  startOffset: number;
  endOffset?: number;
}

export interface SourceProfileSectionMarker {
  label: string;
  line: number;
  startOffset: number;
}

export interface SourceProfileStaticRequire {
  id: string;
  line: number;
  raw: string;
}

export interface SourceProfileDynamicRequire {
  line: number;
  expression: string;
}

export type LuaRuntimeLoadKind = 'load' | 'loadfile' | 'dofile';

export type LuaRuntimeRiskId =
  | 'runtime-loadfile'
  | 'runtime-dofile'
  | 'runtime-load-string'
  | 'runtime-prelude-load'
  | 'runtime-load-dynamic'
  | 'package-loader-mutation';

export type LuaRuntimeRiskLevel = 'blocked' | 'high' | 'warning' | 'info';

export interface SourceProfileRuntimeLoad {
  kind: LuaRuntimeLoadKind;
  line: number;
  expression: string;
  risk: LuaRuntimeRiskId;
}

export interface SourceProfilePackagePathMutation {
  line: number;
  expression: string;
}

export interface SourceProfileResult {
  profile: RisuLuaSourceProfile;
  confidence: SplitConfidence;
  preloadModules: SourceProfilePreloadModule[];
  sectionMarkers: SourceProfileSectionMarker[];
  staticRequires: SourceProfileStaticRequire[];
  dynamicRequires: SourceProfileDynamicRequire[];
  runtimeLoads: SourceProfileRuntimeLoad[];
  packagePathMutations: SourceProfilePackagePathMutation[];
  reasons: string[];
}

export interface LuaRuntimeRiskPolicyInput {
  runtimeLoads: SourceProfileRuntimeLoad[];
  packagePathMutations: SourceProfilePackagePathMutation[];
}

export interface LuaRuntimeRiskPolicyFinding {
  id: LuaRuntimeRiskId;
  severity: RisuLuaValidatorSeverity;
  level: LuaRuntimeRiskLevel;
  message: string;
  line: number;
  expression: string;
}

export type LuaTopLevelAtomKind =
  | 'function-declaration'
  | 'local-function-declaration'
  | 'assignment'
  | 'local-assignment'
  | 'table-declaration'
  | 'handler-assignment'
  | 'listener-call'
  | 'package-preload'
  | 'require-call'
  | 'bundle-section'
  | 'top-level-effect'
  | 'unknown';

export interface LuaTopLevelAtom {
  id: string;
  kind: LuaTopLevelAtomKind;
  displayName: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  preserveOrderIndex: number;
  declaresLocals: string[];
  usesLocals: string[];
  readsGlobals: string[];
  writesGlobals: string[];
  calls: string[];
  hostApis: string[];
  stateKeys: string[];
}

export interface RisuLuaSplitPlan {
  version: 1;
  mode: RisuLuaSplitMode;
  sourceProfile: RisuLuaSourceProfile;
  sourceProfileSummary: SourceProfileSummary;
  sourcePath: string;
  targetName: string;
  entryPath: 'lua/main.risulua';
  distPath: string | null;
  packable: boolean;
  buildStrategy: DistBuildStrategy;
  files: LuaPlannedFile[];
  risks: LuaPlanRisk[];
  detectedRoots: LuaDetectedRoot[];
  hostApiSummary: LuaHostApiSummary;
  preloadRecovery?: RisuLuaPreloadRecoveryMetadata;
  validation?: RisuLuaSplitValidationSummary;
}
