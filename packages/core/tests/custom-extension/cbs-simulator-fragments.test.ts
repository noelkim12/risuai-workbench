import { describe, expect, it } from 'vitest';
import {
  simulateCustomExtensionCbsFragments,
  type CustomExtensionCbsSimulationResult,
} from '../../src/domain/custom-extension/cbs-simulator';
import type { CustomExtensionArtifact } from '../../src/domain/custom-extension/contracts';

describe('custom-extension CBS fragment simulation adapter', () => {
  it('simulates only lorebook CONTENT and ignores KEYS sections', () => {
    const content = `---
name: Lorebook Adapter Test
comment: Verifies CONTENT-only simulation
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
---
@@@ KEYS
{{user}}
lore keyword
@@@ CONTENT
Hello {{user}}
`;

    const result = simulateCustomExtensionCbsFragments('lorebook', content, {
      context: {
        userLabel: 'Noel',
      },
    });

    expect(result.status).toBe('ok');
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]).toMatchObject({
      id: '1:CONTENT',
      index: 0,
      section: 'CONTENT',
      content: 'Hello {{user}}',
    });
    expect(result.fragments[0].result.output).toBe('Hello Noel');
    expect(result.coverage.totalMacros).toBe(1);
    expect(result.coverage.byMacroName.user).toBe(1);
    expect(result.fragments[0].content).not.toContain('lore keyword');
    expect(result.fragments[0].content).not.toContain('@@@ KEYS');
    expect(content.slice(result.fragments[0].start, result.fragments[0].end)).toBe(
      result.fragments[0].content,
    );
  });

  it('simulates CBS-bearing regex fragments in mapper order and preserves metadata', () => {
    const content = `---
comment: Adapter test
type: editdisplay
---
@@@ IN
{{getvar::pattern}}
@@@ OUT
{{setvar::replacement::next}}{{getvar::replacement}}
`;

    const result = simulateCustomExtensionCbsFragments('regex', content, {
      context: {
        executionMode: 'execute',
        chatVariables: {
          pattern: 'source-pattern',
          replacement: 'existing-replacement',
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.fragmentMap.artifact).toBe('regex');
    expect(result.fragments.map((fragment) => fragment.section)).toEqual(['IN', 'OUT']);
    expect(result.fragments.map((fragment) => fragment.index)).toEqual([0, 1]);
    expect(result.fragments[0]).toMatchObject({
      id: '1:IN',
      content: '{{getvar::pattern}}',
    });
    expect(result.fragments[1].id).toBe('2:OUT');
    expect(content.slice(result.fragments[0].start, result.fragments[0].end)).toBe(
      result.fragments[0].content,
    );
    expect(result.fragments[0].result.output).toBe('source-pattern');
    expect(result.fragments[1].result.output).toBe('existing-replacement');
    expect(result.coverage.totalMacros).toBe(3);
    expect(result.coverage.byMacroName.getvar).toBe(2);
    expect(result.coverage.byMacroName.setvar).toBe(1);
    expect(result.fragments[1].result.effects).toEqual([
      expect.objectContaining({
        operation: 'setvar',
        kind: 'variableWrite',
        target: 'replacement',
      }),
    ]);
    expect(result.fragments[1].result.effects[0].fragmentId).toBeUndefined();
    expect(result.effects).toHaveLength(1);
    expect(result.effects[0]).toMatchObject({
      operation: 'setvar',
      kind: 'variableWrite',
      targetStore: 'chatVariable',
      target: 'replacement',
      committed: false,
      fragmentId: '2:OUT',
      fragmentIndex: 1,
      section: 'OUT',
      fragmentStart: result.fragments[1].start,
      fragmentEnd: result.fragments[1].end,
    });
    expect(result.effects[0].operation).not.toContain('[2:OUT]');
    expect(result.trace.some((event) => event.message.startsWith('[1:IN]'))).toBe(true);
    expect(result.trace.some((event) => event.details?.fragmentId === '2:OUT')).toBe(true);
  });

  it('passes global, chat history, and lore position context through every fragment run', () => {
    const content = `---
comment: Adapter context pass-through test
type: editdisplay
---
@@@ IN
Global={{getglobalvar::mood}}|History={{lastmessageid}}/{{previous_chat_log::0}}
@@@ OUT
Lore={{position::ep1}}|Alias={{previouschatlog::1}}
`;

    const result = simulateCustomExtensionCbsFragments('regex', content, {
      context: {
        globalVariables: {
          mood: 'focused',
        },
        chatHistory: ['first message', 'second message'],
        lorePositions: {
          ep1: 'Episode 1 lore',
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.fragments.map((fragment) => fragment.result.output)).toEqual([
      'Global=focused|History=1/first message',
      'Lore=Episode 1 lore|Alias=second message',
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(result.coverage.byMacroName).toMatchObject({
      getglobalvar: 1,
      lastmessageid: 1,
      previouschatlog: 2,
      position: 1,
    });
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'getglobalvar',
          details: expect.objectContaining({ fragmentId: '1:IN', source: 'global' }),
        }),
        expect.objectContaining({
          node: 'lastmessageid',
          details: expect.objectContaining({ fragmentId: '1:IN', source: 'context.chatHistory' }),
        }),
        expect.objectContaining({
          node: 'previouschatlog',
          details: expect.objectContaining({ fragmentId: '2:OUT', source: 'context.chatHistory' }),
        }),
        expect.objectContaining({
          node: 'position',
          details: expect.objectContaining({ fragmentId: '2:OUT', source: 'context.lorePositions' }),
        }),
      ]),
    );
  });

  it('passes simulation option providers through the adapter boundary', () => {
    const content = '{{random::left::right}}|{{unixtime}}';
    const fixedIso = '2026-05-05T12:34:56.000Z';

    const result = simulateCustomExtensionCbsFragments('html', content, {
      context: {
        providers: {
          clock: () => new Date('1970-01-01T00:00:00.000Z'),
          rng: () => 0,
          pickHashRand: () => 0,
        },
      },
      simulationOptions: {
        providers: {
          clock: () => new Date(fixedIso),
          rng: () => 0.9,
        },
      },
    });

    expect(result.status).toBe('ok');
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]).toMatchObject({ id: '1:full', section: 'full' });
    expect(result.fragments[0].result.output).toBe('right|1777984496');
    expect(result.diagnostics).toEqual([]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'random',
          details: expect.objectContaining({ fragmentId: '1:full', provider: 'rng', value: 0.9 }),
        }),
        expect.objectContaining({
          node: 'unixtime',
          details: expect.objectContaining({ fragmentId: '1:full', provider: 'clock', iso: fixedIso }),
        }),
      ]),
    );
  });

  it('preserves partial simulator output and diagnostics when aggregating fragment results', () => {
    const content = 'A{{slot}}|{{inlay::portrait}}Z';

    const result = simulateCustomExtensionCbsFragments('text', content);

    expect(result.status).toBe('partial');
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0]).toMatchObject({ id: '1:TEXT', section: 'TEXT' });
    expect(result.fragments[0].result.status).toBe('partial');
    expect(result.fragments[0].result.output).toBe(content);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CBSSIM001',
          source: 'simulator',
          message: expect.stringContaining('slot'),
          data: expect.objectContaining({ fragmentId: '1:TEXT', section: 'TEXT' }),
        }),
        expect.objectContaining({
          source: 'simulator',
          message: expect.stringContaining('Unresolved inlay macro "inlay" preserved literally'),
          data: expect.objectContaining({ fragmentId: '1:TEXT', section: 'TEXT' }),
        }),
      ]),
    );
    expect(result.coverage.unknownMacros).toEqual([]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node: 'slot',
          details: expect.objectContaining({ fragmentId: '1:TEXT', policy: 'source-preserved' }),
        }),
        expect.objectContaining({
          node: 'inlay',
          details: expect.objectContaining({ fragmentId: '1:TEXT', policy: 'inlay-literal-preserved' }),
        }),
      ]),
    );
  });

  it('aggregates parser diagnostics conservatively and keeps per-fragment details', () => {
    const content = `---
comment: Adapter status test
type: editdisplay
---
@@@ IN
{{getvar::pattern}}
@@@ OUT
{{#when {{equal::1::1}}}}unterminated
`;

    const result = simulateCustomExtensionCbsFragments('regex', content, {
      context: {
        chatVariables: {
          pattern: 'source-pattern',
        },
      },
    });

    expect(result.status).toBe('error');
    expect(result.fragments).toHaveLength(2);
    expect(result.fragments[0].result.status).toBe('ok');
    expect(result.fragments[1].result.status).toBe('error');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].message).toContain('[2:OUT]');
    expect(result.diagnostics[0].data).toMatchObject({
      fragmentId: '2:OUT',
      fragmentIndex: 1,
      section: 'OUT',
    });
    expect(result.coverage.totalMacros).toBeGreaterThanOrEqual(2);
  });

  it('returns ok with empty fragments for non-CBS toggle artifacts', () => {
    const content = `display_name: Safety Toggle
enabled: true
{{getvar::ignored}}
`;

    const result = simulateCustomExtensionCbsFragments('toggle', content);

    expect(result.status).toBe('ok');
    expect(result.fragmentMap).toEqual({
      artifact: 'toggle',
      fragments: [],
      fileLength: content.length,
    });
    expect(result.fragments).toEqual([]);
    expect(result.diagnostics).toEqual([]);
    expect(result.effects).toEqual([]);
    expect(result.trace).toEqual([]);
    expect(result.coverage).toEqual({
      totalMacros: 0,
      bySupportClass: {},
      unknownMacros: [],
      byMacroName: {},
    });
  });

  it('returns structured diagnostics when fragment mapping throws', () => {
    const result: CustomExtensionCbsSimulationResult = simulateCustomExtensionCbsFragments(
      'risuchar' as CustomExtensionArtifact,
      'not a custom-extension artifact',
    );

    expect(result.status).toBe('error');
    expect(result.fragments).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      source: 'simulator',
      severity: 'error',
      code: 'CBSSIM_FRAGMENT_MAPPING',
    });
    expect(result.diagnostics[0].message).toContain('Unknown artifact type');
    expect(result.trace[0]).toMatchObject({
      phase: 'diagnostic',
      message: 'custom-extension CBS fragment mapping failed',
    });
  });
});
