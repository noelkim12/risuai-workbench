import type { CodeAction, CodeActionParams, Diagnostic, WorkspaceEdit } from 'vscode-languageserver/node';
import { CodeActionKind } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { createSyntheticDocumentVersion } from '../../src/core';
import {
  CODE_ACTION_PROVIDER_AVAILABILITY,
  CodeActionProvider,
} from '../../src/features/codeActions';
import { routeDiagnosticsForDocument } from '../../src/utils/diagnostics-router';
import { DiagnosticCode } from '../../src/analyzer/diagnostics';
import { positionToOffset } from '../../src/utils/position';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotCodeActions,
} from '../fixtures/fixture-corpus';

function promptDocument(text: string): string {
  return ['---', 'type: plain', '---', '@@@ TEXT', text, ''].join('\n');
}

function lorebookDocument(text: string): string {
  return ['---', 'name: entry', '---', '@@@ CONTENT', text, ''].join('\n');
}

function createInlineRequest(filePath: string, text: string, uri: string = `file://${filePath}`) {
  return {
    uri,
    version: createSyntheticDocumentVersion(text),
    filePath,
    text,
  };
}

function createProvider(request: ReturnType<typeof createInlineRequest> | ReturnType<typeof createFixtureRequest>) {
  return new CodeActionProvider({
    resolveRequest: (uri) => (uri === request.uri ? request : null),
  });
}

function createParams(
  request: ReturnType<typeof createInlineRequest> | ReturnType<typeof createFixtureRequest>,
  diagnostics: readonly Diagnostic[],
  range: Diagnostic['range'] = diagnostics[0]!.range,
  only?: readonly string[],
): CodeActionParams {
  return {
    textDocument: { uri: request.uri },
    range,
    context: {
      diagnostics: [...diagnostics],
      only: only ? [...only] : undefined,
    },
  };
}

function applyWorkspaceEdit(text: string, uri: string, edit: WorkspaceEdit | undefined): string {
  const edits = edit?.changes?.[uri] ?? [];
  return [...edits]
    .sort((left, right) => positionToOffset(text, right.range.start) - positionToOffset(text, left.range.start))
    .reduce((currentText, textEdit) => {
      const startOffset = positionToOffset(currentText, textEdit.range.start);
      const endOffset = positionToOffset(currentText, textEdit.range.end);
      return `${currentText.slice(0, startOffset)}${textEdit.newText}${currentText.slice(endOffset)}`;
    }, text);
}

function getDiagnosticByCode(diagnostics: readonly Diagnostic[], code: DiagnosticCode): Diagnostic {
  const diagnostic = diagnostics.find((candidate) => candidate.code === code);
  expect(diagnostic).toBeDefined();
  return diagnostic!;
}

function getActionByTitle(actions: readonly CodeAction[], matcher: string): CodeAction {
  const action = actions.find((candidate) => candidate.title.includes(matcher));
  expect(action).toBeDefined();
  return action!;
}

