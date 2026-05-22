/**
 * Lorebook decorator type definitions for the curated metadata registry.
 * Platform-neutral types consumed by core, LSP, and webview without UI/LSP imports.
 * @file packages/core/src/domain/lorebook/decorators/types.ts
 */

/**
 * How well a lorebook `@@...` decorator is supported by the workbench.
 *
 * - `active`     — upstream effect is clear; workbench can explain and diagnose.
 * - `partial`    — upstream effect exists but needs external context or simulator parity.
 * - `uncertain`  — parse succeeds but the actual effect path is unclear.
 * - `unsupported`— upstream switch returns false or is explicitly TODO.
 */
export type LorebookDecoratorSupportLevel =
  | 'active'
  | 'partial'
  | 'uncertain'
  | 'unsupported';

/**
 * Functional grouping for lorebook decorators.
 */
export type LorebookDecoratorCategory =
  | 'insertion'
  | 'role'
  | 'activation'
  | 'search'
  | 'recursive'
  | 'budget'
  | 'injection'
  | 'ui';

/**
 * Full metadata for a single lorebook `@@...` decorator.
 * Fields follow the plan contract for cross-package serializable consumption.
 */
export interface LorebookDecoratorSpec {
  /** Normalized decorator name without `@@` prefix, e.g. `'depth'`. */
  readonly name: string;

  /** Human-readable label shown in completion/hover, e.g. `'@@depth N'`. */
  readonly label: string;

  /** Call signature including the `@@` prefix and argument shape, e.g. `'@@depth N'`. */
  readonly signature: string;

  /** Functional category for grouping and sorting. */
  readonly category: LorebookDecoratorCategory;

  /** Short one-line summary for completion detail / quick info. */
  readonly summary: string;

  /** Extended description for hover/documentation. */
  readonly description: string;

  /** Usage examples as an array of code strings. Empty when no examples are provided. */
  readonly examples: readonly string[];

  /** Workbench support classification. */
  readonly supportLevel: LorebookDecoratorSupportLevel;

  /**
   * Numeric sort priority for deterministic ordering.
   * Lower values appear first. Active decorators sort before unsupported.
   */
  readonly sortPriority: number;

  /** Optional alias names (without `@@` prefix) that also resolve to this decorator. */
  readonly aliases?: readonly string[];

  /**
   * Optional explicit insert text override for completion adapters.
   * When omitted, adapters derive insertText from the signature.
   */
  readonly insertText?: string;
}

/**
 * Completion candidate ready for LSP or Monaco adapter mapping.
 * All fields are serializable (no functions, no DOM/LSP types).
 */
export interface LorebookDecoratorCompletionCandidate {
  /** Display label including `@@` prefix, e.g. `'@@depth'`. */
  readonly label: string;

  /** Normalized name without `@@`, used for filtering. */
  readonly name: string;

  /** Short detail shown beside the label in the completion list. */
  readonly detail: string;

  /** Extended markdown documentation for hover/resolved docs. */
  readonly documentationMarkdown: string;

  /** Plain-text version of the documentation (no markdown). */
  readonly documentationPlain: string;

  /** Snippet-ready insert text, e.g. `'@@depth '` for argument decorators. */
  readonly insertText: string;

  /** Deterministic sort key derived from sortPriority. */
  readonly sortText: string;

  /** Support level for badge rendering. */
  readonly supportLevel: LorebookDecoratorSupportLevel;
}
