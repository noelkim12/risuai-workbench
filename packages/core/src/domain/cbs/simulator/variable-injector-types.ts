/**
 * CBS preview variable injector engine type contracts.
 * @file packages/core/src/domain/cbs/simulator/variable-injector-types.ts
 */
import type { CBSVariableOccurrence } from '../cbs';
import type { CbsSimulationContext, CbsSimulationEffect } from './types';

/** Widened CBS operation type including pre-extracted scoped references. */
export type CbsPreviewVariableOperation =
  | CBSVariableOccurrence['operation']
  | 'getglobalvar'
  | 'gettoggle'
  | 'tempvar';

/** Pre-extracted variable reference for preview injection. */
export interface CbsPreviewVariableReference {
  /** Variable name. */
  readonly variableName: string;
  /** Access direction (read or write). */
  readonly direction: 'read' | 'write';
  /** CBS operation that produced this reference. */
  readonly operation: CbsPreviewVariableOperation;
  /** Source range from parser (preserves CBSVariableOccurrence shape). */
  readonly range?: CBSVariableOccurrence['range'];
  /** Key start position from parser (preserves CBSVariableOccurrence shape). */
  readonly keyStart?: CBSVariableOccurrence['keyStart'];
  /** Key end position from parser (preserves CBSVariableOccurrence shape). */
  readonly keyEnd?: CBSVariableOccurrence['keyEnd'];
}

/** Variable scope for CBS preview injection. */
export type CbsPreviewVariableScope =
  | 'chat'
  | 'global'
  | 'toggle'
  | 'temp'
  | 'iterator';

/** Variable source indicating where a binding value originated. */
export type CbsPreviewVariableSource =
  | 'previewOverride'
  | 'chatVariable'
  | 'characterDefault'
  | 'templateDefault'
  | 'globalVariable'
  | 'toggleValue'
  | 'tempVariable'
  | 'iterator'
  | 'missing'
  | 'runtimeUnknown';

/** Binding status indicating how a variable was resolved. */
export type CbsPreviewVariableBindingStatus =
  | 'resolved'
  | 'missing'
  | 'runtimeUnknown'
  | 'writeOnly';

/** Preview overrides provided by the caller for variable resolution. */
export interface CbsPreviewVariableOverrides {
  /** Chat-scoped variable overrides (highest precedence). */
  readonly chatVariables?: Readonly<Record<string, unknown>>;
  /** Global variable overrides. */
  readonly globalVariables?: Readonly<Record<string, unknown>>;
  /** Toggle value overrides. */
  readonly toggleValues?: Readonly<Record<string, boolean>>;
  /** Temp variable overrides. */
  readonly tempVariables?: Readonly<Record<string, unknown>>;
}

/** Workspace default values for fallback resolution. */
export interface CbsPreviewVariableDefaults {
  /** Character default variables (fallback after chat variables). */
  readonly characterDefaultVariables?: Readonly<Record<string, unknown>>;
  /** Template default variables (fallback after character defaults). */
  readonly templateDefaultVariables?: Readonly<Record<string, unknown>>;
}

/** Input to the CBS preview variable injection engine. */
export interface CbsPreviewVariableInjectionInput {
  /** CBS source text to extract variables from (alternative to pre-extracted occurrences). */
  readonly source?: string;
  /** Pre-extracted variable occurrences (if already parsed). */
  readonly occurrences?: readonly CbsPreviewVariableReference[];
  /** Base simulation context to merge over. */
  readonly baseContext?: Partial<CbsSimulationContext>;
  /** Preview overrides (highest precedence for reads). */
  readonly previewOverrides?: CbsPreviewVariableOverrides;
  /** Workspace defaults for fallback resolution. */
  readonly workspaceDefaults?: CbsPreviewVariableDefaults;
  /** Existing effects to include in the result (will be cloned). */
  readonly effects?: readonly CbsSimulationEffect[];
}

/** A variable binding produced by the injector engine. */
export interface CbsPreviewVariableBinding {
  /** Variable name. */
  readonly variableName: string;
  /** Variable scope (chat, global, toggle, temp, iterator). */
  readonly scope: CbsPreviewVariableScope;
  /** Access direction (read or write). */
  readonly direction: 'read' | 'write';
  /** CBS operation that produced this binding. */
  readonly operation: CbsPreviewVariableOperation;
  /** Resolution status. */
  readonly status: CbsPreviewVariableBindingStatus;
  /** Source indicating where the value originated. */
  readonly source: CbsPreviewVariableSource;
  /** Value preview (undefined if missing or write-only). */
  readonly valuePreview: string | undefined;
  /** Original occurrence metadata. */
  readonly occurrence: CbsPreviewVariableReference;
}

/** A warning produced during variable injection. */
export interface CbsPreviewVariableWarning {
  /** Warning code. */
  readonly code: 'CBSVAR_MISSING' | 'CBSVAR_RUNTIME_UNKNOWN' | 'CBSVAR_WRITE_ONLY';
  /** Variable name related to the warning. */
  readonly variableName: string;
  /** Human-readable warning message. */
  readonly message: string;
  /** Optional source range (preserves CBSVariableOccurrence shape). */
  readonly range?: CBSVariableOccurrence['range'];
}

/** A coverage note documenting how a variable was resolved. */
export interface CbsPreviewVariableCoverageNote {
  /** Variable key. */
  readonly key: string;
  /** Resolution status. */
  readonly status: CbsPreviewVariableBindingStatus;
  /** Coverage note message. */
  readonly note: string;
}

/** Result returned by the CBS preview variable injection engine. */
export interface CbsPreviewVariableInjectionResult {
  /** Effective simulation context with merged preview overrides. */
  readonly effectiveContext: CbsSimulationContext;
  /** Variable bindings in occurrence order. */
  readonly bindings: readonly CbsPreviewVariableBinding[];
  /** Warnings for missing, runtime-unknown, or write-only variables. */
  readonly warnings: readonly CbsPreviewVariableWarning[];
  /** Coverage notes for each binding. */
  readonly coverageNotes: readonly CbsPreviewVariableCoverageNote[];
  /** Dry-run effects (cloned from input.effects for now). */
  readonly effects: readonly CbsSimulationEffect[];
}
