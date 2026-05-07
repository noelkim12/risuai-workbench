import { describe, expect, it } from 'vitest';

import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_CLASSIFICATION_CODES,
  RISULUA_MODULE_TABLE_CLASSIFIER_PRECEDENCE,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES,
  RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH,
  RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
  createEmptyRisuLuaModuleTableHostEffects,
  isAllowedRisuLuaModuleTableMvpTarget,
  isForbiddenRisuLuaModuleTableMvpTarget,
  validateRisuLuaModuleTableDomainCandidates,
  validateRisuLuaModuleTableRefactorMap,
  type RisuLuaModuleTableRefactorMapContract,
} from '../src/domain/risulua-split';
import type { LuaSourceRange } from '../src/domain/risulua-split';

describe('risulua-split module-table contracts', () => {
  it('defines approved MVP paths, classifier precedence, host effect classes, and reason codes', () => {
    expect(RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH).toBe('lua/common/local_helpers.risulua');
    expect(RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH).toBe('lua/host_globals/global_functions.risulua');
    expect(RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH).toBe('lua/host_globals/async_actions.risulua');
    expect(RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH).toBe('lua/state/variable_store.risulua');
    expect(RISULUA_MODULE_TABLE_REFACTOR_MAP_PATH).toBe('docs/refactor-map.json');
    expect(RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH).toBe('docs/domain-candidates.json');

    expect(RISULUA_MODULE_TABLE_CLASSIFIER_PRECEDENCE).toEqual([
      'parser-range-exclusion',
      'runtime-live-listener-roots',
      'host-visible-public-contracts',
      'unsafe-public-global-preservation',
      'safe-bridge-extraction',
      'private-locals',
      'nested-handler-helpers',
      'procedural-report-only',
      'semantic-domain-report-only',
    ]);

    expect(RISULUA_MODULE_TABLE_CLASSIFICATION_CODES).toEqual(expect.arrayContaining([
      'extract:pure-helper',
      'extract:host-read-helper',
      'extract:parameterized-read-helper',
      'bridge:host-visible-global',
      'report:domain-candidate',
      'preserve:captures-mutable-state',
      'preserve:captured-table-mutation',
      'preserve:host-write-order',
      'preserve:host-visible-global-unsafe-bridge',
      'preserve:dynamic-global-reference-risk',
      'preserve:top-level-side-effect',
      'preserve:commented-or-string-only',
      'preserve:async-boundary-risk',
      'preserve:ambiguous',
    ]));

    expect(RISULUA_MODULE_TABLE_HOST_EFFECT_CLASSES).toEqual([
      'reads',
      'writes',
      'uiInteraction',
      'asyncModelNetwork',
      'dynamicEnvironment',
    ]);
  });

  it('validates a refactor map with common, handler, host bridge, preserved, and domain candidate contracts', () => {
    const refactorMap = createValidRefactorMap();

    expect(validateRisuLuaModuleTableRefactorMap(refactorMap)).toEqual([]);
    expect(validateRisuLuaModuleTableDomainCandidates(refactorMap.domainCandidates)).toEqual([]);
    expect(refactorMap.symbols.find((symbol) => symbol.id === 'symbol:global:setLanguage')?.bridge).toEqual({
      required: true,
      kind: 'direct_assignment',
      originalPublicName: 'setLanguage',
      moduleAlias: '__host_globals',
      exportName: 'setLanguage',
      mainAssignment: {
        shape: 'direct_assignment',
        text: 'setLanguage = __host_globals.setLanguage',
      },
    });
  });

  it('rejects forbidden MVP feature helper targets with explicit invariant errors', () => {
    const refactorMap = createValidRefactorMap();
    const forbiddenPath = 'lua/features/output_helpers.risulua';
    const invalidMap: RisuLuaModuleTableRefactorMapContract = {
      ...refactorMap,
      modules: [
        ...refactorMap.modules,
        {
          path: forbiddenPath,
          requireId: 'features.output_helpers',
          alias: '__output_helpers',
          category: 'handler-helper',
          exports: ['normalizeOutput'],
        },
      ],
      symbols: refactorMap.symbols.map((symbol) => symbol.id === 'symbol:handler:normalizeOutput'
        ? { ...symbol, targetModule: forbiddenPath }
        : symbol),
    };

    const findings = validateRisuLuaModuleTableRefactorMap(invalidMap);

    expect(isForbiddenRisuLuaModuleTableMvpTarget(forbiddenPath)).toBe(true);
    expect(isAllowedRisuLuaModuleTableMvpTarget(forbiddenPath)).toBe(false);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'forbidden-mvp-target',
        path: forbiddenPath,
        message: `Module-table MVP must not generate forbidden target ${forbiddenPath}.`,
      }),
    ]));
  });

  it('rejects generated domain targets while keeping domain candidates report-only', () => {
    const refactorMap = createValidRefactorMap();
    const forbiddenPath = 'lua/domain/deck.risulua';
    const invalidMap: RisuLuaModuleTableRefactorMapContract = {
      ...refactorMap,
      modules: [
        ...refactorMap.modules,
        {
          path: forbiddenPath,
          requireId: 'domain.deck',
          alias: '__deck',
          category: 'common-helper',
          exports: ['scoreDeck'],
        },
      ],
      symbols: refactorMap.symbols.map((symbol) => symbol.id === 'symbol:common:trim'
        ? { ...symbol, targetModule: forbiddenPath }
        : symbol),
      domainCandidates: refactorMap.domainCandidates.map((candidate) => ({
        ...candidate,
        autoGenerated: true,
      })),
    };

    const findings = validateRisuLuaModuleTableRefactorMap(invalidMap);

    expect(refactorMap.domainCandidates[0]).toEqual(expect.objectContaining({
      recommendedPath: forbiddenPath,
      autoGenerated: false,
    }));
    expect(isForbiddenRisuLuaModuleTableMvpTarget(forbiddenPath)).toBe(true);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'forbidden-mvp-target',
        path: forbiddenPath,
        message: `Module-table MVP must not generate forbidden target ${forbiddenPath}.`,
      }),
      expect.objectContaining({
        code: 'invalid-domain-candidate',
        candidateName: 'deck',
        message: 'Domain candidate deck must have autoGenerated set to false for MVP output.',
      }),
    ]));
  });

  it('requires bridge metadata for every moved host-visible global', () => {
    const refactorMap = createValidRefactorMap();
    const invalidMap: RisuLuaModuleTableRefactorMapContract = {
      ...refactorMap,
      symbols: refactorMap.symbols.map((symbol) => symbol.id === 'symbol:global:setLanguage'
        ? removeBridgeMetadata(symbol)
        : symbol),
    };

    expect(validateRisuLuaModuleTableRefactorMap(invalidMap)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing-bridge-metadata',
        symbolId: 'symbol:global:setLanguage',
      }),
    ]));
  });
});

