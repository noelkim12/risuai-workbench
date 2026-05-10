/**
 * Confidence classification for plain-single coarse split.
 *
 * Assigns each top-level atom a confidence level and a conservative target
 * path.  The classification is deliberately conservative: only atoms that
 * are provably pure (no host API calls, no locals, no side effects) receive
 * high confidence.  Everything else defaults to low or very-low.
 *
 * Source-slice text is used alongside inventory metadata to detect host
 * mutation patterns inside function bodies that the inventory does not walk.
 */

import type { LuaTopLevelAtom, SplitConfidence } from '../shared/types';

// ─── public types ───────────────────────────────────────────────────────────

export interface AtomClassification {
  confidence: SplitConfidence;
  targetPath: string;
  reason: string;
}

// ─── constants ──────────────────────────────────────────────────────────────

const HANDLER_TARGET_MAP: Record<string, string> = {
  onStart: 'runtime/start.risulua',
  onInput: 'runtime/input.risulua',
  onOutput: 'runtime/output.risulua',
  onButtonClick: 'runtime/button_click.risulua',
};

const HANDLER_NAMES = new Set(Object.keys(HANDLER_TARGET_MAP));

const HOST_MUTATION_PATTERNS = [
  'setChatVar', 'setState', 'setChat', 'addChat',
  'reloadDisplay', 'alertNormal', 'alertInput',
] as const;

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Classify a single top-level atom into a confidence level and target path.
 *
 * @param atom        The inventory atom to classify.
 * @param sourceSlice The exact source text for this atom (used for text-based
 *                    host-mutation detection since the inventory does not walk
 *                    function bodies).
 */
export function classifyAtomForCoarseSplit(
  atom: LuaTopLevelAtom,
  sourceSlice: string,
): AtomClassification {
  // 1. Handler assignments: onStart = ..., onInput = ..., etc.
  if (atom.kind === 'handler-assignment' && HANDLER_TARGET_MAP[atom.displayName]) {
    return {
      confidence: 'low',
      targetPath: HANDLER_TARGET_MAP[atom.displayName],
      reason: `${atom.displayName} runtime hook handler assignment.`,
    };
  }

  // 2. Function declarations for known handlers.
  if (atom.kind === 'function-declaration' && HANDLER_NAMES.has(atom.displayName)) {
    if (atom.displayName === 'onButtonClick' && isGiantDispatcher(sourceSlice)) {
      return {
        confidence: 'very-low',
        targetPath: HANDLER_TARGET_MAP.onButtonClick,
        reason: 'onButtonClick giant button dispatcher; internal split forbidden.',
      };
    }
    return {
      confidence: 'low',
      targetPath: HANDLER_TARGET_MAP[atom.displayName],
      reason: `${atom.displayName} runtime hook function declaration.`,
    };
  }

  // 3. Listener calls (listenEdit).
  if (atom.kind === 'listener-call') {
    return {
      confidence: 'low',
      targetPath: 'runtime/listeners.risulua',
      reason: `Runtime listener registration: ${atom.displayName}.`,
    };
  }

  // 4. Pure helpers — high confidence.
  if (isPureHelperCandidate(atom, sourceSlice)) {
    return {
      confidence: 'high',
      targetPath: 'common/helpers.risulua',
      reason: 'Pure helper with no host API dependencies.',
    };
  }

  // 5. Constants tables — high confidence.
  if (isConstantsTableCandidate(atom, sourceSlice)) {
    return {
      confidence: 'high',
      targetPath: 'schema/constants.risulua',
      reason: 'Enum-like constants table with no host API usage.',
    };
  }

  // 6. Dynamic state-key pattern — very-low.
  if (hasDynamicStateKeyPattern(sourceSlice)) {
    return {
      confidence: 'very-low',
      targetPath: 'features/core.risulua',
      reason: 'Dynamic state key pattern; movement unsafe.',
    };
  }

  // 7. Default — uncertain domain code.
  return {
    confidence: 'low',
    targetPath: 'features/core.risulua',
    reason: 'Uncertain domain code preserved in coarse block.',
  };
}

/**
 * Determine whether an atom can safely be extracted to its own file.
 *
 * An atom is scope-safe when it declares **no locals** that other atoms might
 * reference.  Since the inventory does not deeply track `usesLocals`, the only
 * provably safe atoms are those with `declaresLocals.length === 0` **and**
 * high confidence (no host APIs, no side effects).
 */
export function isAtomScopeSafe(
  atom: LuaTopLevelAtom,
  classification: AtomClassification,
): boolean {
  return classification.confidence === 'high' && atom.declaresLocals.length === 0;
}

/**
 * Convert a generated file path under `lua/` to a dot-only build-time module
 * id.  For example, `lua/common/helpers.risulua` → `common.helpers`.
 */
export function filePathToModuleId(filePath: string): string {
  return filePath
    .replace(/^lua\//, '')
    .replace(/\.risulua$/, '')
    .replace(/\//g, '.');
}

// ─── private helpers ────────────────────────────────────────────────────────

function isPureHelperCandidate(atom: LuaTopLevelAtom, sourceSlice: string): boolean {
  if (atom.kind !== 'function-declaration' && atom.kind !== 'local-function-declaration') return false;
  if (HANDLER_NAMES.has(atom.displayName)) return false;
  if (atom.hostApis.length > 0) return false;
  if (sourceSliceContainsHostMutation(sourceSlice)) return false;
  return true;
}

function isConstantsTableCandidate(atom: LuaTopLevelAtom, sourceSlice: string): boolean {
  if (atom.kind !== 'table-declaration' && atom.kind !== 'local-assignment' && atom.kind !== 'assignment') return false;
  if (atom.hostApis.length > 0) return false;
  if (sourceSliceContainsHostMutation(sourceSlice)) return false;
  // Must not contain function expressions (not a pure constants table).
  if (/function\s*\(/.test(sourceSlice)) return false;
  return true;
}

function hasDynamicStateKeyPattern(sourceSlice: string): boolean {
  // Dynamic state key: uses host mutation/read API with string concatenation.
  if (!sourceSliceContainsHostMutation(sourceSlice) && !/\bgetState\b/.test(sourceSlice)) return false;
  if (/\.\./.test(sourceSlice)) return true;
  return false;
}

function isGiantDispatcher(sourceSlice: string): boolean {
  // Giant dispatcher: uses dynamic table lookup (identifier[variable]).
  return /\w+\[\w+\]/.test(sourceSlice);
}

function sourceSliceContainsHostMutation(sourceSlice: string): boolean {
  return HOST_MUTATION_PATTERNS.some(
    (pattern) => new RegExp(`\\b${escapeRegExp(pattern)}\\b`).test(sourceSlice),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
