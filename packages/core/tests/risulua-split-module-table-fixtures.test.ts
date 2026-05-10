import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  createEmptyRisuLuaModuleTableHostEffects,
  isAllowedRisuLuaModuleTableMvpTarget,
  isForbiddenRisuLuaModuleTableMvpTarget,
  parseRisuLuaModuleTableSource,
  validateRisuLuaModuleTableRefactorMap,
  type LuaSourceRange,
  type RisuLuaModuleTableClassificationCode,
  type RisuLuaModuleTableHostEffects,
  type RisuLuaModuleTableParseResult,
  type RisuLuaModuleTableParseSuccess,
  type RisuLuaModuleTableRefactorMapContract,
} from '../src/domain/risulua-split';

const OUTPUT_HANDLER_HELPERS_PATH = 'lua/handler_helpers/output_helpers.risulua';
const INPUT_HANDLER_HELPERS_PATH = 'lua/handler_helpers/input_helpers.risulua';
const START_HANDLER_HELPERS_PATH = 'lua/handler_helpers/start_helpers.risulua';
const BUTTON_HANDLER_HELPERS_PATH = 'lua/handler_helpers/button_click_helpers.risulua';
const LISTEN_EDIT_HANDLER_HELPERS_PATH = 'lua/handler_helpers/listen_edit_helpers.risulua';
const MERRY_RPG_FIXTURE_ROOT = '../../../docs/bundle-mode/extract-test/output/module-merry-rpg-v1-3/';
const VIOLATED_GIRL_FIXTURE_ROOT = '../../../docs/bundle-mode/extract-test/output/module-violated-girl-260501/';

const APPROVED_MODULE_TABLE_TARGETS = [
  RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
  OUTPUT_HANDLER_HELPERS_PATH,
  INPUT_HANDLER_HELPERS_PATH,
  START_HANDLER_HELPERS_PATH,
  BUTTON_HANDLER_HELPERS_PATH,
  LISTEN_EDIT_HANDLER_HELPERS_PATH,
  RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
  RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
  RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH,
  RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
] as const;

interface ExpectedFixtureSymbol {
  id: string;
  originalName: string;
  classification: RisuLuaModuleTableClassificationCode;
  targetModule?: string;
  globalBridge: boolean;
  hostEffects: RisuLuaModuleTableHostEffects;
}

interface ModuleTableFixtureCase {
  id: string;
  source: string;
  expectedSymbols: ExpectedFixtureSymbol[];
  expectedPreserved: Array<{
    id: string;
    originalName: string;
    reason: RisuLuaModuleTableClassificationCode;
  }>;
}

