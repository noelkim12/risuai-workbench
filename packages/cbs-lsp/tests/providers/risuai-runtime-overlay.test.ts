/**
 * RisuAI runtime overlay provider tests.
 * @file packages/cbs-lsp/tests/providers/risuai-runtime-overlay.test.ts
 */

import { describe, expect, it } from 'vitest';
import { Position } from 'vscode-languageserver/node';

import {
  buildRisuAiRuntimeCompletionItems,
  createRisuAiRuntimeDefinition,
  createRisuAiRuntimeHover,
  findRisuAiRuntimeTokenAtPosition,
} from '../../src/providers/lua/risuaiRuntimeOverlay';

const runtimeDocUri = 'file:///workspace/.risu-stubs/risu-runtime.d.lua';

/**
 * positionAt 함수.
 * 테스트 source에서 needle 기준 cursor position을 계산함.
 *
 * @param source - 탐색할 테스트 Lua source
 * @param needle - cursor 기준 문자열
 * @param delta - needle 시작점에서 더할 cursor offset
 * @returns LSP position
 */
function positionAt(source: string, needle: string, delta = 0): Position {
  const offset = source.indexOf(needle) + delta;
  const prefix = source.slice(0, offset);
  const lines = prefix.split('\n');
  return Position.create(lines.length - 1, lines.at(-1)?.length ?? 0);
}

describe('findRisuAiRuntimeTokenAtPosition', () => {
  it('detects a known runtime function token', () => {
    const source = 'local value = getState("mood")';
    const token = findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'getState', 3));

    expect(token).toEqual({ name: 'getState', range: expect.any(Object) });
  });

  it('detects a known runtime table token', () => {
    const source = 'LLM.ask("hello")';
    const token = findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'LLM', 1));

    expect(token?.name).toBe('LLM');
  });

  it('detects a known runtime function through _G member access', () => {
    const source = 'if _G.axLLM then result = axLLM(triggerId, request_msgs) end';

    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'axLLM', 2))?.name).toBe('axLLM');
    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, '_G', 1))?.name).toBe('axLLM');
    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, '.axLLM', 0))?.name).toBe('axLLM');
  });

  it('keeps bare runtime function calls in fallback branches connected', () => {
    const source = 'result = LLM(triggerId, request_msgs)';
    const token = findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'LLM', 1));

    expect(token?.name).toBe('LLM');
  });

  it('detects runtime functions assigned to local aliases', () => {
    const source = 'local invokeModel = axLLM';
    const token = findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'axLLM', 2));

    expect(token?.name).toBe('axLLM');
  });

  it('ignores ordinary Lua globals and unknown names', () => {
    const source = 'local value = string.len(name) + print(name)';

    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'string', 2))).toBeNull();
    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'print', 2))).toBeNull();
  });

  it('ignores identifiers that only contain a runtime name as a substring', () => {
    const source = 'local getStateful = 1';

    expect(findRisuAiRuntimeTokenAtPosition(source, positionAt(source, 'getStateful', 3))).toBeNull();
  });
});

describe('buildRisuAiRuntimeCompletionItems', () => {
  it('suggests runtime globals for a Lua identifier prefix', () => {
    const source = 'local result = ax';
    const completions = buildRisuAiRuntimeCompletionItems({
      source,
      position: positionAt(source, 'ax', 2),
    });

    expect(completions.map((item) => item.label)).toContain('axLLM');
    expect(completions.find((item) => item.label === 'axLLM')).toMatchObject({
      detail: expect.stringContaining('axLLM'),
      insertText: 'axLLM',
      kind: 3,
      sortText: '1000-risu-runtime-axLLM',
    });
    expect(JSON.stringify(completions.find((item) => item.label === 'axLLM'))).toContain(
      'RisuAI runtime global completion',
    );
  });

  it('suggests all runtime globals at a plain expression boundary', () => {
    const source = 'local result = ';
    const completions = buildRisuAiRuntimeCompletionItems({
      source,
      position: { line: 0, character: source.length },
    });
    const labels = completions.map((item) => item.label);

    expect(labels).toEqual(expect.arrayContaining(['log', 'LLM', 'axLLM', 'getState']));
  });

  it('marks namespace globals as module completions', () => {
    const source = 'local encoded = js';
    const completions = buildRisuAiRuntimeCompletionItems({
      source,
      position: positionAt(source, 'js', 2),
    });

    expect(completions.find((item) => item.label === 'json')).toMatchObject({
      kind: 9,
      insertText: 'json',
    });
  });

  it('dedupes LuaLS-style generated stub labels', () => {
    const source = 'local value = get';
    const completions = buildRisuAiRuntimeCompletionItems({
      source,
      position: positionAt(source, 'get', 3),
      existingLabels: new Set(['getState(', 'getLoreBooks(']),
    });
    const labels = completions.map((item) => item.label);

    expect(labels).not.toContain('getState');
    expect(labels).not.toContain('getLoreBooks');
    expect(labels).toContain('getChat');
  });

  it('does not suggest runtime globals inside string literals or CBS macro strings', () => {
    const luaString = 'local text = "ge"';
    const cbsString = 'local cbs = "{{get"';

    expect(
      buildRisuAiRuntimeCompletionItems({
        source: luaString,
        position: positionAt(luaString, 'ge', 2),
      }),
    ).toEqual([]);
    expect(
      buildRisuAiRuntimeCompletionItems({
        source: cbsString,
        position: positionAt(cbsString, 'get', 3),
      }),
    ).toEqual([]);
  });

  it('does not suggest runtime globals after member access separators or comments', () => {
    const memberAccess = 'local length = string.';
    const comment = '-- ge';

    expect(
      buildRisuAiRuntimeCompletionItems({
        source: memberAccess,
        position: { line: 0, character: memberAccess.length },
      }),
    ).toEqual([]);
    expect(
      buildRisuAiRuntimeCompletionItems({
        source: comment,
        position: positionAt(comment, 'ge', 2),
      }),
    ).toEqual([]);
  });
});

