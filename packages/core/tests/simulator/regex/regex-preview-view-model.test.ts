import { describe, expect, it } from 'vitest';

import { simulateRisuRegexPreview, type RisuRegexPreviewViewModel } from '../../../src/simulator/regex';

describe('simulateRisuRegexPreview', () => {
  it('handles the planned move-top ordered status preview scenario', () => {
    const result = simulateRisuRegexPreview({
      rawDocument: createRisuRegexDocument({
        comment: 'status',
        type: 'editdisplay',
        ableFlag: true,
        flag: 'g<move_top><order 1>',
        input: 'HP:(\\d+)',
        output: 'HP=$1',
      }),
      sampleInput: 'Name Noel\nHP:12',
    });

    expect(result.status).toBe('ok');
    expect(result.entry?.comment).toBe('status');
    expect(result.flags?.jsFlags).toBe('g');
    expect(result.replacementPlan.appliedDirectiveRawTokens).toEqual(['<move_top>', '<order 1>']);
    expect(result.nativePreview.matches[0]?.text).toBe('HP:12');
    expect(result.replacementPreview.output).toBe('Name Noel\nHP=12');
    expect(result.replacementPlan).toMatchObject({
      placement: 'top',
      order: 1,
    });
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_RUNTIME_PARITY_SIMULATED' }),
    ]);
  });

  it('builds a viewer-ready DTO from parsed .risuregex, CBS, native preview, and directive plan', () => {
    const result = simulateRisuRegexPreview({
      rawDocument: createRisuRegexDocument({
        flag: '<cbs><move_top>',
        input: '{{getvar::pattern}}',
        output: 'HP={{getvar::label}}:$1',
      }),
      sampleInput: 'HP:12 HP:7',
      context: {
        chatVariables: {
          pattern: 'HP:(\\d+)',
          label: 'value',
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.entry?.comment).toBe('preview fixture');
    expect(result.flags?.jsFlags).toBe('');
    expect(result.flags?.directives.map((directive) => directive.kind)).toEqual(['cbs', 'move_top']);
    expect(result.cbs?.pattern.output).toBe('HP:(\\d+)');
    expect(result.cbs?.replacement.output).toBe('HP=value:$1');
    expect(result.nativePreview.matches).toHaveLength(2);
    expect(result.replacementPreview.output).toBe('HP=value:12 HP=value:7');
    expect(result.replacementPlan).toMatchObject({
      output: 'HP=value:12 HP=value:7',
      placement: 'top',
      cbs: true,
      confidence: 'simulated',
    });
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'RISUREGEX_RUNTIME_PARITY_SIMULATED' }),
    ]);
    expect(result.trace.map((event) => event.phase)).toEqual(['parse', 'flags', 'cbs', 'native', 'replacement', 'plan']);
    expect(result.diagnostics).toEqual([]);
  });

  it('skips native regex and replacement preview for disabled entries', () => {
    const result = simulateRisuRegexPreview({
      rawDocument: createRisuRegexDocument({
        ableFlag: false,
        flag: 'g',
        input: 'HP:(\\d+)',
        output: 'HP=$1',
      }),
      sampleInput: 'HP:12',
    });

    expect(result.status).toBe('partial');
    expect(result.nativePreview.matches).toEqual([]);
    expect(result.replacementPreview.output).toBe('HP:12');
    expect(result.replacementPreview.diff).toEqual([{ operation: 'equal', kind: 'equal', text: 'HP:12' }]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'RISUREGEX_ENTRY_DISABLED',
        severity: 'info',
        source: 'risuregex-preview',
      }),
    ]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: 'disabled',
          message: expect.stringContaining('ableFlag'),
        }),
      ]),
    );
  });

  it('returns a JSON-serializable view model', () => {
    const result = simulateRisuRegexPreview({
      rawDocument: createRisuRegexDocument({
        flag: '',
        input: '(?<key>[A-Z]+):(\\d+)',
        output: '$<key>=$2',
      }),
      sampleInput: 'HP:12 MP:7',
    });

    const parsed = JSON.parse(JSON.stringify(result)) as RisuRegexPreviewViewModel;

    expect(parsed.status).toBe('ok');
    expect(parsed.nativePreview.matches).toHaveLength(2);
    expect(parsed.replacementPreview.output).toBe('HP=12 MP=7');
    expect(parsed.cbs?.pattern.coverage.byMacroName).toEqual({});
  });

  it('does not mutate caller context or limits', () => {
    const context = {
      chatVariables: {
        pattern: 'HP:(\\d+)',
        label: 'value',
      },
      providers: {
        rng: () => 0.5,
      },
    };
    const limits = {
      maxMatches: 1,
      maxOutputLength: 8,
    };
    const contextSnapshot = { ...context, chatVariables: { ...context.chatVariables }, providers: { ...context.providers } };
    const limitsSnapshot = { ...limits };

    const result = simulateRisuRegexPreview({
      rawDocument: createRisuRegexDocument({
        flag: '<cbs>',
        input: '{{getvar::pattern}}',
        output: 'HP={{getvar::label}}:$1',
      }),
      sampleInput: 'HP:12 HP:7',
      context,
      limits,
    });

    expect(context).toEqual(contextSnapshot);
    expect(limits).toEqual(limitsSnapshot);
    expect(result.nativePreview.limits).toMatchObject(limitsSnapshot);
    expect(result.nativePreview.matches).toHaveLength(1);
    expect(result.replacementPreview.output).toBe('HP=value');
  });
});

/**
 * createRisuRegexDocument 함수.
 * Test fixture용 canonical `.risuregex` document를 생성함.
 *
 * @param options - frontmatter와 IN/OUT section override
 * @returns parseRegexContent가 읽을 수 있는 raw document
 */
function createRisuRegexDocument(options: {
  comment?: string;
  type?: string;
  flag?: string;
  ableFlag?: boolean;
  input: string;
  output: string;
}): string {
  return [
    '---',
    `comment: ${options.comment ?? 'preview fixture'}`,
    `type: ${options.type ?? 'editprocess'}`,
    ...(options.ableFlag === undefined ? [] : [`ableFlag: ${String(options.ableFlag)}`]),
    ...(options.flag === undefined ? [] : [`flag: ${JSON.stringify(options.flag)}`]),
    '---',
    '@@@ IN',
    options.input,
    '@@@ OUT',
    options.output,
    '',
  ].join('\n');
}
