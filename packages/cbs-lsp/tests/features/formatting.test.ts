import type { DocumentFormattingParams, TextEdit } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion } from '../../src/core';
import {
  FORMATTING_PROVIDER_AVAILABILITY,
  FormattingProvider,
} from '../../src/features/formatting';
import { positionToOffset } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

function createParams(request: { uri: string }): DocumentFormattingParams {
  return {
    textDocument: { uri: request.uri },
    options: {
      tabSize: 2,
      insertSpaces: true,
    },
  };
}

function createRequestFromEntry(entryId: Parameters<typeof getFixtureCorpusEntry>[0], text: string) {
  const entry = getFixtureCorpusEntry(entryId);
  return {
    uri: entry.uri,
    version: createSyntheticDocumentVersion(text),
    filePath: entry.filePath,
    text,
  };
}

function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  return [...edits]
    .sort((left, right) => {
      const leftStart = positionToOffset(text, left.range.start);
      const rightStart = positionToOffset(text, right.range.start);
      return rightStart - leftStart;
    })
    .reduce((currentText, edit) => {
      const startOffset = positionToOffset(currentText, edit.range.start);
      const endOffset = positionToOffset(currentText, edit.range.end);
      return `${currentText.slice(0, startOffset)}${edit.newText}${currentText.slice(endOffset)}`;
    }, text);
}

describe('FormattingProvider', () => {
  it('exposes active availability honesty metadata', () => {
    const provider = new FormattingProvider();

    expect(provider.availability).toEqual(FORMATTING_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:formatting',
      detail:
        'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
    });
  });

  it('formats a lorebook CONTENT fragment without touching host frontmatter', () => {
    const text = ['---', 'name: entry', '---', '@@@ CONTENT', 'Hello {{ user }} {{#if true}}yes{{:else}}no{{/}}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'name: entry',
      '---',
      '@@@ CONTENT',
      'Hello {{user}} {{#if::true}}yes{{:else}}no{{/if}}',
      '',
    ].join('\n'));
  });

  it('formats each fragment independently in a multi-fragment regex document', () => {
    const text = [
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{ user }}',
      '@@@ OUT',
      '{{#if ready}}ok{{/}}',
      '',
    ].join('\n');
    const request = createRequestFromEntry('regex-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(2);
    expect(applyTextEdits(request.text, edits)).toBe([
      '---',
      'comment: rule',
      'type: plain',
      '---',
      '@@@ IN',
      '{{user}}',
      '@@@ OUT',
      '{{#if::ready}}ok{{/if}}',
      '',
    ].join('\n'));
  });

  it('rewrites pure blocks structurally but keeps the pure body text untouched', () => {
    const text = ['@@@ CONTENT', '{{#puredisplay}}  {{ user }}', '{{/}}', ''].join('\n');
    const request = createRequestFromEntry('lorebook-basic', text);
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    const edits = provider.provide(createParams(request));

    expect(edits).toHaveLength(1);
    expect(applyTextEdits(request.text, edits)).toBe([
      '@@@ CONTENT',
      '{{#puredisplay}}  {{ user }}',
      '{{/puredisplay}}',
      '',
    ].join('\n'));
  });

  it('returns [] for malformed fragments so formatting stays on the no-op path', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('lorebook-unclosed-macro'));
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });

  it('returns [] for unsupported artifacts with no routed CBS fragment request', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('toggle-excluded'));
    const provider = new FormattingProvider({
      resolveRequest: () => null,
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });

  it('returns [] when the fragment is already in canonical format', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('lorebook-basic'));
    const provider = new FormattingProvider({
      resolveRequest: (uri) => (uri === request.uri ? request : null),
    });

    expect(provider.provide(createParams(request))).toEqual([]);
  });
});