describe('CodeActionProvider', () => {
  it('exposes active availability honesty metadata', () => {
    const provider = new CodeActionProvider();

    expect(provider.availability).toEqual(CODE_ACTION_PROVIDER_AVAILABILITY);
    expect(provider.availability).toEqual({
      scope: 'local-only',
      source: 'server-capability:codeAction',
      detail:
        'Code actions are active for routed CBS fragments, reuse diagnostics metadata for quick fixes and guidance, and only promote automatic host edits that pass the shared host-fragment safety contract.',
    });
  });

  it('rewrites deprecated block open and explicit close tags together', () => {
    const request = createInlineRequest(
      '/virtual/lorebooks/deprecated.risulorebook',
      lorebookDocument('{{#if true}}fallback{{/if}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]),
    );

    const action = getActionByTitle(actions, 'Replace with "#when"');
    expect(action.kind).toBe(CodeActionKind.QuickFix);
    expect(applyWorkspaceEdit(request.text, request.uri, action.edit)).toBe(
      lorebookDocument('{{#when true}}fallback{{/when}}'),
    );
  });

  it('exposes legacy angle-bracket migration quick fixes', () => {
    const request = createInlineRequest(
      '/virtual/prompt/legacy.risuprompt',
      promptDocument('Legacy <user>'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.LegacyAngleBracket)]),
    );

    const action = getActionByTitle(actions, 'Migrate to {{user}}');
    expect(applyWorkspaceEdit(request.text, request.uri, action.edit)).toBe(
      promptDocument('Legacy {{user}}'),
    );
  });

  it('builds typo-replacement quick fixes from unknown builtin suggestions', () => {
    const request = createInlineRequest(
      '/virtual/prompt/unknown.risuprompt',
      promptDocument('{{use}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.UnknownFunction)]),
    );

    const action = getActionByTitle(actions, 'Replace with "user"');
    expect(applyWorkspaceEdit(request.text, request.uri, action.edit)).toBe(promptDocument('{{user}}'));
  });

  it('offers operator replacement quick fixes for invalid #when headers', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('prompt-invalid-when-operator'));
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.UnknownFunction)]),
    );

    const action = getActionByTitle(actions, 'Replace operator with');
    const updated = applyWorkspaceEdit(request.text, request.uri, action.edit);
    expect(updated).not.toContain('::wat::');
    expect(updated).toContain('{{#when::score::');
  });

  it('inserts a missing close tag for unclosed blocks', () => {
    const request = createInlineRequest(
      '/virtual/lorebooks/unclosed-block.risulorebook',
      lorebookDocument('{{#when::true}}Hello'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.UnclosedBlock)]),
    );

    const action = getActionByTitle(actions, 'Insert missing {{/when}}');
    expect(applyWorkspaceEdit(request.text, request.uri, action.edit)).toBe(
      lorebookDocument('{{#when::true}}Hello{{/when}}'),
    );
  });

  it('returns explanation-only no-op actions for slot misuse diagnostics', () => {
    const request = createInlineRequest(
      '/virtual/prompt/malformed-each-alias.risuprompt',
      promptDocument('{{#each items as}}{{slot::item}}{{/each}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.MissingRequiredArgument)]),
    );

    const action = getActionByTitle(actions, '{{slot::name}} only works');
    expect(action.edit).toEqual({ changes: {} });
  });

  it('returns explanation-only no-op actions for arg misuse diagnostics', () => {
    const request = createInlineRequest(
      '/virtual/prompt/arg-misuse.risuprompt',
      promptDocument('{{arg::2}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.WrongArgumentCount)]),
    );

    const action = getActionByTitle(actions, '{{arg::N}} only works');
    expect(action.edit).toEqual({ changes: {} });
  });

  it('builds a deterministic normalized snapshot view for quick fix payloads', () => {
    const request = createInlineRequest(
      '/virtual/lorebooks/deprecated-snapshot.risulorebook',
      lorebookDocument('{{#if true}}fallback{{/if}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]),
    );

    const forward = snapshotCodeActions(actions);
    const reversed = snapshotCodeActions([...actions].reverse());

    expect(reversed).toEqual(forward);
    expect(forward.find((action) => action.title === 'Replace with "#when"')).toEqual(
      expect.objectContaining({
        edit: {
          changes: {
            [request.uri]: expect.arrayContaining([
              {
                newText: '#when',
                range: {
                  start: { line: 4, character: 2 },
                  end: { line: 4, character: 5 },
                },
              },
              expect.objectContaining({
                newText: '/when',
                range: expect.any(Object),
              }),
            ]),
          },
          documentChangesCount: 0,
        },
        hasEdit: true,
        isNoopGuidance: false,
        isPreferred: true,
        kind: CodeActionKind.QuickFix,
        linkedDiagnostics: [
          expect.objectContaining({
            code: String(DiagnosticCode.DeprecatedFunction),
            message: expect.stringContaining('#if'),
            source: 'risu-cbs',
          }),
        ],
        title: 'Replace with "#when"',
      }),
    );
  });

  it('builds a normalized snapshot view that marks no-op guidance actions explicitly', () => {
    const request = createInlineRequest(
      '/virtual/prompt/arg-guidance-snapshot.risuprompt',
      promptDocument('{{arg::2}}'),
    );
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const actions = provider.provide(
      createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.WrongArgumentCount)]),
    );

    expect(snapshotCodeActions(actions)).toEqual([
      expect.objectContaining({
        edit: {
          changes: null,
          documentChangesCount: 0,
        },
        hasEdit: true,
        isNoopGuidance: true,
        isPreferred: false,
        kind: CodeActionKind.QuickFix,
        linkedDiagnostics: [
          expect.objectContaining({
            code: String(DiagnosticCode.WrongArgumentCount),
            message: expect.stringContaining('CBS argument reference'),
            source: 'risu-cbs',
          }),
        ],
        title: 'Explain: {{arg::N}} only works inside a local {{#func}} body reached by {{call::...}}',
      }),
    ]);
  });

  it('suppresses actions when diagnostics are outside the requested range', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('regex-deprecated-block'));
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
    const outRange = {
      start: { line: 6, character: 0 },
      end: { line: 6, character: 8 },
    };

    expect(
      provider.provide(
        createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)], outRange),
      ),
    ).toEqual([]);
  });

  it('returns [] when the client filters out quick fixes', () => {
    const request = createFixtureRequest(getFixtureCorpusEntry('prompt-legacy-angle'));
    const provider = createProvider(request);
    const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);

    expect(
      provider.provide(
        createParams(
          request,
          [getDiagnosticByCode(diagnostics, DiagnosticCode.LegacyAngleBracket)],
          undefined,
          ['refactor.extract'],
        ),
      ),
    ).toEqual([]);
  });

  describe('lazy-resolve contract', () => {
    it('provideUnresolved omits edit payload', () => {
      const request = createInlineRequest(
        '/virtual/lorebooks/deprecated.risulorebook',
        lorebookDocument('{{#if true}}fallback{{/if}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const params = createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]);
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const snapshots = snapshotCodeActions(unresolved);
      expect(snapshots.every((snapshot) => !snapshot.resolved)).toBe(true);
      for (const action of unresolved) {
        expect(action.title).toBeDefined();
        expect(action.kind).toBeDefined();
        expect(action.data.cbs.diagnosticCode).toBeDefined();
        expect(action.data.cbs.actionType).toBeDefined();
        expect(action.data.cbs.uri).toBe(params.textDocument.uri);
      }
    });

    it('resolve restores edit payload from an unresolved action', () => {
      const request = createInlineRequest(
        '/virtual/lorebooks/deprecated.risulorebook',
        lorebookDocument('{{#if true}}fallback{{/if}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const params = createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]);
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const firstUnresolved = unresolved[0]!;
      const resolved = provider.resolve(firstUnresolved, params);

      expect(resolved).not.toBeNull();
      expect(resolved!.title).toBe(firstUnresolved.title);
      expect(resolved!.edit).toBeDefined();
    });

    it('snapshot marks unresolved actions as resolved: false and resolved as resolved: true', () => {
      const request = createInlineRequest(
        '/virtual/lorebooks/deprecated.risulorebook',
        lorebookDocument('{{#if true}}fallback{{/if}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const params = createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]);
      const unresolved = provider.provideUnresolved(params);
      const resolved = provider.provide(params);

      const unresolvedSnapshot = snapshotCodeActions(unresolved);
      const resolvedSnapshot = snapshotCodeActions(resolved);

      expect(unresolvedSnapshot.length).toBeGreaterThan(0);
      expect(resolvedSnapshot.length).toBeGreaterThan(0);
      expect(unresolvedSnapshot[0]!.resolved).toBe(false);
      expect(resolvedSnapshot[0]!.resolved).toBe(true);
    });

    it('resolve returns null when the unresolved action does not match any current result', () => {
      const request = createInlineRequest(
        '/virtual/lorebooks/deprecated.risulorebook',
        lorebookDocument('{{#if true}}fallback{{/if}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const params = createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]);
      const orphan: import('../../src/features/codeActions').UnresolvedCodeAction = {
        title: 'Nonexistent fake action',
        kind: CodeActionKind.QuickFix,
        diagnostics: params.context.diagnostics,
        isPreferred: false,
        data: {
          cbs: {
            schema: 'cbs-lsp-agent-contract',
            schemaVersion: '1.0.0',
            diagnosticCode: DiagnosticCode.DeprecatedFunction,
            actionType: 'replacement',
            uri: params.textDocument.uri,
          },
        },
      };

      expect(provider.resolve(orphan, params)).toBeNull();
    });

    it('resolve returns null when the unresolved action was produced for a different uri', () => {
      const request = createInlineRequest(
        '/virtual/lorebooks/deprecated.risulorebook',
        lorebookDocument('{{#if true}}fallback{{/if}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const params = createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.DeprecatedFunction)]);
      const unresolved = provider.provideUnresolved(params);

      expect(unresolved.length).toBeGreaterThan(0);
      const mismatchedParams = {
        textDocument: { uri: 'file:///other/document.risulorebook' },
        range: params.range,
        context: params.context,
      };
      expect(provider.resolve(unresolved[0]!, mismatchedParams)).toBeNull();
    });

    it('provideUnresolved preserves guidance actions with noop actionType', () => {
      const request = createInlineRequest(
        '/virtual/prompt/arg-misuse.risuprompt',
        promptDocument('{{arg::2}}'),
      );
      const provider = createProvider(request);
      const diagnostics = routeDiagnosticsForDocument(request.filePath, request.text, {}, request);
      const unresolved = provider.provideUnresolved(
        createParams(request, [getDiagnosticByCode(diagnostics, DiagnosticCode.WrongArgumentCount)]),
      );

      const guidance = unresolved.find((action) => action.title.includes('{{arg::N}}'));
      expect(guidance).toBeDefined();
      expect(guidance!.data.cbs.actionType).toBe('guidance');
    });
  });
});