const FIXTURE_MATRIX: ModuleTableFixtureCase[] = [
  {
    id: 'approved top-level helper and host global bridges',
    source: lines([
      'local function trimText(value)',
      '  return (value:gsub("^%s+", ""):gsub("%s+$", ""))',
      'end',
      '',
      'function formatPublicName(name)',
      '  return trimText(name):upper()',
      'end',
      '',
      'sendAsyncNotice = async(function(message)',
      '  alertNormal(message)',
      'end)',
      '',
      'function onOutput(text)',
      '  return formatPublicName(text)',
      'end',
    ]),
    expectedSymbols: [
      symbol('symbol:common:trimText', 'trimText', 'extract:pure-helper', RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH),
      symbol('symbol:host-global:formatPublicName', 'formatPublicName', 'bridge:host-visible-global', RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH, {
        globalBridge: true,
      }),
      symbol('symbol:host-async:sendAsyncNotice', 'sendAsyncNotice', 'bridge:host-visible-global', RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH, {
        globalBridge: true,
        hostEffects: { asyncModelNetwork: ['async'], uiInteraction: ['alertNormal'] },
      }),
    ],
    expectedPreserved: [
      preserved('preserve:root:onOutput', 'onOutput', 'preserve:top-level-side-effect'),
    ],
  },
  {
    id: 'runtime roots and nested extractable handler helpers',
    source: lines([
      'function onStart()',
      '  local function prepareTitle(value)',
      '    return string.lower(value)',
      '  end',
      '  setState("title", prepareTitle("READY"))',
      'end',
      '',
      'function onInput(text)',
      '  local function readMood(key)',
      '    return getChatVar(key)',
      '  end',
      '  return text .. readMood("mood")',
      'end',
      '',
      'function onOutput(text)',
      '  local function readByName(name)',
      '    return getState(name)',
      '  end',
      '  return text .. readByName("suffix")',
      'end',
      '',
      'function onButtonClick(buttonId)',
      '  local function buttonLabel(id)',
      '    return "button:" .. id',
      '  end',
      '  alertNormal(buttonLabel(buttonId))',
      'end',
      '',
      'listenEdit("profile.name", function(value)',
      '  local function normalizeProfileName(name)',
      '    return name:gsub("_", " ")',
      '  end',
      '  setState("profile.name", normalizeProfileName(value))',
      'end)',
    ]),
    expectedSymbols: [
      symbol('symbol:start:prepareTitle', 'prepareTitle', 'extract:pure-helper', START_HANDLER_HELPERS_PATH),
      symbol('symbol:input:readMood', 'readMood', 'extract:host-read-helper', INPUT_HANDLER_HELPERS_PATH, {
        hostEffects: { reads: ['getChatVar'] },
      }),
      symbol('symbol:output:readByName', 'readByName', 'extract:parameterized-read-helper', OUTPUT_HANDLER_HELPERS_PATH, {
        hostEffects: { reads: ['getState'] },
      }),
      symbol('symbol:button:buttonLabel', 'buttonLabel', 'extract:pure-helper', BUTTON_HANDLER_HELPERS_PATH),
      symbol('symbol:listen-edit:normalizeProfileName', 'normalizeProfileName', 'extract:pure-helper', LISTEN_EDIT_HANDLER_HELPERS_PATH),
    ],
    expectedPreserved: [
      preserved('preserve:root:onStart', 'onStart', 'preserve:top-level-side-effect'),
      preserved('preserve:root:onInput', 'onInput', 'preserve:top-level-side-effect'),
      preserved('preserve:root:onOutput', 'onOutput', 'preserve:top-level-side-effect'),
      preserved('preserve:root:onButtonClick', 'onButtonClick', 'preserve:top-level-side-effect'),
      preserved('preserve:root:listenEdit', 'listenEdit', 'preserve:top-level-side-effect'),
    ],
  },
  {
    id: 'unsafe captured state host writes async dynamic and ambiguous helpers',
    source: lines([
      'local count = 0',
      'local state = { total = 0 }',
      '',
      'function onOutput(text)',
      '  local function bumpScalar()',
      '    count = count + 1',
      '  end',
      '  local function bumpTable()',
      '    state.total = state.total + 1',
      '  end',
      '  local function writeHost()',
      '    setChatVar("last", text)',
      '  end',
      '  local function askModel()',
      '    return async(function() return RisuAI.chat.send(text) end)',
      '  end',
      '  local function controlledCapture(flag)',
      '    if flag then count = count + 1 end',
      '  end',
      '  local function ambiguous(value)',
      '    return state[value] or _G[value]',
      '  end',
      '  bumpScalar(); bumpTable(); writeHost(); askModel(); controlledCapture(text ~= ""); return ambiguous(text)',
      'end',
    ]),
    expectedSymbols: [],
    expectedPreserved: [
      preserved('preserve:output:bumpScalar', 'bumpScalar', 'preserve:captures-mutable-state'),
      preserved('preserve:output:bumpTable', 'bumpTable', 'preserve:captured-table-mutation'),
      preserved('preserve:output:writeHost', 'writeHost', 'preserve:host-write-order'),
      preserved('preserve:output:askModel', 'askModel', 'preserve:async-boundary-risk'),
      preserved('preserve:output:controlledCapture', 'controlledCapture', 'preserve:captures-mutable-state'),
      preserved('preserve:output:ambiguous', 'ambiguous', 'preserve:ambiguous'),
    ],
  },
  {
    id: 'host dynamic environment and collision preservation',
    source: lines([
      'local name = "dynamicName"',
      'local dynamicButton = "Fight" .. tostring(os.time())',
      'buttons = [[<button risu-btn="Name">Name</button>]]',
      'moreButtons = "<button risu-btn=\"" .. dynamicButton .. "\">Dynamic</button>"',
      '',
      'function duplicatedGlobal() return 1 end',
      'function duplicatedGlobal() return 2 end',
      'function collidingExport() return 3 end',
      'collidingExport = { value = 4 }',
      '',
      'function onButtonClick(buttonId)',
      '  local selected = _G[name]',
      '  rawset(_G, buttonId, rawget(_G, buttonId))',
      '  load("return " .. buttonId)',
      '  loadstring(buttonId)',
      '  setfenv(1, _G)',
      '  return selected',
      'end',
    ]),
    expectedSymbols: [
      symbol('symbol:duplicate:duplicatedGlobal__L1', 'duplicatedGlobal', 'bridge:host-visible-global', RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, {
        globalBridge: true,
      }),
      symbol('symbol:duplicate:duplicatedGlobal__L2', 'duplicatedGlobal', 'bridge:host-visible-global', RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, {
        globalBridge: true,
      }),
    ],
    expectedPreserved: [
      preserved('preserve:dynamic:buttonMarkup', 'risu-btn', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:buttonString', 'dynamicButton', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:_G', '_G', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:rawget', 'rawget', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:rawset', 'rawset', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:load', 'load', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:loadstring', 'loadstring', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:dynamic:setfenv', 'setfenv', 'preserve:dynamic-global-reference-risk'),
      preserved('preserve:collision:collidingExport', 'collidingExport', 'preserve:host-visible-global-unsafe-bridge'),
    ],
  },
  {
    id: 'report-only domain candidate without generated domain module',
    source: lines([
      'local function scoreDeck(cards)',
      '  return #cards * 10',
      'end',
      '',
      'function onStart()',
      '  setState("deck_score", tostring(scoreDeck({ 1, 2, 3 })))',
      'end',
    ]),
    expectedSymbols: [
      symbol('symbol:domain-candidate:scoreDeck', 'scoreDeck', 'report:domain-candidate', RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH),
    ],
    expectedPreserved: [
      preserved('preserve:root:onStart', 'onStart', 'preserve:top-level-side-effect'),
    ],
  },
];

describe('risulua-split module-table fixture matrix', () => {
  it('defines deterministic contract fixtures using only approved module-table targets', () => {
    for (const fixture of FIXTURE_MATRIX) {
      expect(fixture.source).not.toBe('');
      expect(fixture.expectedSymbols.length + fixture.expectedPreserved.length).toBeGreaterThan(0);

      for (const expectedSymbol of fixture.expectedSymbols) {
        if (expectedSymbol.targetModule === undefined) {
          continue;
        }
        expect(isAllowedRisuLuaModuleTableMvpTarget(expectedSymbol.targetModule)).toBe(true);
        expect(isForbiddenRisuLuaModuleTableMvpTarget(expectedSymbol.targetModule)).toBe(false);
      }
    }

    expect(APPROVED_MODULE_TABLE_TARGETS).toEqual(expect.arrayContaining([
      RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH,
      OUTPUT_HANDLER_HELPERS_PATH,
      INPUT_HANDLER_HELPERS_PATH,
      START_HANDLER_HELPERS_PATH,
      BUTTON_HANDLER_HELPERS_PATH,
      LISTEN_EDIT_HANDLER_HELPERS_PATH,
      RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH,
      RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH,
      RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
    ]));
  });

  it('validates a combined refactor-map fixture for future analyzer/classifier/writer tasks', () => {
    const refactorMap = createMatrixRefactorMap();

    expect(validateRisuLuaModuleTableRefactorMap(refactorMap)).toEqual([]);
    expect(refactorMap.modules.map((moduleContract) => moduleContract.path)).toEqual(APPROVED_MODULE_TABLE_TARGETS.slice(0, -1));
    expect(refactorMap.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ originalName: 'trimText', targetModule: RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'formatPublicName', targetModule: RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH }),
      expect.objectContaining({ originalName: 'sendAsyncNotice', targetModule: RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH }),
      expect.objectContaining({ originalName: 'prepareTitle', targetModule: START_HANDLER_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'readMood', targetModule: INPUT_HANDLER_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'readByName', targetModule: OUTPUT_HANDLER_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'buttonLabel', targetModule: BUTTON_HANDLER_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'normalizeProfileName', targetModule: LISTEN_EDIT_HANDLER_HELPERS_PATH }),
      expect.objectContaining({ originalName: 'scoreDeck', targetModule: RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH }),
      expect.objectContaining({ originalName: 'duplicatedGlobal', targetModule: RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH }),
    ]));
    expect(refactorMap.preserved.map((entry) => entry.originalName)).toEqual(expect.arrayContaining([
      'onOutput',
      'onInput',
      'onStart',
      'onButtonClick',
      'listenEdit',
      'bumpScalar',
      'bumpTable',
      'writeHost',
      'askModel',
      'controlledCapture',
      'ambiguous',
      'risu-btn',
      'dynamicButton',
      '_G',
      'rawget',
      'rawset',
      'load',
      'loadstring',
      'setfenv',
      'collidingExport',
    ]));
    expect(refactorMap.domainCandidates).toEqual([
      expect.objectContaining({
        name: 'scoreDeck',
        recommendedPath: RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
        autoGenerated: false,
      }),
    ]);
  });

  it('asserts forbidden feature helpers never appear and domain modules remain opt-in fixture targets', () => {
    const refactorMap = createMatrixRefactorMap();
    const targetModules = [
      ...refactorMap.modules.map((moduleContract) => moduleContract.path),
      ...refactorMap.symbols.map((symbolContract) => symbolContract.targetModule).filter((path): path is string => path !== undefined),
      ...refactorMap.domainCandidates.map((candidate) => candidate.recommendedPath),
    ];

    expect(targetModules.every((target) => !/^lua\/features\/[^/]+_helpers\.risulua$/.test(target))).toBe(true);
    expect(isForbiddenRisuLuaModuleTableMvpTarget('lua/features/output_helpers.risulua')).toBe(true);
    expect(isForbiddenRisuLuaModuleTableMvpTarget('lua/domain/score_deck.risulua')).toBe(false);
  });

  it('keeps comment and string false positives out of executable parser ranges', async () => {
    const source = lines([
      '--[[',
      'listenEdit("profile.name", function(value)',
      '  setState("bad", value)',
      'end)',
      ']]',
      'local quoted = "function onOutput(text) return text end"',
      '-- function commentedDeclaration() return 1 end',
      'function onStart()',
      '  setState("ready", "yes")',
      'end',
    ]);

    const result = await parseRisuLuaModuleTableSource(source);

    expectParseSuccess(result);
    expect(result.nonExecutableRanges.map((range) => range.text).join('\n')).toEqual(expect.stringContaining('listenEdit'));
    expect(result.nonExecutableRanges.map((range) => range.text).join('\n')).toEqual(expect.stringContaining('onOutput'));
    expect(result.nonExecutableRanges.map((range) => range.text).join('\n')).toEqual(expect.stringContaining('commentedDeclaration'));

    const executableText = result.executableRanges.map((range) => range.text).join('\n');
    expect(executableText).toContain('onStart');
    expect(executableText).not.toContain('listenEdit("profile.name"');
    expect(executableText).not.toContain('function onOutput(text)');
    expect(executableText).not.toContain('commentedDeclaration');
  });

  it('fails closed for malformed snippets and treats comment-only snippets as no-eligible fixtures', async () => {
    const malformed = await parseRisuLuaModuleTableSource('local M = {\nfunction broken(');
    const commentOnly = await parseRisuLuaModuleTableSource(lines([
      '-- function onOutput(text) return text end',
      '-- listenEdit("fake", function() end)',
    ]));

    expect(malformed.ok).toBe(false);
    expect(malformed.rewriteEligible).toBe(false);
    expect(malformed.executableRanges).toEqual([]);

    expectParseSuccess(commentOnly);
    expect(commentOnly.executableRanges).toEqual([]);
    expect(commentOnly.nonExecutableRanges.length).toBeGreaterThan(0);
  });

  it('keeps Merry RPG main as an ABI shell with listener shims after fixture generation', () => {
    const mainText = readFileSync(new URL(`${MERRY_RPG_FIXTURE_ROOT}lua/main.risulua`, import.meta.url), 'utf8');

    expect(rawSurfaceFunctionNames(mainText)).toEqual([]);
    expect(mainText).not.toContain('function callLLMWithRetry(');
    expect(mainText).not.toContain('Cheat_Skill_Points = async(function');
    expect(mainText).not.toContain('function resetCharacterSkillsAndPerks(');
    expect(mainText).not.toContain('function TogglePanel_Skill(');
    expect(mainText).not.toContain('function TogglePanel_Settings(');
    expect(mainText).not.toContain('function ForceRefresh(');
    expect(mainText).toContain('listenEdit("editDisplay", function(t, d)');
    expect(mainText).toContain('__runtime_listen_edit.editDisplay(t, d)');
  });

  it('keeps export manifests in regenerated module-table fixtures', () => {
    expect(existsSync(new URL(`${MERRY_RPG_FIXTURE_ROOT}docs/risulua-export-manifest.json`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`${VIOLATED_GIRL_FIXTURE_ROOT}docs/risulua-export-manifest.json`, import.meta.url))).toBe(true);
  });
});

