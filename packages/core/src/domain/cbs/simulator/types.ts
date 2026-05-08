/**
 * CBS simulator public contract types.
 * @file packages/core/src/domain/cbs/simulator/types.ts
 */
import type { CBSDocument, DiagnosticInfo } from '../parser/ast';
import type { Range } from '../parser/tokens';
import type { CbsSimulationChatHistoryEntry } from './chat-history';
import type { CbsSupportClass } from './support-classification';

/** CBS simulation completion status. */
export type CbsSimulationStatus = 'ok' | 'partial' | 'aborted' | 'error';

/** Budget policy used when a simulator limit is exceeded. */
export type CbsSimulationBudgetPolicy = 'stop' | 'continue';

/** Deterministic provider set used by CBS runtime-sensitive macros. */
export interface CbsSimulationProviders {
  /** Supplies the current date/time for time macros. */
  clock: () => Date;
  /** Supplies a deterministic random value in the `[0, 1)` range. */
  rng: () => number;
  /** Picks a deterministic pseudo-random number from stable hash input. */
  pickHashRand: (seed: string, upperBound: number) => number;
}

/** Caller-provided context shape; providers may override only the needed deterministic seams. */
export type CbsSimulationContextInput = Partial<Omit<CbsSimulationContext, 'providers'>> & {
  /** Partial provider overrides merged over default deterministic providers. */
  readonly providers?: Partial<CbsSimulationProviders>;
};

/** Caller-tunable simulation options, budget limits, and provider overrides. */
export interface CbsSimulationOptions {
  /** Maximum recursive traversal depth before budget handling runs. */
  maxDepth: number;
  /** Maximum visited AST steps before budget handling runs. */
  maxSteps: number;
  /** Maximum output length retained by the simulator. */
  maxOutputLength: number;
  /** Maximum trace events retained by the simulator. */
  maxTraceEvents: number;
  /** Budget-exceeded behavior. */
  onBudgetExceeded: CbsSimulationBudgetPolicy;
  /**
   * Provider overrides for runtime-sensitive macros.
   * These merge over `context.providers`; together options and context form the public provider contract.
   */
  providers?: Partial<CbsSimulationProviders>;
}

/** Variable stores and runtime labels consumed by the CBS simulator. */
export interface CbsSimulationContext {
  /** Setter macro behavior; preview preserves source text, execute emits local dry-run write effects. */
  executionMode?: 'preview' | 'execute';
  /** Chat-scoped variables; highest variable-read precedence. */
  chatVariables: Readonly<Record<string, unknown>>;
  /** Character default variables; fallback after chat variables. */
  characterDefaultVariables: Readonly<Record<string, unknown>>;
  /** Template default variables; fallback after character defaults. */
  templateDefaultVariables: Readonly<Record<string, unknown>>;
  /** Global variables available to global-variable macros. */
  globalVariables: Readonly<Record<string, unknown>>;
  /** Toggle values keyed by toggle/module name. */
  toggleValues: Readonly<Record<string, boolean>>;
  /** Temporary variables available only during a single simulation. */
  tempVariables: Readonly<Record<string, unknown>>;
  /** User display label used by identity macros. */
  userLabel: string;
  /** Character display label used by identity macros. */
  characterLabel: string;
  /** Explicit current message role for role-sensitive macros. */
  role?: string;
  /** Explicit current chat/message index for chatindex macros. */
  chatIndex?: string | number;
  /** Explicit first-message flag for isfirstmsg macros. */
  isFirstMessage?: boolean;
  /** Explicit lore position text keyed by position id. */
  readonly lorePositions?: Readonly<Record<string, string>>;
  /** Explicit chat history messages used by history-sensitive macros. */
  readonly chatHistory?: readonly CbsSimulationChatHistoryEntry[];
  /** Explicit current chat history index used by previous role-sensitive macros. */
  readonly chatHistoryCursor?: number;
  /** Deterministic providers for time/random/pick behavior; can be overridden per call through options. */
  providers: CbsSimulationProviders;
}

/** Trace event phase for CBS simulation lifecycle. */
export type CbsSimulationTracePhase = 'parse' | 'visit' | 'macro-enter' | 'macro-exit' | 'macro-skip' | 'diagnostic' | 'budget-exceeded';

/** A trace event emitted while parsing or visiting CBS AST nodes. */
export interface CbsSimulationTraceEvent {
  /** Event phase. */
  phase: CbsSimulationTracePhase;
  /** Human-readable event label. */
  message: string;
  /** Optional node type or macro name involved in the event. */
  node?: string;
  /** Optional source range involved in the event. */
  range?: Range;
  /** Optional structured details for evaluator-specific trace labels. */
  details?: Readonly<Record<string, unknown>>;
}

/** A side-effect intent recorded without mutating caller-provided context. */
export interface CbsSimulationEffect {
  /** Effect operation name. */
  operation: string;
  /** Effect kind, e.g. variableWrite. */
  kind?: string;
  /** Effect target store/scope if known. */
  targetStore?: string;
  /** Effect target key if known. */
  target?: string;
  /** Value preview captured during dry-run evaluation. */
  valuePreview?: string;
  /** Whether the simulator committed the side effect to external/caller state. */
  committed?: boolean;
  /** Why an otherwise writable effect stayed uncommitted. */
  commitBlockedReason?: string;
  /** Source range that produced the effect. */
  range?: Range;
  /** Original source text that produced the effect. */
  source?: string;
  /** Adapter-provided fragment identifier when this effect is aggregated from a fragment. */
  fragmentId?: string;
  /** Adapter-provided fragment order when this effect is aggregated from a fragment. */
  fragmentIndex?: number;
  /** Adapter-provided fragment section when this effect is aggregated from a fragment. */
  section?: string;
  /** Adapter-provided fragment start offset in the original document. */
  fragmentStart?: number;
  /** Adapter-provided fragment end offset in the original document. */
  fragmentEnd?: number;
}

/** Coverage counters for simulator support and macro traversal. */
export interface CbsSimulatorCoverage {
  /** Total macro-like nodes encountered. */
  totalMacros: number;
  /** Count by support class, when known. */
  bySupportClass: Partial<Record<CbsSupportClass, number>>;
  /** Unknown macro names encountered during traversal. */
  unknownMacros: string[];
  /** Count by macro name for supported/unsupported macros. */
  byMacroName: Record<string, number>;
}

/** Simulator diagnostic copied from parser or produced by simulator contracts. */
export interface CbsSimulationDiagnostic extends DiagnosticInfo {
  /** Diagnostic source. */
  source: 'parser' | 'simulator';
}

/** Structured result returned by `simulateCbsText`. */
export interface CbsSimulationResult {
  /** Final simulator status. */
  status: CbsSimulationStatus;
  /** Simulator output with unsupported/evaluator-deferred fragments preserved. */
  output: string;
  /** Parser document produced from the input. */
  document: CBSDocument;
  /** Parser and simulator diagnostics. */
  diagnostics: CbsSimulationDiagnostic[];
  /** Recorded dry-run effects. */
  effects: CbsSimulationEffect[];
  /** Parse/visit trace events. */
  trace: CbsSimulationTraceEvent[];
  /** Macro coverage summary. */
  coverage: CbsSimulatorCoverage;
}
