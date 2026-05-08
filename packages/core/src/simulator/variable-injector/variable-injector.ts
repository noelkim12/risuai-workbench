/**
 * CBS preview variable injector engine implementation.
 * @file packages/core/src/domain/cbs/simulator/variable-injector.ts
 */
import { extractCBSVariableOccurrences, type CBSVariableOccurrence } from '../../domain/cbs/cbs';
import { createDefaultCbsSimulationContext } from '../context';
import type { CbsSimulationContext, CbsSimulationEffect } from '../types';
import type {
  CbsPreviewVariableBinding,
  CbsPreviewVariableBindingStatus,
  CbsPreviewVariableCoverageNote,
  CbsPreviewVariableInjectionInput,
  CbsPreviewVariableInjectionResult,
  CbsPreviewVariableOperation,
  CbsPreviewVariableReference,
  CbsPreviewVariableScope,
  CbsPreviewVariableSource,
  CbsPreviewVariableWarning,
} from './variable-injector-types';

/**
 * normalizeOccurrences 함수.
 * Converts CBSVariableOccurrence array to CbsPreviewVariableReference array.
 * Preserves all metadata including full Position objects without lossy normalization.
 *
 * @param occurrences - Raw CBS variable occurrences from parser
 * @returns Normalized preview variable references with preserved metadata
 */