function rawSurfaceFunctionNames(mainText: string): string[] {
  return [...mainText.matchAll(/^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm)]
    .map((match) => match[1])
    .filter((name) => !['onStart', 'onInput', 'onOutput', 'onButtonClick'].includes(name));
}

function expectParseSuccess(result: RisuLuaModuleTableParseResult): asserts result is RisuLuaModuleTableParseSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('Expected Lua parser success.');
  }
}

function createMatrixRefactorMap(): RisuLuaModuleTableRefactorMapContract {
  const symbols = FIXTURE_MATRIX.flatMap((fixture, fixtureIndex) => fixture.expectedSymbols.map((expectedSymbol, symbolIndex) => ({
    id: expectedSymbol.id,
    originalName: expectedSymbol.originalName,
    declarationKind: expectedSymbol.classification === 'report:domain-candidate' ? 'domain-candidate' as const : 'nested-local-function' as const,
    sourceRange: sourceRange(fixtureIndex + 1, symbolIndex + 1),
    classification: expectedSymbol.classification,
    targetModule: expectedSymbol.targetModule,
    exportName: expectedSymbol.originalName,
    globalBridge: expectedSymbol.globalBridge,
    bridge: expectedSymbol.globalBridge ? {
      required: true as const,
      kind: 'direct_assignment' as const,
      originalPublicName: expectedSymbol.originalName,
      moduleAlias: expectedSymbol.targetModule === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH ? '__async_actions' : expectedSymbol.targetModule === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH ? '__duplicate_globals' : '__global_functions',
      exportName: expectedSymbol.originalName,
      mainAssignment: {
        shape: 'direct_assignment' as const,
        text: `${expectedSymbol.originalName} = ${expectedSymbol.targetModule === RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH ? '__async_actions' : expectedSymbol.targetModule === RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH ? '__duplicate_globals' : '__global_functions'}.${expectedSymbol.originalName}`,
      },
    } : undefined,
    captures: [],
    mutates: [],
    hostEffects: expectedSymbol.hostEffects,
    rewriteRefs: [],
  })));

  return {
    version: 1,
    mode: 'module-table',
    sourceFile: 'legacy/original.risulua',
    generatedAt: 'deterministic-fixture-matrix',
    modules: [
      moduleContract(RISULUA_MODULE_TABLE_COMMON_HELPERS_PATH, 'common.local_helpers', '__local_helpers', 'common-helper', symbols),
      moduleContract(OUTPUT_HANDLER_HELPERS_PATH, 'handler_helpers.output_helpers', '__output_helpers', 'handler-helper', symbols),
      moduleContract(INPUT_HANDLER_HELPERS_PATH, 'handler_helpers.input_helpers', '__input_helpers', 'handler-helper', symbols),
      moduleContract(START_HANDLER_HELPERS_PATH, 'handler_helpers.start_helpers', '__start_helpers', 'handler-helper', symbols),
      moduleContract(BUTTON_HANDLER_HELPERS_PATH, 'handler_helpers.button_click_helpers', '__button_click_helpers', 'handler-helper', symbols),
      moduleContract(LISTEN_EDIT_HANDLER_HELPERS_PATH, 'handler_helpers.listen_edit_helpers', '__listen_edit_helpers', 'handler-helper', symbols),
      moduleContract(RISULUA_MODULE_TABLE_GLOBAL_FUNCTIONS_PATH, 'host_globals.global_functions', '__global_functions', 'host-global', symbols),
      moduleContract(RISULUA_MODULE_TABLE_ASYNC_ACTIONS_PATH, 'host_globals.async_actions', '__async_actions', 'host-global', symbols),
      moduleContract(RISULUA_MODULE_TABLE_DUPLICATE_GLOBALS_PATH, 'host_globals.duplicate_globals', '__duplicate_globals', 'host-global', symbols),
    ],
    symbols,
    preserved: FIXTURE_MATRIX.flatMap((fixture, fixtureIndex) => fixture.expectedPreserved.map((expectedPreserved, preservedIndex) => ({
      id: expectedPreserved.id,
      originalName: expectedPreserved.originalName,
      sourceRange: sourceRange(fixtureIndex + 10, preservedIndex + 1),
      reason: expectedPreserved.reason,
      evidence: [`fixture:${fixture.id}`],
    }))),
    domainCandidates: [
      {
        name: 'scoreDeck',
        sourceSymbols: ['scoreDeck'],
        sourceRanges: [sourceRange(50, 1)],
        confidence: 0.7,
        evidence: ['domain-shaped pure scoring helper; report-only in MVP'],
        recommendedPath: RISULUA_MODULE_TABLE_DOMAIN_CANDIDATES_PATH,
        generationStatus: 'report-only',
        generationBlockedReasons: ['Domain generation is report-only by default.'],
        hostEffects: createEmptyRisuLuaModuleTableHostEffects(),
        notGeneratedReason: 'Domain candidates are report-only in the module-table MVP.',
        autoGenerated: false,
      },
    ],
  };
}

