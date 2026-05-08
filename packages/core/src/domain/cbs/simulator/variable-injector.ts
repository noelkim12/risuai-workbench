/**
 * CBS preview variable injector engine implementation.
 * @file packages/core/src/domain/cbs/simulator/variable-injector.ts
 */
import { extractCBSVariableOccurrences, type CBSVariableOccurrence } from '../cbs';
import { createDefaultCbsSimulationContext } from './context';
import type { CbsSimulationContext, CbsSimulationEffect } from './types';
import type {
  CbsPreviewVariableBinding,
  CbsPreviewVariableBindingStatus,
  CbsPreviewVariableCoverageNote,
  CbsPreviewVariableInjectionInput,
  CbsPreviewVariableInjectionResult,
  CbsPreviewVariableScope,
  CbsPreviewVariableSource,
  CbsPreviewVariableWarning,
} from './variable-injector-types';

/**
 * createCbsPreviewVariableInjection 함수.
 * CBS source 또는 pre-extracted variable occurrences를 받아
 * preview overrides와 default/context snapshots를 병합하고
 * immutable simulator context overlay, bindings, warnings, coverage notes,
 * dry-run effects를 반환함.
 *
 * @param input - Injection input with source/occurrences and context overrides
 * @returns Injection result with effective context, bindings, warnings, coverage notes, and effects
 */
export function createCbsPreviewVariableInjection(
  input: CbsPreviewVariableInjectionInput,
): CbsPreviewVariableInjectionResult {
  // Extract occurrences from source if not provided
  const occurrences =
    input.occurrences ?? extractCBSVariableOccurrences(input.source ?? '');

  // Build effective context by merging base context with overrides
  const effectiveContext = buildEffectiveContext(input);

  // Resolve bindings from occurrences
  const bindings: CbsPreviewVariableBinding[] = occurrences.map((occurrence) =>
    resolveBinding(occurrence, effectiveContext),
  );

  // Generate warnings from bindings
  const warnings = generateWarnings(bindings);

  // Generate coverage notes from bindings
  const coverageNotes = generateCoverageNotes(bindings);

  // Clone effects from input (minimal Task 1 behavior)
  const effects: CbsSimulationEffect[] = [...(input.effects ?? [])];

  return {
    effectiveContext,
    bindings,
    warnings,
    coverageNotes,
    effects,
  };
}

/**
 * buildEffectiveContext 함수.
 * baseContext, previewOverrides, workspaceDefaults를 병합하여
 * effective simulation context를 생성함.
 *
 * @param input - Injection input containing context layers
 * @returns Merged effective simulation context
 */
function buildEffectiveContext(
  input: CbsPreviewVariableInjectionInput,
): CbsSimulationContext {
  const baseContext = input.baseContext ?? {};
  const previewOverrides = input.previewOverrides ?? {};
  const workspaceDefaults = input.workspaceDefaults ?? {};

  // Merge context layers with proper cloning
  return createDefaultCbsSimulationContext({
    executionMode: baseContext.executionMode ?? 'preview',
    chatVariables: {
      ...(baseContext.chatVariables ?? {}),
      ...(previewOverrides.chatVariables ?? {}),
    },
    characterDefaultVariables: {
      ...(baseContext.characterDefaultVariables ?? {}),
      ...(workspaceDefaults.characterDefaultVariables ?? {}),
    },
    templateDefaultVariables: {
      ...(baseContext.templateDefaultVariables ?? {}),
      ...(workspaceDefaults.templateDefaultVariables ?? {}),
    },
    globalVariables: {
      ...(baseContext.globalVariables ?? {}),
      ...(previewOverrides.globalVariables ?? {}),
    },
    toggleValues: {
      ...(baseContext.toggleValues ?? {}),
      ...(previewOverrides.toggleValues ?? {}),
    },
    tempVariables: {
      ...(baseContext.tempVariables ?? {}),
      ...(previewOverrides.tempVariables ?? {}),
    },
    userLabel: baseContext.userLabel,
    characterLabel: baseContext.characterLabel,
    role: baseContext.role,
    chatIndex: baseContext.chatIndex,
    isFirstMessage: baseContext.isFirstMessage,
    lorePositions: baseContext.lorePositions,
    chatHistory: baseContext.chatHistory,
    chatHistoryCursor: baseContext.chatHistoryCursor,
    providers: baseContext.providers,
  });
}

