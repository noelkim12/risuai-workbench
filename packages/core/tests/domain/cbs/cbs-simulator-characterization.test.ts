import { describe, expect, it } from 'vitest';

import {
  CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
  createDefaultCbsSimulationContext,
  simulateCbsText,
  type CbsSimulationContext,
} from '../../../src/domain/cbs';

/**
 * deepFreeze 함수.
 * characterization 테스트에서 caller context mutation을 차단함.
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
    executionMode: context.executionMode,
    chatVariables: context.chatVariables,
    characterDefaultVariables: context.characterDefaultVariables,
    templateDefaultVariables: context.templateDefaultVariables,
    globalVariables: context.globalVariables,
    toggleValues: context.toggleValues,
    tempVariables: context.tempVariables,
    userLabel: context.userLabel,
    characterLabel: context.characterLabel,
    role: context.role,
    chatIndex: context.chatIndex,
    isFirstMessage: context.isFirstMessage,
    lorePositions: context.lorePositions,
    chatHistory: context.chatHistory,
  });
}

describe('CBS simulator PR1 characterization safety net', () => {
  it('preserves unknown macro source and records simulator warning metadata', () => {
    const result = simulateCbsText('A{{missing::x}}Z');

    expect(result.status).toBe('error');
    expect(result.output).toBe('A{{missing::x}}Z');
    expect(result.coverage.unknownMacros).toContain('missing');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE,
          source: 'simulator',
          severity: 'warning',
        }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'macro-enter', node: 'missing' }),
        expect.objectContaining({ phase: 'macro-skip', node: 'missing' }),
        expect.objectContaining({ phase: 'macro-exit', node: 'missing' }),
      ]),
    );
  });

  it('keeps asset/media empty preview fallback and inlay literal preservation separate', () => {
    const result = simulateCbsText('A{{asset::hero}}{{image::portrait}}{{video-img::clip}}{{inlay::portrait}}Z');

    expect(result.status).toBe('ok');
    expect(result.output).toBe('A{{inlay::portrait}}Z');
    expect(result.effects).toEqual([]);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "asset"') }),
        expect.objectContaining({ message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "image"') }),
        expect.objectContaining({ message: expect.stringContaining('Preview fallback erased unresolved asset/media macro "video-img"') }),
        expect.objectContaining({ message: expect.stringContaining('Unresolved inlay macro "inlay" preserved literally') }),
      ]),
    );
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'asset', details: expect.objectContaining({ policy: 'preview-empty-fallback' }) }),
        expect.objectContaining({ node: 'image', details: expect.objectContaining({ policy: 'preview-empty-fallback' }) }),
        expect.objectContaining({ node: 'video-img', details: expect.objectContaining({ policy: 'preview-empty-fallback' }) }),
        expect.objectContaining({ node: 'inlay', details: expect.objectContaining({ policy: 'inlay-literal-preserved' }) }),
      ]),
    );
  });

  it('resolves runtime-sensitive macros only from explicit injected context', () => {
    const missingContext = simulateCbsText('{{char}}|{{role}}|{{lastmessageid}}|{{previous_chat_log::0}}|{{position::intro}}');
    const explicitContext = simulateCbsText('{{user}}|{{char}}|{{role}}|{{chatindex}}|{{isfirstmsg}}|{{lastmessageid}}|{{previous_chat_log::0}}|{{position::intro}}', {
      userLabel: 'Tester',
      characterLabel: 'Risu',
      role: 'assistant',
      chatIndex: 7,
      isFirstMessage: false,
      chatHistory: ['hello', 'world'],
      lorePositions: { intro: 'Intro lore' },
    });

    expect(missingContext.status).toBe('partial');
    expect(missingContext.output).toBe('{{char}}|{{role}}|{{lastmessageid}}|{{previous_chat_log::0}}|{{position::intro}}');
    expect(missingContext.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'char', details: expect.objectContaining({ policy: 'source-preserved' }) }),
        expect.objectContaining({ node: 'role', details: expect.objectContaining({ policy: 'source-preserved' }) }),
        expect.objectContaining({ node: 'lastmessageid', details: expect.objectContaining({ policy: 'source-preserved' }) }),
        expect.objectContaining({ node: 'previouschatlog', details: expect.objectContaining({ policy: 'source-preserved' }) }),
        expect.objectContaining({ node: 'position', details: expect.objectContaining({ policy: 'source-preserved' }) }),
      ]),
    );

    expect(explicitContext.status).toBe('ok');
    expect(explicitContext.output).toBe('Tester|Risu|assistant|7|0|1|hello|Intro lore');
    expect(explicitContext.diagnostics).toEqual([]);
  });

  it('distinguishes preview source preservation from execute-mode dry-run variable effects', () => {
    const previewContext = deepFreeze(createDefaultCbsSimulationContext({ chatVariables: { mood: 'angry' } }));
    const executeContext = deepFreeze(createDefaultCbsSimulationContext({ executionMode: 'execute', chatVariables: { score: '3' } }));
    const previewBefore = snapshotContext(previewContext);
    const executeBefore = snapshotContext(executeContext);

    const preview = simulateCbsText('{{setvar::mood::calm}} {{addvar::score::2}}', previewContext);
    const execute = simulateCbsText('{{addvar::score::2}}{{setdefaultvar::tone::soft}}', executeContext);

    expect(preview.status).toBe('ok');
    expect(preview.output).toBe('{{setvar::mood::calm}} {{addvar::score::2}}');
    expect(preview.effects).toEqual([]);
    expect(snapshotContext(previewContext)).toBe(previewBefore);

    expect(execute.status).toBe('ok');
    expect(execute.output).toBe('');
    expect(execute.effects).toEqual([
      expect.objectContaining({ operation: 'addvar', targetStore: 'chatVariable', target: 'score', valuePreview: '5', committed: false }),
      expect.objectContaining({ operation: 'setdefaultvar', targetStore: 'characterDefaultVariable', target: 'tone', valuePreview: 'soft', committed: false }),
    ]);
    expect(snapshotContext(executeContext)).toBe(executeBefore);
  });

  it('keeps temp variable writes local to one simulation without mutating caller context', () => {
    const context = deepFreeze(createDefaultCbsSimulationContext({ tempVariables: { scratch: 'seed' } }));
    const before = snapshotContext(context);

    const first = simulateCbsText('{{tempvar::scratch}}/{{settempvar::scratch::changed}}{{tempvar::scratch}}', context);
    const second = simulateCbsText('{{tempvar::scratch}}', context);

    expect(first.status).toBe('ok');
    expect(first.output).toBe('seed/changed');
    expect(second.status).toBe('ok');
    expect(second.output).toBe('seed');
    expect(snapshotContext(context)).toBe(before);
  });

  it('uses deterministic time, rng, and hash providers with provider trace events', () => {
    const randomValues = [0.1, 0.9, 0.4];
    let randomIndex = 0;
    const fixedIso = '2026-05-05T12:34:56.000Z';
    const result = simulateCbsText('{{unixtime}}|{{isotime}}|{{random::a::b}}|{{random::a::b}}|{{pick::red::blue}}|{{roll::1d6}}', {
      providers: {
        clock: () => new Date(fixedIso),
        rng: () => randomValues[randomIndex++] ?? 0,
        pickHashRand: () => 1,
      },
    });

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1777984496|12:34:56|a|b|blue|3');
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'unixtime', details: expect.objectContaining({ provider: 'clock', sequence: 0, iso: fixedIso }) }),
        expect.objectContaining({ node: 'isotime', details: expect.objectContaining({ provider: 'clock', sequence: 1, iso: fixedIso }) }),
        expect.objectContaining({ node: 'random', details: expect.objectContaining({ provider: 'rng', sequence: 2, value: 0.1 }) }),
        expect.objectContaining({ node: 'random', details: expect.objectContaining({ provider: 'rng', sequence: 3, value: 0.9 }) }),
        expect.objectContaining({ node: 'pick', details: expect.objectContaining({ provider: 'pickHashRand', sequence: 4, upperBound: 2 }) }),
        expect.objectContaining({ node: 'roll', details: expect.objectContaining({ provider: 'rng', sequence: 5, value: 0.4 }) }),
      ]),
    );
  });

  it('locks pure macro and calc behavior used by legacy branch conditions', () => {
    const result = simulateCbsText(
      '{{equal::{{lower::NOEL}}::noel}}|{{calc::2+2*3}}|{{? ({{getglobalvar::mode}}=2)+(!{{getglobalvar::style}}=5)}}',
      { globalVariables: { mode: '2', style: '4' } },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('1|8|2');
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: 'lower', details: expect.objectContaining({ resultPreview: 'noel' }) }),
        expect.objectContaining({ node: 'equal', details: expect.objectContaining({ argsPreview: ['noel', 'noel'], resultPreview: '1' }) }),
        expect.objectContaining({ node: 'calc', details: expect.objectContaining({ resultPreview: '8' }) }),
      ]),
    );
  });

  it('characterizes #if, #when, and #each control-flow output and trace details', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? {{getglobalvar::enabled}}=1}}}}IF{{/if}}',
        '|{{#when::0}}WHEN{{:else}}ELSE{{/}}',
        '|{{#each ["a","b"] as item}}[{{slot::item}}]{{/each}}',
      ].join(''),
      { globalVariables: { enabled: '1' } },
    );

    expect(result.status).toBe('ok');
    expect(result.output).toBe('IF|ELSE|[a][b]');
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ node: '#if', details: expect.objectContaining({ condition: '1', rawCondition: '{{? {{getglobalvar::enabled}}=1}}', truthy: true }) }),
        expect.objectContaining({ node: '#when', details: expect.objectContaining({ rawCondition: '0', truthy: false }) }),
        expect.objectContaining({ node: '#each', details: expect.objectContaining({ alias: 'item', count: 2 }) }),
      ]),
    );
  });

  it('keeps raw condition text in #if and #when trace details for compact preview labels', () => {
    const result = simulateCbsText(
      [
        '{{#if {{? ({{getvar::vg_Choice_Flag}} == 4)}} }}IF{{/if}}',
        '{{#when::{{getglobalvar::toggle_advice}}::is::1}}WHEN{{/when}}',
      ].join('\n'),
      {
        chatVariables: { vg_Choice_Flag: '4' },
        globalVariables: { toggle_advice: '1' },
      },
    );

    expect(result.status).toBe('ok');
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: '#if',
          details: expect.objectContaining({ rawCondition: '{{? ({{getvar::vg_Choice_Flag}} == 4)}}' }),
        }),
        expect.objectContaining({
          node: '#when',
          details: expect.objectContaining({ rawCondition: '{{getglobalvar::toggle_advice}}::is::1' }),
        }),
      ]),
    );
  });

  it('reports budget status and keeps trace/diagnostic key events observable', () => {
    const stopped = simulateCbsText('A {{user}} B {{char}} C', undefined, { maxSteps: 2, onBudgetExceeded: 'stop' });
    const continued = simulateCbsText('A {{user}} B {{char}} C', undefined, { maxSteps: 2, onBudgetExceeded: 'continue' });
    const diagnostics = simulateCbsText('{{arrayelement::not-json::0}} {{missing::x}}');

    expect(stopped.status).toBe('aborted');
    expect(stopped.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'parse' }),
        expect.objectContaining({ phase: 'visit' }),
        expect.objectContaining({ phase: 'budget-exceeded', message: expect.stringContaining('maxSteps') }),
      ]),
    );

    expect(continued.status).toBe('partial');
    expect(continued.trace).toContainEqual(expect.objectContaining({ phase: 'budget-exceeded' }));

    expect(diagnostics.status).toBe('error');
    expect(diagnostics.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CBSSIM002', source: 'simulator', severity: 'warning' }),
        expect.objectContaining({ code: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE, source: 'simulator', severity: 'warning' }),
      ]),
    );
    expect(diagnostics.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'diagnostic', node: 'CBSSIM002' }),
        expect.objectContaining({ phase: 'diagnostic', node: CBS_SIMULATOR_UNSUPPORTED_MACRO_DIAGNOSTIC_CODE }),
      ]),
    );
  });
});
