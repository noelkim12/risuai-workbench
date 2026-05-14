import { describe, expect, it } from 'vitest';

import {
  createDefaultCbsSimulationContext,
  simulateCbsText,
  type CbsSimulationContext,
} from '../../../src/domain/cbs';

/**
 * deepFreeze 함수.
 * simulator no-mutation fixture에서 caller context를 재귀적으로 freeze함.
 *
 * @param value - freeze할 값
 * @returns 입력과 같은 참조의 frozen 값
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;

  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return value;
}

/**
 * snapshotContext 함수.
 * provider function identity를 제외한 mutation-sensitive context 값을 직렬화함.
 *
 * @param context - snapshot할 CBS simulation context
 * @returns JSON string snapshot
 */
function snapshotContext(context: CbsSimulationContext): string {
  return JSON.stringify({
    chatVariables: context.chatVariables,
    characterDefaultVariables: context.characterDefaultVariables,
    templateDefaultVariables: context.templateDefaultVariables,
    globalVariables: context.globalVariables,
    toggleValues: context.toggleValues,
    tempVariables: context.tempVariables,
    userLabel: context.userLabel,
    characterLabel: context.characterLabel,
  });
}

describe('CBS simulator variable fixtures', () => {
  it('resolves getvar with chat before character and template defaults', () => {
    const result = simulateCbsText('{{getvar::mood}}', {
      chatVariables: { mood: 'calm' },
      characterDefaultVariables: { mood: 'angry' },
      templateDefaultVariables: { mood: 'sad' },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('calm');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'getvar',
        details: expect.objectContaining({ key: 'mood', source: 'chat' }),
      }),
    );
  });

  it('falls back through character default, template default, and missing blank output', () => {
    expect(
      simulateCbsText('{{getvar::mood}}', {
        characterDefaultVariables: { mood: 'angry' },
        templateDefaultVariables: { mood: 'sad' },
      }).output,
    ).toBe('angry');
    expect(
      simulateCbsText('{{getvar::mood}}', {
        templateDefaultVariables: { mood: 'sad' },
      }).output,
    ).toBe('sad');
    expect(simulateCbsText('{{getvar::mood}}').output).toBe('');
  });

  it('renders null own-property variable values as blank output', () => {
    const result = simulateCbsText('{{getvar::mood}}|{{getglobalvar::route}}|{{tempvar::scratch}}', {
      chatVariables: { mood: null },
      globalVariables: { route: null },
      tempVariables: { scratch: null },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('||');
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'getvar', details: expect.objectContaining({ key: 'mood', source: 'chat' }) }),
        expect.objectContaining({ node: 'getglobalvar', details: expect.objectContaining({ key: 'route', source: 'global' }) }),
        expect.objectContaining({ node: 'tempvar', details: expect.objectContaining({ key: 'scratch', source: 'temp' }) }),
      ]),
    );
  });

  it('resolves getglobalvar from context globals with source labels', () => {
    const result = simulateCbsText('{{getglobalvar::route}} {{getglobalvar::missing}}', {
      globalVariables: { route: 'alpha' },
    });

    expect(result.output).toBe('alpha ');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'getglobalvar',
        details: expect.objectContaining({ key: 'route', source: 'global' }),
      }),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'getglobalvar',
        details: expect.objectContaining({ key: 'missing', source: 'missing' }),
      }),
    );
  });

  it('normalizes macro call names across case, spaces, underscores, and hyphens', () => {
    const result = simulateCbsText(
      '{{GET GLOBAL VAR::route}}|{{get_global_var::route}}|{{get-global-var::route}}|{{getglobalvar::route}}',
      {
        globalVariables: { route: 'alpha' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('alpha|alpha|alpha|alpha');
    expect(result.diagnostics).toEqual([]);
    expect(result.trace.filter((event) => event.node === 'getglobalvar' && event.phase === 'macro-enter')).toHaveLength(4);
  });

  it('uses simulator-local temp state without mutating caller context', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        tempVariables: { scratch: 'seed' },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText(
      '{{tempvar::scratch}} {{settempvar::scratch::changed}}{{tempvar::scratch}}',
      context,
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('seed changed');
    expect(snapshotContext(context)).toBe(before);
  });
});

describe('CBS simulator effect-only fixtures', () => {
  it('preserves setter macro source in default preview mode without mutating caller context', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        chatVariables: { mood: 'angry' },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText(
      '{{setvar::mood::calm}} {{addvar::score::2}} {{setdefaultvar::tone::soft}}',
      context,
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('{{setvar::mood::calm}} {{addvar::score::2}} {{setdefaultvar::tone::soft}}');
    expect(result.effects).toEqual([]);
    expect(snapshotContext(context)).toBe(before);
  });

  it('records setvar as an uncommitted execute-mode effect without mutating caller context', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        executionMode: 'execute',
        chatVariables: { mood: 'angry' },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText('{{setvar::mood::calm}}', context);

    expect(result.status).toBe('ok');
    expect(result.output).toBe('');
    expect(result.effects).toEqual([
      expect.objectContaining({
        operation: 'setvar',
        kind: 'variableWrite',
        targetStore: 'chatVariable',
        target: 'mood',
        valuePreview: 'calm',
        committed: false,
        commitBlockedReason: 'dry-run policy blocked commit',
      }),
    ]);
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'setvar',
        details: expect.objectContaining({ committed: false, executionMode: 'execute' }),
      }),
    );
    expect(snapshotContext(context)).toBe(before);
  });

  it('records addvar numeric execution and setdefaultvar default-layer effects without committing', () => {
    const result = simulateCbsText('{{addvar::score::2}}{{setdefaultvar::mood::calm}}', {
      executionMode: 'execute',
      chatVariables: { score: '3' },
    });

    expect(result.output).toBe('');
    expect(result.effects).toEqual([
      expect.objectContaining({
        operation: 'addvar',
        kind: 'variableWrite',
        targetStore: 'chatVariable',
        target: 'score',
        valuePreview: '5',
        committed: false,
      }),
      expect.objectContaining({
        operation: 'setdefaultvar',
        kind: 'variableWrite',
        targetStore: 'characterDefaultVariable',
        target: 'mood',
        valuePreview: 'calm',
        committed: false,
      }),
    ]);
  });

  it('stores return value in simulator-local state and stops downstream traversal', () => {
    const result = simulateCbsText('before {{return::done}} after {{setvar::mood::calm}}');

    expect(result.output).toBe('before ');
    expect(result.effects).toEqual([]);
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'return',
        details: expect.objectContaining({ valuePreview: 'done', source: 'localReturn' }),
      }),
    );
  });
});