/**
 * resolveBinding 함수.
 * 단일 CBS variable occurrence를 해석하여 binding을 생성함.
 * Task 1 minimal behavior: chat reads are missing, chat writes are writeOnly.
 *
 * @param occurrence - CBS variable occurrence metadata
 * @param context - Effective simulation context
 * @returns Resolved variable binding
 */
function resolveBinding(
  occurrence: CBSVariableOccurrence,
  context: CbsSimulationContext,
): CbsPreviewVariableBinding {
  const scope = mapOperationToScope(occurrence.operation);
  const direction = occurrence.direction;

  // Task 1 minimal resolution
  let status: CbsPreviewVariableBindingStatus;
  let source: CbsPreviewVariableSource;
  let valuePreview: string | undefined;

  if (direction === 'write') {
    // Writes are writeOnly with runtimeUnknown source
    status = 'writeOnly';
    source = 'runtimeUnknown';
    valuePreview = undefined;
  } else if (occurrence.operation === '#each') {
    // Iterator references are runtimeUnknown
    status = 'runtimeUnknown';
    source = 'runtimeUnknown';
    valuePreview = undefined;
  } else {
    // Chat reads are missing for Task 1 (no precedence layers yet)
    status = 'missing';
    source = 'missing';
    valuePreview = undefined;
  }

  return {
    variableName: occurrence.variableName,
    scope,
    direction,
    operation: occurrence.operation,
    status,
    source,
    valuePreview,
    occurrence,
  };
}

/**
 * mapOperationToScope 함수.
 * CBS operation을 preview variable scope로 매핑함.
 *
 * @param operation - CBS variable operation
 * @returns Corresponding preview variable scope
 */
function mapOperationToScope(
  operation: CBSVariableOccurrence['operation'],
): CbsPreviewVariableScope {
  switch (operation) {
    case 'getvar':
    case 'setvar':
    case 'addvar':
    case 'setdefaultvar':
      return 'chat';
    case '#each':
      return 'iterator';
    default:
      return 'chat';
  }
}

/**
 * generateWarnings 함수.
 * bindings에서 warnings를 생성함.
 *
 * @param bindings - Variable bindings
 * @returns Array of warnings
 */
function generateWarnings(
  bindings: readonly CbsPreviewVariableBinding[],
): CbsPreviewVariableWarning[] {
  const warnings: CbsPreviewVariableWarning[] = [];

  for (const binding of bindings) {
    if (binding.status === 'missing') {
      warnings.push({
        code: 'CBSVAR_MISSING',
        variableName: binding.variableName,
        message: `Variable '${binding.variableName}' is missing (not defined in any layer)`,
        range: binding.occurrence.range,
      });
    } else if (binding.status === 'runtimeUnknown') {
      warnings.push({
        code: 'CBSVAR_RUNTIME_UNKNOWN',
        variableName: binding.variableName,
        message: `Variable '${binding.variableName}' has runtime-unknown value`,
        range: binding.occurrence.range,
      });
    } else if (binding.status === 'writeOnly') {
      warnings.push({
        code: 'CBSVAR_WRITE_ONLY',
        variableName: binding.variableName,
        message: `Variable '${binding.variableName}' is write-only (no read value available)`,
        range: binding.occurrence.range,
      });
    }
  }

  return warnings;
}

/**
 * generateCoverageNotes 함수.
 * bindings에서 coverage notes를 생성함.
 *
 * @param bindings - Variable bindings
 * @returns Array of coverage notes
 */
function generateCoverageNotes(
  bindings: readonly CbsPreviewVariableBinding[],
): CbsPreviewVariableCoverageNote[] {
  return bindings.map((binding) => ({
    key: binding.variableName,
    status: binding.status,
    note: `${binding.scope}:${binding.source}`,
  }));
}