function normalizeOccurrences(
  occurrences: readonly CBSVariableOccurrence[],
): CbsPreviewVariableReference[] {
  return occurrences.map((occ) => ({
    variableName: occ.variableName,
    direction: occ.direction,
    operation: occ.operation as CbsPreviewVariableOperation,
    // Preserve full Range and Position objects from parser
    range: occ.range,
    keyStart: occ.keyStart,
    keyEnd: occ.keyEnd,
  }));
}

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
    input.occurrences ?? normalizeOccurrences(extractCBSVariableOccurrences(input.source ?? ''));

  // Build effective context by merging base context with overrides
  const effectiveContext = buildEffectiveContext(input);

  // Resolve bindings from occurrences
  const bindings: CbsPreviewVariableBinding[] = occurrences.map((occurrence) =>
    resolveBinding(occurrence, effectiveContext, input),
  );

  // Generate warnings from bindings
  const warnings = generateWarnings(bindings);

  // Generate coverage notes from bindings
  const coverageNotes = generateCoverageNotes(bindings);

  // Clone effects from input with deep cloning (Task 3: no-mutation guarantee)
  const effects: CbsSimulationEffect[] = (input.effects ?? []).map((effect) => ({ ...effect }));

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
function buildEffectiveContext(input: CbsPreviewVariableInjectionInput): CbsSimulationContext {
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
 * Task 2: implements precedence layers, falsy value handling, and scoped references.
 *
 * @param occurrence - CBS variable occurrence metadata
 * @param context - Effective simulation context
 * @param input - Original injection input for source tracking
 * @returns Resolved variable binding
 */
function resolveBinding(
  occurrence: CbsPreviewVariableReference,
  context: CbsSimulationContext,
  input: CbsPreviewVariableInjectionInput,
): CbsPreviewVariableBinding {
  const scope = mapOperationToScope(occurrence.operation);
  const direction = occurrence.direction;

  // Resolve based on direction and operation
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
    // Read resolution with precedence layers
    const resolved = resolveReadValue(
      occurrence.variableName,
      scope,
      occurrence.operation,
      context,
      input,
    );
    status = resolved.status;
    source = resolved.source;
    valuePreview = resolved.valuePreview;
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
 * resolveReadValue 함수.
 * Resolves a variable read through precedence layers based on scope.
 *
 * @param variableName - Variable name to resolve
 * @param scope - Variable scope
 * @param operation - CBS operation
 * @param context - Effective simulation context
 * @param input - Original injection input for source tracking
 * @returns Resolution result with status, source, and value preview
 */
function resolveReadValue(
  variableName: string,
  scope: CbsPreviewVariableScope,
  _operation: CbsPreviewVariableOperation,
  context: CbsSimulationContext,
  input: CbsPreviewVariableInjectionInput,
): {
  status: CbsPreviewVariableBindingStatus;
  source: CbsPreviewVariableSource;
  valuePreview: string | undefined;
} {
  // Scope-specific resolution
  switch (scope) {
    case 'global': {
      const layer = context.globalVariables ?? {};
      const result = readLayer(layer, variableName);
      if (result.found) {
        return {
          status: 'resolved',
          source: 'globalVariable',
          valuePreview: result.value,
        };
      }
      break;
    }
    case 'toggle': {
      const layer = context.toggleValues ?? {};
      const result = readLayer(layer, variableName);
      if (result.found) {
        return {
          status: 'resolved',
          source: 'toggleValue',
          valuePreview: result.value,
        };
      }
      break;
    }
    case 'temp': {
      const layer = context.tempVariables ?? {};
      const result = readLayer(layer, variableName);
      if (result.found) {
        return {
          status: 'resolved',
          source: 'tempVariable',
          valuePreview: result.value,
        };
      }
      break;
    }
    case 'chat': {
      // Chat scope precedence:
      // 1. previewOverrides.chatVariables (source: previewOverride)
      // 2. baseContext.chatVariables (source: chatVariable)
      // 3. effectiveContext.characterDefaultVariables (source: characterDefault)
      // 4. effectiveContext.templateDefaultVariables (source: templateDefault)

      // Check previewOverrides first (highest precedence)
      const previewChatVars = input.previewOverrides?.chatVariables ?? {};
      const previewResult = readLayer(previewChatVars, variableName);
      if (previewResult.found) {
        return {
          status: 'resolved',
          source: 'previewOverride',
          valuePreview: previewResult.value,
        };
      }

      // Check baseContext.chatVariables
      const baseChatVars = input.baseContext?.chatVariables ?? {};
      const baseResult = readLayer(baseChatVars, variableName);
      if (baseResult.found) {
        return {
          status: 'resolved',
          source: 'chatVariable',
          valuePreview: baseResult.value,
        };
      }

      // Check effectiveContext.characterDefaultVariables (includes baseContext + workspaceDefaults)
      const charLayer = context.characterDefaultVariables ?? {};
      const charResult = readLayer(charLayer, variableName);
      if (charResult.found) {
        return {
          status: 'resolved',
          source: 'characterDefault',
          valuePreview: charResult.value,
        };
      }

      // Check effectiveContext.templateDefaultVariables (includes baseContext + workspaceDefaults)
      const templateLayer = context.templateDefaultVariables ?? {};
      const templateResult = readLayer(templateLayer, variableName);
      if (templateResult.found) {
        return {
          status: 'resolved',
          source: 'templateDefault',
          valuePreview: templateResult.value,
        };
      }
      break;
    }
    case 'iterator':
      // Iterator reads are runtime unknown
      return {
        status: 'runtimeUnknown',
        source: 'runtimeUnknown',
        valuePreview: undefined,
      };
  }

  // Not found in any layer
  return {
    status: 'missing',
    source: 'missing',
    valuePreview: undefined,
  };
}

/**
 * readLayer 함수.
 * Reads a value from a layer using own-property check.
 * Preserves falsy values ('', 0, false, null) as valid values.
 *
 * @param layer - Variable layer object
 * @param key - Variable key to read
 * @returns Object with found flag and stringified value
 */
function readLayer(layer: Record<string, unknown>, key: string): { found: boolean; value: string } {
  // Use Object.prototype.hasOwnProperty.call to check for own property
  // This preserves falsy values as valid
  if (Object.prototype.hasOwnProperty.call(layer, key)) {
    const value = layer[key];
    // Stringify the value for preview
    const stringified = value === null ? 'null' : String(value);
    return { found: true, value: stringified };
  }
  return { found: false, value: '' };
}

/**
 * mapOperationToScope 함수.
 * CBS operation을 preview variable scope로 매핑함.
 * Task 2: supports getglobalvar, gettoggle, tempvar scoped operations.
 *
 * @param operation - CBS variable operation
 * @returns Corresponding preview variable scope
 */
function mapOperationToScope(operation: CbsPreviewVariableOperation): CbsPreviewVariableScope {
  switch (operation) {
    case 'getglobalvar':
      return 'global';
    case 'gettoggle':
      return 'toggle';
    case 'tempvar':
      return 'temp';
    case '#each':
      return 'iterator';
    case 'getvar':
    case 'setvar':
    case 'addvar':
    case 'setdefaultvar':
      return 'chat';
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