function moduleContract(
  modulePath: string,
  requireId: string,
  alias: string,
  category: RisuLuaModuleTableRefactorMapContract['modules'][number]['category'],
  symbols: RisuLuaModuleTableRefactorMapContract['symbols'],
): RisuLuaModuleTableRefactorMapContract['modules'][number] {
  return {
    path: modulePath,
    requireId,
    alias,
    category,
    exports: symbols
      .filter((symbolContract) => symbolContract.targetModule === modulePath)
      .map((symbolContract) => symbolContract.exportName)
      .filter((exportName): exportName is string => exportName !== undefined),
  };
}

function symbol(
  id: string,
  originalName: string,
  classification: RisuLuaModuleTableClassificationCode,
  targetModule: string,
  options: {
    globalBridge?: boolean;
    hostEffects?: Partial<RisuLuaModuleTableHostEffects>;
  } = {},
): ExpectedFixtureSymbol {
  return {
    id,
    originalName,
    classification,
    targetModule,
    globalBridge: options.globalBridge ?? false,
    hostEffects: { ...createEmptyRisuLuaModuleTableHostEffects(), ...options.hostEffects },
  };
}

function preserved(
  id: string,
  originalName: string,
  reason: RisuLuaModuleTableClassificationCode,
): ModuleTableFixtureCase['expectedPreserved'][number] {
  return { id, originalName, reason };
}

function sourceRange(section: number, index: number): LuaSourceRange {
  const startOffset = section * 1000 + index * 100;
  return {
    startLine: section * 10 + index,
    endLine: section * 10 + index + 1,
    startOffset,
    endOffset: startOffset + 50,
  };
}

function lines(sourceLines: string[]): string {
  return `${sourceLines.join('\n')}\n`;
}
