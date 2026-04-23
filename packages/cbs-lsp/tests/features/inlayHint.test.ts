/**
 * CBS inlay hint provider tests.
 * @file packages/cbs-lsp/tests/features/inlayHint.test.ts
 */

import { describe, expect, it } from 'vitest';
import type { InlayHint, InlayHintParams } from 'vscode-languageserver/node';

import { FragmentAnalysisService } from '../../src/core';
import {
  InlayHintProvider,
  INLAY_HINT_PROVIDER_AVAILABILITY,
} from '../../src/features/inlayHint';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

function createProvider(
  request: ReturnType<typeof createFixtureRequest>,
  service: FragmentAnalysisService = new FragmentAnalysisService(),
): InlayHintProvider {
  return new InlayHintProvider({
    analysisService: service,
    resolveRequest: () => request,
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  startOffset: number = 0,
  endOffset?: number,
): InlayHintParams {
  const textLength = request.text.length;
  const resolvedEndOffset = endOffset ?? textLength;

  return {
    textDocument: { uri: request.uri },
    range: {
      start: offsetToPosition(request.text, startOffset),
      end: offsetToPosition(request.text, resolvedEndOffset),
    },
  };
}

function findHintLabel(hints: readonly InlayHint[], needle: string): string | undefined {
  const matchedHint = hints.find((hint) => hint.label === needle);
  return typeof matchedHint?.label === 'string' ? matchedHint.label : undefined;
}

function filterHintsByLabelPrefix(hints: readonly InlayHint[], prefix: string): InlayHint[] {
  return hints.filter((hint) =>
    typeof hint.label === 'string' ? hint.label.startsWith(prefix) : false,
  );
}

describe('InlayHintProvider', () => {
  it('exposes local-only availability honesty metadata', () => {
    const provider = new InlayHintProvider();

    expect(provider.availability).toEqual(INLAY_HINT_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:inlayHint',
      detail:
        'Inlay hints are active for routed CBS fragments, show parameter names for setvar/getvar/call/arg, block header labels for #when/#each/#func, and never widen into workspace-wide hints.',
    });
  });

  it('returns empty hints for non-CBS documents', () => {
    const request = {
      uri: 'file:///test.txt',
      version: 1,
      filePath: '/test.txt',
      text: 'plain text without CBS',
    };
    const provider = createProvider(request);
    const params: InlayHintParams = {
      textDocument: { uri: request.uri },
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: request.text.length },
      },
    };

    expect(provider.provide(params)).toEqual([]);
  });

  it('shows setvar parameter hints (name:, value:) in a lorebook fragment', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{setvar::mood::happy}}');
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'name:')).toBeDefined();
    expect(findHintLabel(hints, 'value:')).toBeDefined();
  });

  it('shows getvar parameter hint (name:) in a lorebook fragment', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{getvar::mood}}');
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'name:')).toBeDefined();
  });

  it('shows #when block condition hint (condition:)', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{#when mood}}content{{/when}}');
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'condition:')).toBeDefined();
  });

  it('shows #each block iterator and alias hints', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#each items as item}}content{{/each}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'iterator:')).toBeDefined();
    expect(findHintLabel(hints, 'alias:')).toBeDefined();
  });

  it('shows #func parameter slot mapping hints (arg::N → paramName:)', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func greet name greeting}}Hello{{/func}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'arg::0 \u2192 name:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::1 \u2192 greeting:')).toBeDefined();
  });

  it('shows call:: argument hints resolved from #func declaration', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func greet name greeting}}Hello{{/func}}{{call::greet::Noel::hi}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'func:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::0 \u2192 name:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::1 \u2192 greeting:')).toBeDefined();
  });

  it('shows arg::N hints mapped to enclosing #func parameter names', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{#func greet name greeting}}{{arg::0}}{{arg::1}}{{/func}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    // #func header hints
    expect(findHintLabel(hints, 'arg::0 \u2192 name:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::1 \u2192 greeting:')).toBeDefined();
    // arg::N body hints resolved from enclosing #func parameter names
    expect(findHintLabel(hints, 'name:')).toBeDefined();
    expect(findHintLabel(hints, 'greeting:')).toBeDefined();
  });

  it('falls back to arg::N: labels when call:: targets an undeclared local function', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace('{{user}}', '{{call::unknown::value1::value2}}');
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);
    const params = createParams(request);
    const hints = provider.provide(params);

    expect(findHintLabel(hints, 'func:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::0:')).toBeDefined();
    expect(findHintLabel(hints, 'arg::1:')).toBeDefined();
  });

  it('limits hints to the requested range', () => {
    const entry = getFixtureCorpusEntry('lorebook-basic');
    const text = entry.text.replace(
      '{{user}}',
      '{{setvar::a::1}}{{setvar::b::2}}',
    );
    const request = { ...createFixtureRequest(entry), text };
    const provider = createProvider(request);

    // Request range covering only the first setvar
    const firstSetvarIndex = text.indexOf('{{setvar::a::1}}');
    const secondSetvarIndex = text.indexOf('{{setvar::b::2}}');
    const params: InlayHintParams = {
      textDocument: { uri: request.uri },
      range: {
        start: offsetToPosition(text, firstSetvarIndex),
        end: offsetToPosition(text, firstSetvarIndex + '{{setvar::a::1}}'.length),
      },
    };

    const hints = provider.provide(params);
    expect(hints.length).toBe(2);
    expect(findHintLabel(hints, 'name:')).toBeDefined();
    expect(findHintLabel(hints, 'value:')).toBeDefined();

    // Second setvar should not appear because it's outside the range
    const secondSetvarStart = offsetToPosition(text, secondSetvarIndex);
    expect(hints.every((hint) => hint.position.line <= secondSetvarStart.line)).toBe(true);
  });
});