describe('createRisuAiRuntimeHover', () => {
  it('renders labeled runtime hover markdown from core metadata', () => {
    const source = 'log("hello")';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, 'log', 1));

    expect(hover).not.toBeNull();
    expect(hover?.contents).toEqual({
      kind: 'markdown',
      value: expect.stringContaining('RisuAI Runtime'),
    });
    expect(JSON.stringify(hover)).toContain('log');
  });

  it('renders runtime hover markdown for _G member access', () => {
    const source = 'if _G.axLLM then result = axLLM(triggerId, request_msgs) end';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, '_G', 1));

    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover)).toContain('RisuAI Runtime');
    expect(JSON.stringify(hover)).toContain('axLLM');
  });

  it('renders rich LLM documentation from the core runtime catalog', () => {
    const source = 'local result = LLM(triggerId, request_msgs)';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, 'LLM', 1));

    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover)).toContain('Wrapper: LLM convenience function (main model).');
    expect(JSON.stringify(hover)).toContain('`prompt` — OpenAI-style prompt item array or compatible table.');
    expect(JSON.stringify(hover)).toContain('**Returns:** Result envelope with success and result text.');
    expect(JSON.stringify(hover)).toContain('local result = LLM(id,');
  });

  it('renders rich axLLM documentation from the core runtime catalog', () => {
    const source = 'local result = axLLM(triggerId, request_msgs)';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, 'axLLM', 1));

    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover)).toContain('Wrapper: axLLM convenience function (secondary model).');
    expect(JSON.stringify(hover)).toContain('configured secondary model instead of the main model');
    expect(JSON.stringify(hover)).toContain('local result = axLLM(id,');
  });

  it('renders rich documentation for common state and listener helpers', () => {
    const stateSource = 'local state = getState(id, "game")';
    const listenerSource = 'listenEdit("editInput", function(id, value, meta) return value end)';
    const stateHover = createRisuAiRuntimeHover(stateSource, positionAt(stateSource, 'getState', 2));
    const listenerHover = createRisuAiRuntimeHover(listenerSource, positionAt(listenerSource, 'listenEdit', 2));

    expect(JSON.stringify(stateHover)).toContain('Wrapper: get JSON-backed state from chat variables.');
    expect(JSON.stringify(stateHover)).toContain('local state = getState(id,');
    expect(JSON.stringify(listenerHover)).toContain('Wrapper: register edit listeners');
    expect(JSON.stringify(listenerHover)).toContain('editInput');
  });

  it('renders fallback documentation for globals without curated docs yet', () => {
    const source = 'local name = getName(id)';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, 'getName', 2));

    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover)).toContain('RisuAI runtime global: getName.');
    expect(JSON.stringify(hover)).toContain('Category: character');
  });

  it('renders runtime hover markdown for runtime functions assigned to aliases', () => {
    const source = 'local invokeModel = axLLM';
    const hover = createRisuAiRuntimeHover(source, positionAt(source, 'axLLM', 2));

    expect(hover).not.toBeNull();
    expect(JSON.stringify(hover)).toContain('RisuAI Runtime');
    expect(JSON.stringify(hover)).toContain('axLLM');
  });
});

describe('createRisuAiRuntimeDefinition', () => {
  it('returns a deterministic definition target for a runtime global', () => {
    const source = 'getState("mood")';
    const definition = createRisuAiRuntimeDefinition(source, positionAt(source, 'getState', 2), runtimeDocUri);

    expect(definition).toEqual([
      expect.objectContaining({
        targetUri: runtimeDocUri,
        targetRange: expect.any(Object),
        targetSelectionRange: expect.any(Object),
      }),
    ]);
  });

  it('returns null for unknown identifiers', () => {
    const source = 'local value = customFunction()';

    expect(createRisuAiRuntimeDefinition(source, positionAt(source, 'customFunction', 2), runtimeDocUri)).toBeNull();
  });
});