describe('CBS simulator block control-flow fixtures', () => {
  it('renders :else body for falsy when condition', () => {
    const result = simulateCbsText('A{{#when::0}}truthy{{:else}}falsy{{/}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('AfalsyZ');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: '#when',
        details: expect.objectContaining({ truthy: false }),
      }),
    );
  });

  it('simulates numbered close parser output end to end', () => {
    const result = simulateCbsText('{{#if {{? 1=1}}}}A{{#if {{? 1=1}}}}B{{/2}}{{/1}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('AB');
    expect(result.diagnostics).toEqual([]);
  });

  it('surfaces arbitrary slash close tags as parser diagnostics instead of legacy numbered closes', () => {
    const result = simulateCbsText('{{#if {{? 1=1}}}}A{{/whatever}}Z');

    expect(result.status).toBe('error');
    expect(result.output).toBe('AZ');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'CBS006',
        message: 'Cross-nested block close detected',
        severity: 'error',
      }),
    ]);
  });

  it('surfaces parser depth cap diagnostics through simulator results', () => {
    const depth = 66;
    const source = `${'{{#if 1}}'.repeat(depth)}deep${'{{/if}}'.repeat(depth)}`;
    const result = simulateCbsText(source);

    expect(result.status).toBe('partial');
    expect(result.output).toContain('deep');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CBS007' })]),
    );
  });

  it('evaluates nested pure macro conditions in deprecated #if blocks', () => {
    const truthy = simulateCbsText('A{{#if {{equal::{{getvar::route}}::alpha}}}}\n  yes\n{{/if}}Z', {
      chatVariables: { route: 'alpha' },
    });
    const falsy = simulateCbsText('A{{#if {{equal::{{getvar::route}}::alpha}}}}\n  yes\n{{/if}}Z', {
      chatVariables: { route: 'beta' },
    });

    expect(truthy.status).toBe('ok');
    expect(truthy.output).toBe('AyesZ');
    expect(falsy.status).toBe('ok');
    expect(falsy.output).toBe('AZ');
    expect(truthy.trace).toContainEqual(
      expect.objectContaining({
        node: '#if',
        details: expect.objectContaining({ condition: '1', truthy: true }),
      }),
    );
    expect(falsy.trace).toContainEqual(
      expect.objectContaining({
        node: '#if',
        details: expect.objectContaining({ condition: '0', truthy: false }),
      }),
    );
  });

  it('evaluates nested pure macro conditions in deprecated #if_pure blocks without trimming body whitespace', () => {
    const truthy = simulateCbsText('A{{#if_pure {{equal::{{getvar::route}}::alpha}}}}\n  yes\n{{/if_pure}}Z', {
      chatVariables: { route: 'alpha' },
    });
    const falsy = simulateCbsText('A{{#if_pure {{equal::{{getvar::route}}::alpha}}}}\n  yes\n{{/if_pure}}Z', {
      chatVariables: { route: 'beta' },
    });

    expect(truthy.status).toBe('ok');
    expect(truthy.output).toBe('A\n  yes\nZ');
    expect(falsy.status).toBe('ok');
    expect(falsy.output).toBe('AZ');
  });

  it('accepts legacy #if close tags for #if_pure blocks in simulator output', () => {
    const result = simulateCbsText('A{{#if_pure 1}}\n  pure\n{{/if}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('A\n  pure\nZ');
    expect(result.diagnostics).toEqual([]);
  });

  it('does not execute effect macros inside falsy deprecated #if blocks', () => {
    const result = simulateCbsText('{{#if {{equal::{{getvar::route}}::alpha}}}}{{setvar::route::mutated}}{{/if}}after', {
      chatVariables: { route: 'beta' },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('after');
    expect(result.effects).toEqual([]);
    expect(result.trace).not.toContainEqual(expect.objectContaining({ node: 'setvar' }));
  });

  it('does not execute effect macros inside falsy deprecated #if_pure blocks', () => {
    const result = simulateCbsText(
      '{{#if_pure {{equal::{{getvar::route}}::alpha}}}}{{setvar::route::mutated}}{{/if_pure}}after',
      {
        chatVariables: { route: 'beta' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('after');
    expect(result.effects).toEqual([]);
    expect(result.trace).not.toContainEqual(expect.objectContaining({ node: 'setvar' }));
  });

  it('does not execute setter macros inside falsy execute-mode control-flow bodies', () => {
    const result = simulateCbsText(
      [
        '{{#if 0}}{{setvar::ifBody::mutated}}{{/if}}',
        '{{#if_pure 0}}{{addvar::pureBody::1}}{{/if_pure}}',
        '{{#when::0}}{{setdefaultvar::whenBody::mutated}}{{/}}',
        'after',
      ].join(''),
      { executionMode: 'execute' },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('after');
    expect(result.effects).toEqual([]);
    expect(result.trace).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'setvar' }),
        expect.objectContaining({ node: 'addvar' }),
        expect.objectContaining({ node: 'setdefaultvar' }),
      ]),
    );
  });

  it('simulates a reduced #_Response_Template legacy branch reproduction without parser or calc diagnostics', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? ({{getglobalvar::toggle_response_mode}}=2)+({{getglobalvar::toggle_response_mode}}=3)}}}}',
        'response branch',
        '{{#if {{? ({{getglobalvar::toggle_response_mode}}<2)+(!{{getglobalvar::toggle_writing_style}}=5)}}}}',
        ' style branch',
        '{{/13}}{{/1}}',
      ].join(''),
      {
        globalVariables: {
          toggle_response_mode: '2',
          toggle_writing_style: '4',
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('response branch style branch');
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CBS006' }),
        expect.objectContaining({ code: 'CBSSIM002' }),
      ]),
    );
    expect(result.diagnostics).toEqual([]);
  });

  it('matches upstream right-to-left logical operator behavior', () => {
    expect(simulateCbsText('{{#when::1::or::0::and::0}}yes{{/}}').output).toBe('yes');
    expect(simulateCbsText('{{#when::0::or::1::and::0}}yes{{:else}}no{{/}}').output).toBe('no');
    expect(simulateCbsText('{{#when::1::and::0::or::1}}yes{{/}}').output).toBe('yes');
  });

  it('replaces #each slot aliases from JSON array literal', () => {
    const result = simulateCbsText('{{#each ["a","b"] as item}}{{slot::item}}{{/}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('ab');
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: '#each',
        details: expect.objectContaining({ alias: 'item', count: 2 }),
      }),
    );
  });

  it('expands numeric #each iterator text into a zero-based inclusive range', () => {
    const result = simulateCbsText('{{#each 3 as item}}[{{slot::item}}]{{/each}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('[0][1][2][3]');
    expect(result.diagnostics).toEqual([]);
  });

  it('splits non-JSON #each iterator text on section signs', () => {
    const result = simulateCbsText('{{#each alpha§beta§gamma as item}}{{slot::item}}|{{/each}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('alpha|beta|gamma|');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates #each compatibility headers without the as keyword', () => {
    const result = simulateCbsText('{{#each {{array::alpha::beta}} item}}[{{slot::item}}]{{/each}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('[alpha][beta]');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps #each whitespace when the keep operator is present', () => {
    const result = simulateCbsText('{{#each::keep ["a","b"] as item}}\n  {{slot::item}}\n{{/each}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('\n  a\n\n  b\n');
    expect(result.diagnostics).toEqual([]);
  });

  it('stringifies non-string #each array items', () => {
    const result = simulateCbsText('{{#each [1,true,{"name":"x"}] item}}{{slot::item}}|{{/each}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|true|{"name":"x"}|');
    expect(result.diagnostics).toEqual([]);
  });

  it('preserves bare slot when no host slot context is provided', () => {
    const result = simulateCbsText('before {{slot}} after');

    expect(result.status).toBe('partial');
    expect(result.output).toBe('before {{slot}} after');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'simulator',
          severity: 'warning',
          message: expect.stringContaining('slot'),
        }),
      ]),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'slot',
        details: expect.objectContaining({ policy: 'source-preserved', supportClass: 'runtime-unknown' }),
      }),
    );
  });

  it('preserves position macros when no lore position context is provided', () => {
    const result = simulateCbsText('A{{position::ep1}}Z');

    expect(result.status).toBe('partial');
    expect(result.output).toBe('A{{position::ep1}}Z');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'simulator',
          severity: 'warning',
          message: expect.stringContaining('position'),
        }),
      ]),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'position',
        details: expect.objectContaining({
          key: 'ep1',
          policy: 'source-preserved',
          supportClass: 'runtime-unknown',
        }),
      }),
    );
  });

  it('evaluates position macros with an explicit lore position provider', () => {
    const result = simulateCbsText('A{{position::ep1}}Z', {
      lorePositions: { ep1: 'Episode 1 lore' },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('AEpisode 1 loreZ');
    expect(result.diagnostics).toEqual([]);
  });

  it('preserves explicit lore position provider through the default context factory', () => {
    const context = createDefaultCbsSimulationContext({
      lorePositions: { ep1: 'Episode 1 lore' },
    });

    const result = simulateCbsText('A{{position::ep1}}Z', context);

    expect(result.status).toBe('ok');
    expect(result.output).toBe('AEpisode 1 loreZ');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('CBS simulator #_Response_Template variable combination fixtures', () => {
  it('renders response mode 3 branch through boolean arithmetic OR and legacy numbered close', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? ({{getglobalvar::toggle_response_mode}}=2)+({{getglobalvar::toggle_response_mode}}=3)}}}}',
        'OOC',
        '{{/1}}',
      ].join(''),
      {
        globalVariables: { toggle_response_mode: '3' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('OOC');
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves custom language cascade with length, equal, not_equal, and logical macros', () => {
    const customLanguage = simulateCbsText(
      [
        '{{#if {{and::{{equal::{{getglobalvar::toggle_response_language}}::3}}::{{not_equal::{{length::{{getglobalvar::toggle_customlanguage1}}}}::0}}}}}}',
        '{{getglobalvar::toggle_customlanguage1}}',
        '{{/if}}',
        '{{#if {{or::{{equal::{{getglobalvar::toggle_response_language}}::0}}::{{equal::{{length::{{getglobalvar::toggle_customlanguage1}}}}::0}}}}}}',
        'Default',
        '{{/if}}',
      ].join(''),
      {
        globalVariables: {
          toggle_response_language: '3',
          toggle_customlanguage1: 'French',
        },
      },
    );
    const defaultLanguage = simulateCbsText(
      [
        '{{#if {{and::{{equal::{{getglobalvar::toggle_response_language}}::3}}::{{not_equal::{{length::{{getglobalvar::toggle_customlanguage1}}}}::0}}}}}}',
        '{{getglobalvar::toggle_customlanguage1}}',
        '{{/if}}',
        '{{#if {{or::{{equal::{{getglobalvar::toggle_response_language}}::0}}::{{equal::{{length::{{getglobalvar::toggle_customlanguage1}}}}::0}}}}}}',
        'Default',
        '{{/if}}',
      ].join(''),
      {
        globalVariables: {
          toggle_response_language: '0',
          toggle_customlanguage1: '',
        },
      },
    );

    expect(customLanguage.status).toBe('ok');
    expect(customLanguage.output).toBe('French');
    expect(customLanguage.diagnostics).toEqual([]);
    expect(defaultLanguage.status).toBe('ok');
    expect(defaultLanguage.output).toBe('Default');
    expect(defaultLanguage.diagnostics).toEqual([]);
  });

  it('evaluates negated writing-mode and enhancement arithmetic condition without mutating context', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        globalVariables: {
          toggle_writing_mode: '3',
          toggle_input_enhancement: '2',
          toggle_heng: '0',
        },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText(
      '{{#if {{? !({{getglobalvar::toggle_writing_mode}}=4)*({{getglobalvar::toggle_input_enhancement}}+{{getglobalvar::toggle_heng}})}}}}COMPLEX{{/if}}',
      context,
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('COMPLEX');
    expect(result.diagnostics).toEqual([]);
    expect(snapshotContext(context)).toBe(before);
  });

  it('renders input enhancement branches for preset and custom enhancement text', () => {
    const presetEnhancement = simulateCbsText(
      '{{#if {{? {{getglobalvar::toggle_input_enhancement}}=2}}}}ENHANCE{{/if}}',
      {
        globalVariables: { toggle_input_enhancement: '2' },
      },
    );
    const customEnhancement = simulateCbsText(
      '{{#if {{? {{getglobalvar::toggle_input_enhancement}}=3}}}}{{getglobalvar::toggle_custom_input_enhancement}}{{/if}}',
      {
        globalVariables: {
          toggle_input_enhancement: '3',
          toggle_custom_input_enhancement: 'CUSTOM ENHANCE',
        },
      },
    );

    expect(presetEnhancement.status).toBe('ok');
    expect(presetEnhancement.output).toBe('ENHANCE');
    expect(presetEnhancement.diagnostics).toEqual([]);
    expect(customEnhancement.status).toBe('ok');
    expect(customEnhancement.output).toBe('CUSTOM ENHANCE');
    expect(customEnhancement.diagnostics).toEqual([]);
  });

  it('combines TRPG mode and summon toggles through comparison arithmetic', () => {
    const result = simulateCbsText(
      '{{#if {{? ({{getglobalvar::toggle_trpgmode}}>=1)*({{getglobalvar::toggle_summon}}=1)}}}}TRPG+HELENA{{/if}}',
      {
        globalVariables: {
          toggle_trpgmode: '2',
          toggle_summon: '1',
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('TRPG+HELENA');
    expect(result.diagnostics).toEqual([]);
  });

  it('renders feature-request cascade markers from ftp, Tod, and RPreq toggles', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? {{getglobalvar::toggle_ftp}}=1}}}}FTP{{/if}}',
        '{{#if {{? {{getglobalvar::toggle_Tod}}=1}}}}+TOD{{/if}}',
        '{{#if {{? {{getglobalvar::toggle_RPreq}}=1}}}}+RP{{/if}}',
      ].join(''),
      {
        globalVariables: {
          toggle_ftp: '1',
          toggle_Tod: '1',
          toggle_RPreq: '1',
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('FTP+TOD+RP');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('CBS simulator #_System_Rule variable combination fixtures', () => {
  it('renders the TRPG system branch when toggle_trpgmode is at least one', () => {
    const result = simulateCbsText(
      '{{#if {{? {{getglobalvar::toggle_trpgmode}}>=1}}}}# HELENA TRPG System Prompt{{/if}}',
      {
        globalVariables: { toggle_trpgmode: '1' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('# HELENA TRPG System Prompt');
    expect(result.diagnostics).toEqual([]);
  });

  it('splits system and OOC prompt branches around response mode two', () => {
    const systemMode = simulateCbsText(
      '{{#if {{? {{getglobalvar::toggle_response_mode}}<2}}}}SYSTEM{{/if}}{{#if {{? {{getglobalvar::toggle_response_mode}}>=2}}}}OOC{{/if}}',
      {
        globalVariables: { toggle_response_mode: '1' },
      },
    );
    const oocMode = simulateCbsText(
      '{{#if {{? {{getglobalvar::toggle_response_mode}}<2}}}}SYSTEM{{/if}}{{#if {{? {{getglobalvar::toggle_response_mode}}>=2}}}}OOC{{/if}}',
      {
        globalVariables: { toggle_response_mode: '3' },
      },
    );

    expect(systemMode.status).toBe('ok');
    expect(systemMode.output).toBe('SYSTEM');
    expect(systemMode.diagnostics).toEqual([]);
    expect(oocMode.status).toBe('ok');
    expect(oocMode.output).toBe('OOC');
    expect(oocMode.diagnostics).toEqual([]);
  });

  it('renders the Helena profile when a System Rule any-chain toggle is enabled', () => {
    const result = simulateCbsText(
      '{{#if {{any::{{? {{getglobalvar::toggle_Dok}}=1}}::{{? {{getglobalvar::toggle_summon}}=1}}::{{? {{getglobalvar::toggle_trpgmode}}>=1}}}}}}HELENA PROFILE{{/if}}',
      {
        globalVariables: {
          toggle_Dok: '0',
          toggle_summon: '1',
          toggle_trpgmode: '0',
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('HELENA PROFILE');
    expect(result.diagnostics).toEqual([]);
  });

  it('uses custom narrative text when not_equal, length, and and all pass without mutating context', () => {
    const context = deepFreeze(
      createDefaultCbsSimulationContext({
        globalVariables: { toggle_custom_narrative: 'Clockwork Archivist' },
      }),
    );
    const before = snapshotContext(context);

    const result = simulateCbsText(
      '{{#if {{and::{{not_equal::{{getglobalvar::toggle_custom_narrative}}::null}}::{{? {{length::{{getglobalvar::toggle_custom_narrative}}}}>0}}}}}}Narrator: {{getglobalvar::toggle_custom_narrative}}{{/if}}',
      context,
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('Narrator: Clockwork Archivist');
    expect(result.diagnostics).toEqual([]);
    expect(snapshotContext(context)).toBe(before);
  });

  it('falls back to default narrative style through negated custom narrative condition', () => {
    const result = simulateCbsText(
      '{{#if {{not::{{and::{{not_equal::{{getglobalvar::toggle_custom_narrative}}::null}}::{{? {{length::{{getglobalvar::toggle_custom_narrative}}}}>0}}}}}}}}DEFAULT NARRATIVE{{/if}}',
      {
        globalVariables: { toggle_custom_narrative: '' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('DEFAULT NARRATIVE');
    expect(result.diagnostics).toEqual([]);
  });

  it('chooses narrative style two without rendering style one in the cascade', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? {{getglobalvar::toggle_narrative_style}}=1}}}}STYLE_ONE{{/if}}',
        '{{#if {{? {{getglobalvar::toggle_narrative_style}}=2}}}}STYLE_TWO{{/if}}',
        '{{#if {{? {{getglobalvar::toggle_narrative_style}}>0}}}}+VOICE{{/if}}',
      ].join(''),
      {
        globalVariables: { toggle_narrative_style: '2' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('STYLE_TWO+VOICE');
    expect(result.diagnostics).toEqual([]);
  });

  it('uses simulator-local HELENA temp state for gettempvar and tempvar branches without mutating context', () => {
    const context = deepFreeze(createDefaultCbsSimulationContext());
    const before = snapshotContext(context);

    const result = simulateCbsText(
      '{{settempvar::HELENA::TRUE}}{{#if {{equal::{{gettempvar::HELENA}}::TRUE}}}}GET{{/if}}{{#if {{equal::{{tempvar::HELENA}}::TRUE}}}}+TEMP{{/if}}',
      context,
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('GET+TEMP');
    expect(result.diagnostics).toEqual([]);
    expect(snapshotContext(context)).toBe(before);
  });

  it('evaluates the negated writing perspective calc comparison', () => {
    const result = simulateCbsText(
      '{{#if {{? !({{getglobalvar::toggle_writing_perspective}}=7)}}}}KEEP SECRETS{{/if}}',
      {
        globalVariables: { toggle_writing_perspective: '6' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('KEEP SECRETS');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('CBS simulator provider-backed runtime fixtures', () => {
  it('uses injected clock providers for time macros and records provider consumption', () => {
    const fixedIso = '2026-05-05T12:34:56.000Z';
    const result = simulateCbsText('{{unixtime}} {{isotime}} {{isodate}}', {
      providers: {
        clock: () => new Date(fixedIso),
        rng: () => 0,
        pickHashRand: () => 0,
      },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1777984496 12:34:56 2026-5-5');
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'unixtime',
          details: expect.objectContaining({ provider: 'clock', sequence: 0, iso: fixedIso }),
        }),
        expect.objectContaining({
          node: 'isotime',
          details: expect.objectContaining({ provider: 'clock', sequence: 1, iso: fixedIso }),
        }),
        expect.objectContaining({
          node: 'isodate',
          details: expect.objectContaining({ provider: 'clock', sequence: 2, iso: fixedIso }),
        }),
      ]),
    );
  });

  it('formats time macro with custom format string using the same formatter as date', () => {
    // Use injected clock to verify time and date produce identical formatted output
    const fixedIso = '2026-05-05T14:30:45.000Z';
    const result = simulateCbsText('{{time::YYYY-MM-DD HH:mm:ss A}} {{date::YYYY-MM-DD HH:mm:ss A}}', {
      providers: {
        clock: () => new Date(fixedIso),
        rng: () => 0,
        pickHashRand: () => 0,
      },
    });

    expect(result.status).toBe('ok');
    expect(result.diagnostics).toEqual([]);
    // Both macros use the same formatDateTime helper, so outputs should match
    const parts = result.output.split(' ');
    expect(parts.length).toBe(6);
    expect(parts[0]).toBe(parts[3]); // date part matches
    expect(parts[1]).toBe(parts[4]); // time part matches
    expect(parts[2]).toBe(parts[5]); // AM/PM part matches
  });

  it('uses options providers over context providers for random, roll, and hash macros', () => {
    const randomValues = [0.1, 0.9, 0.1, 0.9];
    let randomIndex = 0;
    const result = simulateCbsText(
      '{{random::a::b}} {{random::a::b}} {{roll::2d6}} {{hash::seed}}',
      {
        providers: {
          clock: () => new Date('1970-01-01T00:00:00.000Z'),
          rng: () => 0,
          pickHashRand: () => 0,
        },
      },
      {
        providers: {
          rng: () => randomValues[randomIndex++] ?? 0,
          pickHashRand: (_seed, upperBound) => upperBound - 1,
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('a b 7 10000000');
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'random', details: expect.objectContaining({ provider: 'rng', sequence: 0, value: 0.1 }) }),
        expect.objectContaining({ node: 'random', details: expect.objectContaining({ provider: 'rng', sequence: 1, value: 0.9 }) }),
        expect.objectContaining({ node: 'roll', details: expect.objectContaining({ provider: 'rng', sequence: 2, value: 0.1 }) }),
        expect.objectContaining({ node: 'roll', details: expect.objectContaining({ provider: 'rng', sequence: 3, value: 0.9 }) }),
        expect.objectContaining({
          node: 'hash',
          details: expect.objectContaining({ provider: 'pickHashRand', sequence: 4, seed: 'seed', upperBound: 10000000 }),
        }),
      ]),
    );
  });
});

describe('CBS simulator contextual and runtime-unknown policy fixtures', () => {
  it('preserves unknown macro source while reporting diagnostics as side-channel metadata', () => {
    const result = simulateCbsText('A{{mystery macro::value}}Z');

    expect(result.output).toBe('A{{mystery macro::value}}Z');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CBS003', source: 'parser' }),
        expect.objectContaining({ code: 'CBSSIM001', source: 'simulator', severity: 'warning' }),
      ]),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        phase: 'macro-skip',
        node: 'mysterymacro',
        message: expect.stringContaining('preserving source'),
      }),
    );
  });

  it('resolves contextual macros only from explicit context values', () => {
    const result = simulateCbsText('{{user}} {{char}} {{role}} {{chatindex}} {{isfirstmsg}}', {
      userLabel: 'Noel',
      characterLabel: 'Risu',
      role: 'user',
      chatIndex: 42,
      isFirstMessage: true,
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('Noel Risu user 42 1');
  });

  it('preserves context and runtime-dependent macros with simulator warnings when context is missing', () => {
    const result = simulateCbsText('{{char}} {{role}} {{history}} {{model}}');

    expect(result.output).toBe('{{char}} {{role}} {{history}} {{model}}');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('requires explicit context.characterLabel') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('requires explicit context.role') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Runtime-unknown CBS macro "history"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Runtime-unknown CBS macro "model"') }),
      ]),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'history',
        details: expect.objectContaining({ policy: 'source-preserved', supportClass: 'runtime-unknown' }),
      }),
    );
  });

  it('uses empty preview fallback for unresolved normal asset and media macros without loading assets', () => {
    const result = simulateCbsText('A{{asset::hero}}{{image::portrait}}{{audio::theme}}{{bg::forest}}{{video-img::clip}}{{path::avatar}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('AZ');
    expect(result.effects).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "asset"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "image"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "audio"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "bg"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "video-img"') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "path"') }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'asset', details: expect.objectContaining({ policy: 'preview-empty-fallback', supportClass: 'unsupported' }) }),
        expect.objectContaining({ node: 'video-img', details: expect.objectContaining({ policy: 'preview-empty-fallback', supportClass: 'unsupported' }) }),
      ]),
    );
  });

  it('preserves unresolved inlay macros literally while reporting preview diagnostics', () => {
    const result = simulateCbsText('A{{inlay::portrait}}{{inlayed::caption}}{{inlayeddata::payload}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('A{{inlay::portrait}}{{inlayed::caption}}{{inlayeddata::payload}}Z');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Unresolved inlay macro "inlay" preserved literally') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Unresolved inlay macro "inlayed" preserved literally') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('Unresolved inlay macro "inlayeddata" preserved literally') }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'inlay', details: expect.objectContaining({ policy: 'inlay-literal-preserved', supportClass: 'unsupported' }) }),
        expect.objectContaining({ node: 'inlayeddata', details: expect.objectContaining({ policy: 'inlay-literal-preserved', supportClass: 'unsupported' }) }),
      ]),
    );
  });

  it('preserves chat history macros when no explicit chat history provider exists', () => {
    const result = simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}');

    expect(result.status).toBe('partial');
    expect(result.output).toBe('{{lastmessageid}}|{{previous_chat_log::0}}');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('lastmessageid') }),
        expect.objectContaining({ source: 'simulator', severity: 'warning', message: expect.stringContaining('previouschatlog') }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'lastmessageid', details: expect.objectContaining({ policy: 'source-preserved', supportClass: 'runtime-unknown' }) }),
        expect.objectContaining({ node: 'previouschatlog', details: expect.objectContaining({ policy: 'source-preserved', supportClass: 'runtime-unknown' }) }),
      ]),
    );
  });

  it('resolves chat history macros from an explicit chat history provider', () => {
    const result = simulateCbsText('{{lastmessageid}}|{{previous_chat_log::0}}|{{previouschatlog::9}}', {
      chatHistory: ['hello', 'world'],
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|hello|Out of range');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('CBS simulator pure macro fixtures', () => {
  it('suppresses nested macro diagnostics inside #escape pure bodies', () => {
    const result = simulateCbsText('A{{#escape}} {{unknown::x}} (raw) {{/escape}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('A\uE9B8\uE9B8unknown::x\uE9B9\uE9B9 \uE9BAraw\uE9BBZ');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps #escape::keep body whitespace while suppressing nested macro diagnostics', () => {
    const result = simulateCbsText('A{{#escape::keep}} {{unknown::x}} {{/escape}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('A\uE9B8\uE9B8unknown::x\uE9B9\uE9B9Z');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates nested pure arguments before the parent comparison handler', () => {
    const result = simulateCbsText('{{equal::{{lower::NOEL}}::noel}}');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1');

    const pureTrace = result.trace.filter(
      (event) => event.phase === 'macro-skip' && event.message.startsWith('evaluated pure macro'),
    );
    expect(pureTrace.map((event) => event.node)).toEqual(['lower', 'equal']);
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        node: 'equal',
        details: expect.objectContaining({ argsPreview: ['noel', 'noel'], resultPreview: '1' }),
      }),
    );
  });

  it('evaluates deterministic string, math, comparison, array, object, and encoding macros', () => {
    const result = simulateCbsText(
      [
        '{{startswith::Hello World::Hello}}',
        '{{replace::Hello World::o::0}}',
        '{{calc::2+2*3}}',
        '{{round::3.7}}',
        '{{sum::{{makearray::1::2::3}}}}',
        '{{arrayelement::{{makearray::a::b}}::1}}',
        '{{dictelement::{{makedict::name=Noel}}::name}}',
        '{{unicodeencode::A}}',
        '{{unicodedecode::65}}',
        '{{blank}}{{none}}',
      ].join('|'),
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|Hell0 W0rld|8|4|6|b|Noel|65|A|');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates upstream-style calc comparison operators', () => {
    const result = simulateCbsText(
      [
        '{{? 1=1}}',
        '{{? 1==1}}',
        '{{? 1!=2}}',
        '{{? 1<2}}',
        '{{? 2<=2}}',
        '{{? 3>2}}',
        '{{? 3>=3}}',
        '{{? 1=2}}',
      ].join('|'),
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|1|1|1|1|1|1|0');
    expect(result.diagnostics).toEqual([]);
  });

  it('treats legacy => calc comparison as greater-than-or-equal compatibility', () => {
    const result = simulateCbsText(
      [
        '{{? 1=>1}}',
        '{{? 2=>1}}',
        '{{? 0=>1}}',
        '{{#if {{? 1=>1}}}}yes{{/if}}',
      ].join('|'),
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|1|0|yes');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates nullish variable equality comparisons without widening arithmetic', () => {
    const result = simulateCbsText(
      [
        '{{? {{getvar::vg_Language}} != 2}}',
        '{{#if {{? {{getvar::vg_Language}} != 2}}}}english{{/if}}',
        '{{? {{getvar::vg_Language}} == 2}}',
        '{{? {{getvar::vg_Language}} == null}}',
        '{{? null == undefined}}',
        '{{? 2 != {{getvar::vg_Language}}}}',
        '{{? {{getvar::vg_Language}} < 2}}',
        '{{? {{getvar::vg_Language}} + 2}}',
        '{{? unknown == 2}}',
      ].join('|'),
      {
        chatVariables: { vg_Language: null },
      },
    );

    expect(result.output).toBe('1|english|0|1|1|1|NaN|NaN|NaN');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CBSSIM002', source: 'simulator', severity: 'warning' }),
      ]),
    );
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'CBSSIM002')).toHaveLength(3);
  });

  it('evaluates upstream-style calc logical operators', () => {
    const result = simulateCbsText(
      [
        '{{? 1=1 && 2=2}}',
        '{{? 1=2 || 2=2}}',
        '{{? !(1=2)}}',
        '{{? 1=1 && 2=3}}',
      ].join('|'),
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|1|1|0');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates calc boolean comparison results inside arithmetic expressions', () => {
    const result = simulateCbsText(
      ['{{? (1=1)+(2=2)}}', '{{? (1=2)+(2=2)}}', '{{? (1=2)+(2=3)}}'].join('|'),
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('2|1|0');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates chained language-style calc branches from legacy prompt templates', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? ({{getglobalvar::toggle_response_mode}}=2)+({{getglobalvar::toggle_response_mode}}=3)}}}}response{{/if}}',
        '{{#if {{? ({{getglobalvar::toggle_response_mode}}<2)+(!{{getglobalvar::toggle_writing_style}}=5)}}}}style{{/if}}',
      ].join('|'),
      {
        globalVariables: {
          toggle_response_mode: '2',
          toggle_writing_style: '4',
        },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('response|style');
    expect(result.diagnostics).toEqual([]);
  });

  it('evaluates legacy calc not-equals shorthand before equality comparison', () => {
    const result = simulateCbsText(['{{? !5=5}}', '{{? !4=5}}', '{{? !{{getglobalvar::toggle_nodoubt}}=0}}'].join('|'), {
      globalVariables: { toggle_nodoubt: '1' },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('0|1|1');
    expect(result.diagnostics).toEqual([]);
  });

  it('uses upstream-style calc comparisons inside deprecated #if and #if_pure headers', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? {{getvar::ct_Deck_Level}} <= 2}}}}low{{/if}}',
        '{{#if {{? {{getvar::ct_Deck_Level}} > 2}}}}high{{/if}}',
        '{{#if_pure {{? {{getglobalvar::toggle_thinkkniht}}=1}}}} yes {{/if}}',
      ].join('|'),
      {
        chatVariables: { ct_Deck_Level: '2' },
        globalVariables: { toggle_thinkkniht: '1' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('low|| yes ');
    expect(result.diagnostics).toEqual([]);
  });

  it('returns structured diagnostics instead of throwing for invalid pure macro arguments', () => {
    const result = simulateCbsText('{{arrayelement::not-json::0}} {{calc::2+bad}}');

    expect(result.output).toBe('null NaN');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBSSIM002',
          message: expect.stringContaining('arrayelement'),
          source: 'simulator',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'CBSSIM002',
          message: expect.stringContaining('calc'),
          source: 'simulator',
          severity: 'warning',
        }),
      ]),
    );
    expect(result.trace).toContainEqual(
      expect.objectContaining({
        phase: 'diagnostic',
        node: 'CBSSIM002',
      }),
    );
  });
});
