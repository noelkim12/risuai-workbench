import { describe, expect, it } from 'vitest';

import {
  detectCompletionTriggerContext,
  FragmentAnalysisService,
  type CompletionTriggerContext,
  type FragmentAnalysisRequest,
} from '../../src/core';
import { offsetToPosition } from '../../src/utils/position';

function createInlineRequest(text: string): FragmentAnalysisRequest {
  return {
    uri: 'file:///workspace/completion-context.risuhtml',
    version: 1,
    filePath: '/workspace/completion-context.risuhtml',
    text,
  };
}

function contextAt(text: string, offset: number): CompletionTriggerContext {
  const service = new FragmentAnalysisService();
  const request = createInlineRequest(text);
  const lookup = service.locatePosition(request, offsetToPosition(text, offset));

  expect(lookup).not.toBeNull();
  return detectCompletionTriggerContext(lookup!);
}

function contextAtNeedle(
  text: string,
  needle: string,
  characterOffset: number = needle.length,
): CompletionTriggerContext {
  const offset = text.indexOf(needle);

  expect(offset).toBeGreaterThanOrEqual(0);
  return contextAt(text, offset + characterOffset);
}

describe('detectCompletionTriggerContext characterization', () => {
  it.each([
    ['bare root macro', '{{', '{{'.length, { type: 'all-functions', prefix: '' }],
    ['partial root macro', '{{fo', '{{fo'.length, { type: 'all-functions', prefix: 'fo' }],
    ['partial block macro', '{{#e', '{{#e'.length, { type: 'block-functions', prefix: 'e' }],
    ['else keyword macro', '{{:', '{{:'.length, { type: 'all-functions', prefix: ':' }],
  ])('preserves %s context shape', (_name, text, offset, expected) => {
    expect(contextAt(text, offset)).toEqual(expect.objectContaining(expected));
  });

  it('routes incomplete close tags to the open block close-tag context', () => {
    const text = '{{#when::mood::is}}ok {{/}}{{/when}}';

    expect(contextAtNeedle(text, '{{/')).toEqual(
      expect.objectContaining({
        type: 'close-tag',
        prefix: '',
        blockKind: 'when',
      }),
    );
  });

  it('distinguishes tokenized else-keyword context from raw PlainText {{: fallback', () => {
    const text = '{{#when::mood::is}}yes {{:else}}no{{/when}}';

    expect(contextAtNeedle(text, '{{:')).toEqual(
      expect.objectContaining({
        type: 'else-keyword',
        prefix: '',
      }),
    );
  });

  it.each([
    ['metadata first argument', '{{metadata::user}}', '{{metadata::user'.length, 'metadata-keys', ''],
    ['call first argument', '{{#func myFunc name}}x{{/func}}{{call::myFunc}}', '{{#func myFunc name}}x{{/func}}{{call::myFunc'.length, 'function-names', ''],
    ['slot first argument', '{{#each items as main}}{{slot::main}}{{/each}}', '{{#each items as main}}{{slot::main'.length, 'slot-aliases', ''],
  ])('preserves specialized first-argument routing for %s', (_name, text, offset, type, prefix) => {
    expect(contextAt(text, offset)).toEqual(expect.objectContaining({ type, prefix }));
  });

  it('routes arg:: inside an active local function to argument-index context', () => {
    const text = '{{#func greet user target}}Hello {{arg::0}}{{/func}}{{call::greet::Noel::friend}}';

    expect(contextAtNeedle(text, '{{arg::0')).toEqual(
      expect.objectContaining({
        type: 'argument-indices',
        prefix: '',
      }),
    );
  });

  it('routes #each header iterator position to chat variable-name context', () => {
    const text = '{{#each user}}{{/each}}';

    expect(contextAtNeedle(text, '{{#each user')).toEqual({
      type: 'variable-names',
      prefix: 'user',
      startOffset: '{{#each '.length,
      endOffset: '{{#each user'.length,
      kind: 'chat',
    });
  });

  it('keeps arg:: outside an active local function as final none instead of falling through to generic candidates', () => {
    expect(contextAtNeedle('{{arg::0}}', '{{arg::0')).toEqual({ type: 'none' });
  });

  it.each([
    ['empty calc macro argument', '{{calc::}}', '{{calc::'.length, ''],
    ['partial calc macro argument', '{{calc::$sc}}', '{{calc::$sc'.length, 'sc'],
  ])('keeps calc expression routing before generic macro handling for %s', (_name, text, offset, prefix) => {
    expect(contextAt(text, offset)).toEqual(
      expect.objectContaining({
        type: 'calc-expression',
        prefix,
        referenceKind: prefix === 'sc' ? 'chat' : null,
      }),
    );
  });

  it('routes #when operator segment after token text through the when-operators context', () => {
    const text = '{{#when something::}}ok{{/when}}';

    expect(contextAtNeedle(text, '{{#when something::')).toEqual(
      expect.objectContaining({
        type: 'when-operators',
        prefix: '',
      }),
    );
  });

  it('preserves token-between fallback for #when operator completion after a separator', () => {
    const text = '{{#when::mood:: }}ok{{/when}}';

    expect(contextAtNeedle(text, '{{#when::mood::')).toEqual(
      expect.objectContaining({
        type: 'when-operators',
        prefix: '',
      }),
    );
  });

  it('checks macro argument priority before close-tag fallback on a CloseBrace cursor', () => {
    expect(contextAtNeedle('{{setvar::}}', '{{setvar::')).toEqual(
      expect.objectContaining({
        type: 'variable-names',
        kind: 'chat',
      }),
    );

    expect(contextAtNeedle('{{calc::}}', '{{calc::')).toEqual(
      expect.objectContaining({
        type: 'calc-expression',
        prefix: '',
      }),
    );
  });
});