function createValidRefactorMap(): RisuLuaModuleTableRefactorMapContract {
  return {
    version: 1,
    mode: 'module-table',
    sourceFile: 'legacy/original.risulua',
    generatedAt: 'deterministic',
    modules: [
      {
        path: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        requireId: 'common.local_helpers',
        alias: '__local_helpers',
        category: 'common-helper',
        exports: ['trim'],
      },
      {
        path: 'lua/handler_helpers/output_helpers.risulua',
        requireId: 'handler_helpers.output_helpers',
        alias: '__output_helpers',
        category: 'handler-helper',
        exports: ['normalizeOutput'],
      },
      {
        path: RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
        requireId: 'host_globals.global_functions',
        alias: '__host_globals',
        category: 'host-global',
        exports: ['setLanguage'],
      },
      {
        path: RISULUA_MODULE_TABLE_VARIABLE_STORE_PATH,
        requireId: 'state.variable_store',
        alias: '__variable_store',
        category: 'state-store',
        exports: ['gameState'],
      },
    ],
    symbols: [
      {
        id: 'symbol:common:trim',
        originalName: 'trim',
        declarationKind: 'top-level-local-function',
        sourceRange: sourceRange(3, 5, 20, 78),
        classification: 'extract:pure-helper',
        targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
        exportName: 'trim',
        globalBridge: false,
        captures: [],
        mutates: [],
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        rewriteRefs: ['onOutput:12'],
      },
      {
        id: 'symbol:handler:normalizeOutput',
        originalName: 'normalizeOutput',
        declarationKind: 'nested-local-function',
        sourceRange: sourceRange(12, 14, 120, 198),
        parent: { kind: 'handler', name: 'onOutput', startLine: 10 },
        classification: 'extract:parameterized-read-helper',
        targetModule: 'lua/handler_helpers/output_helpers.risulua',
        exportName: 'normalizeOutput',
        globalBridge: false,
        captures: ['triggerId'],
        mutates: [],
        hostEffects: { ...createEmptyRisuLuaModuleTableHostEffects(), reads: ['getState'] },
        rewriteRefs: ['onOutput:18'],
      },
      {
        id: 'symbol:global:setLanguage',
        originalName: 'setLanguage',
        declarationKind: 'top-level-global-function',
        sourceRange: sourceRange(22, 28, 240, 410),
        classification: 'bridge:host-visible-global',
        targetModule: RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
        exportName: 'setLanguage',
        globalBridge: true,
        bridge: {
          required: true,
          kind: 'direct_assignment',
          originalPublicName: 'setLanguage',
          moduleAlias: '__host_globals',
          exportName: 'setLanguage',
          mainAssignment: {
            shape: 'direct_assignment',
            text: 'setLanguage = __host_globals.setLanguage',
          },
        },
        captures: [],
        mutates: [],
        hostEffects: { ...createEmptyRisuLuaModuleTableHostEffects(), writes: ['setState'] },
        rewriteRefs: [],
      },
      {
        id: 'symbol:domain:deck',
        originalName: 'DeckScore',
        declarationKind: 'domain-candidate',
        sourceRange: sourceRange(40, 44, 620, 730),
        classification: 'report:domain-candidate',
        globalBridge: false,
        captures: [],
        mutates: [],
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        rewriteRefs: [],
      },
    ],
    preserved: [
      {
        id: 'symbol:unsafe:rerollChoices',
        originalName: 'rerollChoices',
        sourceRange: sourceRange(52, 60, 820, 1010),
        reason: 'preserve:host-visible-global-unsafe-bridge',
        evidence: ['dynamic _G lookup nearby', 'async boundary cannot be proven safe'],
      },
    ],
    domainCandidates: [
      {
        name: 'deck',
        sourceSymbols: ['DeckScore'],
        sourceRanges: [sourceRange(40, 44, 620, 730)],
        confidence: 0.72,
        evidence: ['symbol name contains Deck', 'call graph cluster size 2'],
        recommendedPath: 'lua/domain/deck.risulua',
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        notGeneratedReason: 'Domain grouping is report-only in the module-table MVP.',
        autoGenerated: false,
      },
    ],
  };
}

function sourceRange(startLine: number, endLine: number, startOffset: number, endOffset: number): LuaSourceRange {
  return { startLine, endLine, startOffset, endOffset };
}

function removeBridgeMetadata(
  symbol: RisuLuaModuleTableRefactorMapContract['symbols'][number],
): RisuLuaModuleTableRefactorMapContract['symbols'][number] {
  const { bridge, ...symbolWithoutBridge } = symbol;
  void bridge;
  return symbolWithoutBridge;
}
