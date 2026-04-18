import type { DocumentFormattingParams } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { FormattingProvider } from '../../src/features/formatting';
import { createFixtureRequest, getFixtureCorpusEntry, listFixtureCorpusEntries } from '../fixtures/fixture-corpus';

function createParams(request: ReturnType<typeof createFixtureRequest>): DocumentFormattingParams {
  return {
    textDocument: { uri: request.uri },
    options: {
      tabSize: 2,
      insertSpaces: true,
    },
  };
}

describe('FormattingProvider - Phase 4~5 Deferral Contract', () => {
  describe('contract: returns empty array (no-op) for all artifacts', () => {
    it('returns [] for lorebook artifacts', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for regex artifacts', () => {
      const entry = getFixtureCorpusEntry('regex-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for prompt artifacts', () => {
      const entry = getFixtureCorpusEntry('prompt-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for html artifacts', () => {
      const entry = getFixtureCorpusEntry('html-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for lua artifacts', () => {
      const entry = getFixtureCorpusEntry('lua-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });
  });

  describe('regression: no formatting edits for host-risky artifacts', () => {
    it('returns [] for .risuhtml (HTML with CBS fragments)', () => {
      const entry = getFixtureCorpusEntry('html-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
      // Verify this is a host-risky artifact (HTML with embedded CBS)
      expect(entry.artifact).toBe('html');
      expect(entry.cbsBearing).toBe(true);
    });

    it('returns [] for .risulua (Lua with CBS fragments)', () => {
      const entry = getFixtureCorpusEntry('lua-basic');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
      // Verify this is a host-risky artifact (Lua with embedded CBS)
      expect(entry.artifact).toBe('lua');
      expect(entry.cbsBearing).toBe(true);
    });

    it('returns [] for malformed lorebook (unclosed macro)', () => {
      const entry = getFixtureCorpusEntry('lorebook-unclosed-macro');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for malformed html (unclosed macro)', () => {
      const entry = getFixtureCorpusEntry('html-unclosed-macro');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for malformed lua (unclosed macro)', () => {
      const entry = getFixtureCorpusEntry('lua-unclosed-macro');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });
  });

  describe('regression: no formatting edits for edge cases', () => {
    it('returns [] for empty lorebook document', () => {
      const entry = getFixtureCorpusEntry('lorebook-empty-document');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for lorebook without CONTENT section', () => {
      const entry = getFixtureCorpusEntry('lorebook-no-content-section');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for excluded toggle artifact', () => {
      const entry = getFixtureCorpusEntry('toggle-excluded');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });

    it('returns [] for excluded variable artifact', () => {
      const entry = getFixtureCorpusEntry('variable-excluded');
      const request = createFixtureRequest(entry);
      const provider = new FormattingProvider();
      const edits = provider.provide(createParams(request));

      expect(edits).toEqual([]);
    });
  });

  describe('contract: all CBS-bearing artifacts in corpus', () => {
    const cbsBearingEntries = listFixtureCorpusEntries().filter((e) => e.cbsBearing);

    it.each(cbsBearingEntries.map((e) => ({ id: e.id, entry: e })))(
      'returns [] for $id (CBS-bearing)',
      ({ entry }) => {
        const request = createFixtureRequest(entry);
        const provider = new FormattingProvider();
        const edits = provider.provide(createParams(request));

        expect(edits).toEqual([]);
      },
    );
  });

  describe('contract: all artifacts in corpus (including non-CBS)', () => {
    const allEntries = listFixtureCorpusEntries();

    it.each(allEntries.map((e) => ({ id: e.id, entry: e })))(
      'returns [] for $id',
      ({ entry }) => {
        const request = createFixtureRequest(entry);
        const provider = new FormattingProvider();
        const edits = provider.provide(createParams(request));

        expect(edits).toEqual([]);
      },
    );
  });
});
