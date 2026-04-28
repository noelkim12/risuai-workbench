import { afterEach, describe, expect, it } from 'vitest';
import { DiagnosticSeverity, type Diagnostic } from 'vscode-languageserver/node';
import {
  mapDocumentToCbsFragments,
  createDiagnosticForFragment,
  routeDiagnosticsForDocument,
  shouldKeepLocalSymbolDiagnostic,
  assembleDiagnosticsForRequest,
} from '../src/utils/diagnostics-router';
import { mapFragmentDiagnosticsToHost } from '../src/utils/diagnostics/fragment-diagnostic-policy';
import { DiagnosticCode } from '../src/analyzer/diagnostics';
import type { VariableFlowService } from '../src/services';
import type { CbsFragment } from 'risu-workbench-core';
import { fragmentAnalysisService } from '../src/core';
import {
  createFixtureRequest,
  getFixtureCorpusEntry,
  snapshotHostDiagnosticsEnvelope,
  snapshotHostDiagnostics,
} from './fixtures/fixture-corpus';

afterEach(() => {
  fragmentAnalysisService.clearAll();
});

describe('custom-extension diagnostics', () => {
  describe('mapDocumentToCbsFragments', () => {
    it('maps lorebook CONTENT section to fragments', () => {
      const content = `---
name: test_entry
---
@@@ KEYS
key1
@@@ CONTENT
Hello {{user}}, welcome!
`;
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', content);

      expect(result).not.toBeNull();
      expect(result?.artifact).toBe('lorebook');
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0].section).toBe('CONTENT');
      expect(result?.fragments[0].content).toContain('{{user}}');
    });

    it('maps regex IN and OUT sections to fragments', () => {
      const content = `---
comment: test regex
type: plain
---
@@@ IN
Hello {{user}}
@@@ OUT
Hi there!
`;
      const result = mapDocumentToCbsFragments('/path/to/script.risuregex', content);

      expect(result).not.toBeNull();
      expect(result?.artifact).toBe('regex');
      expect(result?.fragments).toHaveLength(2);

      const inFragment = result?.fragments.find((f) => f.section === 'IN');
      const outFragment = result?.fragments.find((f) => f.section === 'OUT');

      expect(inFragment).toBeDefined();
      expect(inFragment?.content).toContain('{{user}}');
      expect(outFragment).toBeDefined();
      expect(outFragment?.content).toBe('Hi there!');
    });

    it('maps prompt TEXT section to fragments', () => {
      const content = `---
variant: plain
---
@@@ TEXT
System: {{system_prompt}}
User: {{input}}
`;
      const result = mapDocumentToCbsFragments('/path/to/prompt.risuprompt', content);

      expect(result).not.toBeNull();
      expect(result?.artifact).toBe('prompt');
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0].section).toBe('TEXT');
    });

    it('maps html full file to single fragment', () => {
      const content = `<div class="character">
  <h1>{{char}}</h1>
  <p>{{description}}</p>
</div>`;
      const result = mapDocumentToCbsFragments('/path/to/background.risuhtml', content);

      expect(result).not.toBeNull();
      expect(result?.artifact).toBe('html');
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0].section).toBe('full');
      expect(result?.fragments[0].content).toBe(content);
    });

    it('maps lua full file to single fragment', () => {
      const content = `local name = "{{char}}"
local greeting = "Hello, " .. name
return greeting`;
      const result = mapDocumentToCbsFragments('/path/to/script.risulua', content);

      expect(result).not.toBeNull();
      expect(result?.artifact).toBe('lua');
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0].section).toBe('full');
    });

    it('returns null for toggle files (non-CBS)', () => {
      const content = 'toggle_setting = true';
      const result = mapDocumentToCbsFragments('/path/to/toggle.risutoggle', content);

      expect(result).toBeNull();
    });

    it('returns null for variable files (non-CBS)', () => {
      const content = 'key1=value1\nkey2=value2';
      const result = mapDocumentToCbsFragments('/path/to/vars.risuvar', content);

      expect(result).toBeNull();
    });

    it('returns null for unknown extensions', () => {
      const result = mapDocumentToCbsFragments('/path/to/file.txt', 'content');
      expect(result).toBeNull();
    });

    it('handles empty content gracefully', () => {
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', '');
      expect(result).not.toBeNull();
      expect(result?.fragments).toHaveLength(0);
    });

    it('handles lorebook without CONTENT section', () => {
      const content = `---
name: test_entry
---
@@@ KEYS
key1
`;
      const result = mapDocumentToCbsFragments('/path/to/entry.risulorebook', content);

      expect(result).not.toBeNull();
      expect(result?.fragments).toHaveLength(0);
    });

    it('handles regex with only IN section', () => {
      const content = `---
comment: test
type: plain
---
@@@ IN
Hello {{user}}
`;
      const result = mapDocumentToCbsFragments('/path/to/script.risuregex', content);

      expect(result).not.toBeNull();
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0].section).toBe('IN');
    });

    it('recovers valid regex OUT section after malformed IN header', () => {
      const entry = getFixtureCorpusEntry('regex-recover-out-with-malformed-in-header');
      const result = mapDocumentToCbsFragments(entry.filePath, entry.text);

      expect(result).not.toBeNull();
      expect(result?.fragments).toHaveLength(1);
      expect(result?.fragments[0]).toMatchObject({
        section: 'OUT',
        content: '{{user',
      });
    });
  });

  describe('createDiagnosticForFragment', () => {
    it('creates diagnostic with correct range', () => {
      // Document: line 0-3 are headers, line 4 is the actual content
      const documentContent = '---\nname: test\n---\n@@@ CONTENT\nHello {{user}}';
      // Fragment starts at position 31 (after "---\nname: test\n---\n@@@ CONTENT\n")
      const fragment: CbsFragment = {
        section: 'CONTENT',
        start: 31,
        end: 45,
        content: 'Hello {{user}}',
      };

      const diagnostic = createDiagnosticForFragment(
        documentContent,
        fragment,
        'Test message',
        'error',
        'CBS001',
        6, // offset within fragment content - points to "{{user}}"
        14, // end offset within fragment content
      );

      expect(diagnostic.message).toBe('Test message');
      expect(diagnostic.code).toBe('CBS001');
      expect(diagnostic.range.start.line).toBe(4); // Line 4 in document (0-indexed)
      expect(diagnostic.range.start.character).toBe(6); // "{{user}}" starts at char 6 in line
      expect(diagnostic.range.end.line).toBe(4);
      expect(diagnostic.range.end.character).toBe(14);
    });

    it('defaults to error severity', () => {
      const documentContent = 'test content';
      const fragment: CbsFragment = {
        section: 'CONTENT',
        start: 0,
        end: 12,
        content: 'test content',
      };

      const diagnostic = createDiagnosticForFragment(
        documentContent,
        fragment,
        'Warning message',
        undefined,
        'CBS100',
      );

      expect(diagnostic.severity).toBe(1); // DiagnosticSeverity.Error = 1
    });
  });

  describe('routeDiagnosticsForDocument', () => {
    it('routes structural diagnostics with canonical taxonomy codes', () => {
      const unclosedMacroContent = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
Hello {{user
`;
      const unclosedBlockContent = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
{{#when::true}}Hello
`;

      const unclosedMacroDiagnostics = routeDiagnosticsForDocument(
        '/path/to/entry.risulorebook',
        unclosedMacroContent,
        {},
      );
      const unclosedBlockDiagnostics = routeDiagnosticsForDocument(
        '/path/to/entry.risulorebook',
        unclosedBlockContent,
        {},
      );

      expect(unclosedMacroDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.UnclosedMacro,
      );
      expect(unclosedBlockDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.UnclosedBlock,
      );
    });

    it('routes parser and analyzer diagnostics without inventing router-only meanings', () => {
      const content = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
{{unknown_function::arg}}
`;
      const diagnostics = routeDiagnosticsForDocument('/path/to/entry.risulorebook', content, {
        checkUnknownFunctions: true,
      });

      expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.UnknownFunction,
      );
    });

    it('maps fragment-local related information into LSP relatedInformation payloads', () => {
      const content = `---
name: test
---
@@@ CONTENT
{{setvar::mood::1}}{{setvar::mood::2}}
`;
      const diagnostics = routeDiagnosticsForDocument('/path/to/entry.risulorebook', content, {});
      const diagnostic = diagnostics.find(
        (candidate) => candidate.code === DiagnosticCode.UnusedVariable,
      );

      expect(diagnostic?.relatedInformation).toEqual([
        {
          message: 'Additional unused definition #2 for "mood" appears here.',
          location: {
            uri: '/path/to/entry.risulorebook',
            range: {
              start: { line: 4, character: 29 },
              end: { line: 4, character: 33 },
            },
          },
        },
      ]);
    });

    it('routes semantic warning diagnostics for deprecated blocks and legacy angle macros', () => {
      const deprecatedBlockContent = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
{{#if true}}fallback{{/if}}
`;
      const legacyAngleContent = `---
name: test
---
@@@ KEYS
key
@@@ CONTENT
Hello <user>
`;

      const deprecatedDiagnostics = routeDiagnosticsForDocument(
        '/path/to/entry.risulorebook',
        deprecatedBlockContent,
        {},
      );
      const legacyAngleDiagnostics = routeDiagnosticsForDocument(
        '/path/to/entry.risulorebook',
        legacyAngleContent,
        {},
      );

      expect(deprecatedDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.DeprecatedFunction,
      );
      expect(legacyAngleDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.LegacyAngleBracket,
      );
      expect(
        deprecatedDiagnostics.find((diagnostic) => diagnostic.code === DiagnosticCode.DeprecatedFunction)
          ?.data,
      ).toEqual({
        rule: {
          category: 'compatibility',
          code: DiagnosticCode.DeprecatedFunction,
          explanation: {
            reason: 'diagnostic-taxonomy',
            source: 'diagnostic-taxonomy:analyzer:compatibility',
            detail:
              'Diagnostic taxonomy metadata from the analyzer stage for the compatibility rule category.',
          },
          owner: 'analyzer',
          severity: 'warning',
          meaning: 'Deprecated CBS function or block',
        },
        fixes: [
          {
            title: 'Replace with "#when"',
            editKind: 'replace',
            explanation: {
              reason: 'diagnostic-taxonomy',
              source: 'registry-deprecated:#if:#when',
              detail: 'Registry deprecation metadata marks #if as replaceable with #when.',
            },
            replacement: '#when',
          },
        ],
      });
      expect(
        legacyAngleDiagnostics.find((diagnostic) => diagnostic.code === DiagnosticCode.LegacyAngleBracket)
          ?.data,
      ).toEqual({
        rule: {
          category: 'compatibility',
          code: DiagnosticCode.LegacyAngleBracket,
          explanation: {
            reason: 'diagnostic-taxonomy',
            source: 'diagnostic-taxonomy:analyzer:compatibility',
            detail:
              'Diagnostic taxonomy metadata from the analyzer stage for the compatibility rule category.',
          },
          owner: 'analyzer',
          severity: 'warning',
          meaning: 'Legacy angle-bracket macro syntax',
        },
        fixes: [
          {
            title: 'Migrate to {{user}}',
            editKind: 'replace',
            explanation: {
              reason: 'diagnostic-taxonomy',
              source: 'syntax-migration:angle-bracket:{{user}}',
              detail:
                'Legacy angle-bracket syntax can be migrated directly to the equivalent double-brace CBS macro.',
            },
            replacement: '{{user}}',
          },
        ],
      });
    });

    it('keeps routing diagnostics for recovered regex fragments after malformed section headers', () => {
      const entry = getFixtureCorpusEntry('regex-recover-out-with-malformed-in-header');
      const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text, {});

      expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        DiagnosticCode.UnclosedMacro,
      );
    });

    it('returns empty array for toggle files', () => {
      const diagnostics = routeDiagnosticsForDocument(
        '/path/to/toggle.risutoggle',
        'toggle = true',
        {},
      );

      expect(diagnostics).toEqual([]);
    });

    it('returns empty array for variable files', () => {
      const diagnostics = routeDiagnosticsForDocument('/path/to/vars.risuvar', 'key=value', {});

      expect(diagnostics).toEqual([]);
    });

    it('returns empty array for unknown extensions', () => {
      const diagnostics = routeDiagnosticsForDocument('/path/to/file.txt', 'content', {});

      expect(diagnostics).toEqual([]);
    });

    it.each([
      ['lorebook-wrong-argument-count', [DiagnosticCode.WrongArgumentCount]],
      ['regex-missing-required-argument', [DiagnosticCode.MissingRequiredArgument]],
      ['regex-deprecated-block', [DiagnosticCode.DeprecatedFunction]],
      ['prompt-unknown-function', [DiagnosticCode.UnknownFunction]],
      ['prompt-invalid-when-operator', [DiagnosticCode.UnknownFunction]],
      ['prompt-empty-block', [DiagnosticCode.EmptyBlock]],
      ['prompt-legacy-angle', [DiagnosticCode.LegacyAngleBracket]],
    ] as const)('routes adapter-backed diagnostics for fixture %s', (fixtureId, expectedCodes) => {
      const entry = getFixtureCorpusEntry(fixtureId);
      const analysis = fragmentAnalysisService.analyzeDocument(createFixtureRequest(entry, 9));
      const routedDiagnostics = routeDiagnosticsForDocument(
        entry.filePath,
        entry.text,
        {},
        { uri: entry.uri, version: 9 },
      );

      expect(analysis).not.toBeNull();
      expect(routedDiagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        analysis?.fragmentAnalyses.flatMap((fragmentAnalysis) =>
          fragmentAnalysis.diagnostics.map((diagnostic) => diagnostic.code),
        ),
      );

      for (const code of expectedCodes) {
        expect(routedDiagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
      }
    });

    it('builds a deterministic normalized snapshot view for host diagnostics payloads', () => {
      const entry = getFixtureCorpusEntry('lorebook-wrong-argument-count');
      const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text, {});

      const forward = snapshotHostDiagnostics(diagnostics);
      const reversed = snapshotHostDiagnostics([...diagnostics].reverse());

      expect(reversed).toEqual(forward);
      expect(forward).toContainEqual(
        expect.objectContaining({
          code: DiagnosticCode.WrongArgumentCount,
          data: {
            rule: expect.objectContaining({
              category: 'symbol',
              code: DiagnosticCode.WrongArgumentCount,
              explanation: {
                reason: 'diagnostic-taxonomy',
                source: 'diagnostic-taxonomy:analyzer:symbol',
                detail:
                  'Diagnostic taxonomy metadata from the analyzer stage for the symbol rule category.',
              },
            }),
            fixes: undefined,
          },
          message: expect.stringContaining('expects 1 argument, but received 2'),
          source: 'risu-cbs',
        }),
      );
    });

    it('exposes the shared runtime availability contract in the normalized host diagnostics envelope', () => {
      const entry = getFixtureCorpusEntry('lorebook-wrong-argument-count');
      const diagnostics = routeDiagnosticsForDocument(entry.filePath, entry.text, {});
      const envelope = snapshotHostDiagnosticsEnvelope(diagnostics);

      expect(envelope.diagnostics).toEqual(snapshotHostDiagnostics(diagnostics));
      expect(envelope.availability).toEqual({
        schema: 'cbs-lsp-agent-contract',
        schemaVersion: '1.0.0',
        artifacts: [
          {
            key: 'risutoggle',
            scope: 'workspace-disabled',
            source: 'document-router:risutoggle',
            detail:
              '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
          },
          {
            key: 'risuvar',
            scope: 'workspace-disabled',
            source: 'document-router:risuvar',
            detail:
              '`.risuvar` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
          },
        ],
        companions: [
          {
            key: 'luals',
            status: 'unavailable',
            health: 'unavailable',
            transport: 'stdio',
            executablePath: null,
            pid: null,
            detail:
              'LuaLS sidecar is not running yet. Mirrored `.risulua` hover/completion stay unavailable until the companion becomes ready, while CBS fragment features keep running normally.',
          },
        ],
        features: expect.arrayContaining([
          {
            key: 'completion',
            scope: 'local-only',
            source: 'server-capability:completion',
            detail:
              'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
          },
          {
            key: 'definition',
            scope: 'local-first',
            source: 'server-capability:definition',
            detail:
              'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers/readers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
          },
        ]),
        operator: expect.objectContaining({
          docs: {
            agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md',
            compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
            lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md',
            readme: 'packages/cbs-lsp/README.md',
            standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md',
            troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md',
            vscodeClient: 'packages/vscode/README.md',
          },
          workspace: expect.objectContaining({
            resolvedWorkspaceRoot: null,
            resolvedWorkspaceRootSource: 'none',
          }),
        }),
      });
    });
  });

  describe('fragment diagnostic policy', () => {
    it('preserves minimal and optional LSP diagnostic metadata while remapping ranges', () => {
      const content = ['---', 'name: policy', '---', '@@@ CONTENT', 'Hello {{user}}', ''].join('\n');
      const analysis = fragmentAnalysisService.analyzeDocument({
        uri: 'file:///policy.risulorebook',
        version: 1,
        filePath: '/policy.risulorebook',
        text: content,
      });

      expect(analysis?.fragmentAnalyses[0]).toBeDefined();

      const fragmentAnalysis = analysis!.fragmentAnalyses[0]!;
      const diagnostics = mapFragmentDiagnosticsToHost(content, 'file:///policy.risulorebook', {
        ...fragmentAnalysis,
        diagnostics: [
          {
            message: 'Minimal diagnostic',
            severity: 'warning',
            code: DiagnosticCode.UnknownFunction,
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 14 },
            },
          },
          {
            data: { fixes: [{ title: 'Keep metadata' }] },
            message: 'Full diagnostic',
            severity: 'error',
            code: DiagnosticCode.UnclosedMacro,
            range: {
              start: { line: 0, character: 6 },
              end: { line: 0, character: 14 },
            },
            relatedInformation: [
              {
                message: 'Related point',
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 5 },
                },
              },
            ],
          },
        ],
      });

      expect(diagnostics).toEqual([
        expect.objectContaining({
          code: DiagnosticCode.UnknownFunction,
          data: undefined,
          message: 'Minimal diagnostic',
          range: {
            start: { line: 4, character: 6 },
            end: { line: 4, character: 14 },
          },
          relatedInformation: undefined,
          severity: DiagnosticSeverity.Warning,
          source: 'risu-cbs',
        }),
        expect.objectContaining({
          code: DiagnosticCode.UnclosedMacro,
          data: { fixes: [{ title: 'Keep metadata' }] },
          message: 'Full diagnostic',
          range: {
            start: { line: 4, character: 6 },
            end: { line: 4, character: 14 },
          },
          relatedInformation: [
            {
              message: 'Related point',
              location: {
                uri: 'file:///policy.risulorebook',
                range: {
                  start: { line: 4, character: 0 },
                  end: { line: 4, character: 5 },
                },
              },
            },
          ],
          severity: DiagnosticSeverity.Error,
          source: 'risu-cbs',
        }),
      ]);
    });
  });

  describe('shouldKeepLocalSymbolDiagnostic', () => {
    it('keeps non-symbol diagnostics unchanged', () => {
      const diagnostic: Diagnostic = {
        code: DiagnosticCode.UnknownFunction,
        message: 'Unknown function',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        severity: DiagnosticSeverity.Error,
        source: 'risu-cbs',
      };
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{unknown}}',
      };
      const mockVariableFlowService = {
        queryAt: () => null,
      } as unknown as VariableFlowService;

      expect(shouldKeepLocalSymbolDiagnostic(diagnostic, request, mockVariableFlowService)).toBe(true);
    });

    it('keeps CBS101 (UndefinedVariable) when no workspace writers exist', () => {
      const diagnostic: Diagnostic = {
        code: DiagnosticCode.UndefinedVariable,
        message: 'Variable "x" is not defined',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 11 } },
        severity: DiagnosticSeverity.Error,
        source: 'risu-cbs',
      };
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{getvar::x}}',
      };
      const mockVariableFlowService = {
        queryAt: () => ({ writers: [], defaultValue: null }),
      } as unknown as VariableFlowService;

      expect(shouldKeepLocalSymbolDiagnostic(diagnostic, request, mockVariableFlowService)).toBe(true);
    });

    it('suppresses CBS101 (UndefinedVariable) when workspace writers exist', () => {
      const diagnostic: Diagnostic = {
        code: DiagnosticCode.UndefinedVariable,
        message: 'Variable "x" is not defined',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 11 } },
        severity: DiagnosticSeverity.Error,
        source: 'risu-cbs',
      };
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{getvar::x}}',
      };
      const mockVariableFlowService = {
        queryAt: () => ({ writers: [{ uri: 'file:///other.risulorebook' }], defaultValue: null }),
      } as unknown as VariableFlowService;

      expect(shouldKeepLocalSymbolDiagnostic(diagnostic, request, mockVariableFlowService)).toBe(false);
    });

    it('keeps CBS102 (UnusedVariable) when no workspace readers exist', () => {
      const diagnostic: Diagnostic = {
        code: DiagnosticCode.UnusedVariable,
        message: 'Variable "x" is unused',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 11 } },
        severity: DiagnosticSeverity.Warning,
        source: 'risu-cbs',
      };
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{setvar::x::1}}',
      };
      const mockVariableFlowService = {
        queryAt: () => ({ readers: [] }),
      } as unknown as VariableFlowService;

      expect(shouldKeepLocalSymbolDiagnostic(diagnostic, request, mockVariableFlowService)).toBe(true);
    });

    it('suppresses CBS102 (UnusedVariable) when workspace readers exist', () => {
      const diagnostic: Diagnostic = {
        code: DiagnosticCode.UnusedVariable,
        message: 'Variable "x" is unused',
        range: { start: { line: 0, character: 2 }, end: { line: 0, character: 11 } },
        severity: DiagnosticSeverity.Warning,
        source: 'risu-cbs',
      };
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{setvar::x::1}}',
      };
      const mockVariableFlowService = {
        queryAt: () => ({ readers: [{ uri: 'file:///other.risulorebook' }] }),
      } as unknown as VariableFlowService;

      expect(shouldKeepLocalSymbolDiagnostic(diagnostic, request, mockVariableFlowService)).toBe(false);
    });
  });

  describe('assembleDiagnosticsForRequest', () => {
    it('returns local diagnostics unchanged when no workspace service provided', () => {
      const localDiagnostics: Diagnostic[] = [
        {
          code: DiagnosticCode.UnknownFunction,
          message: 'Unknown function',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
          severity: DiagnosticSeverity.Error,
          source: 'risu-cbs',
        },
      ];
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{unknown}}',
      };

      const result = assembleDiagnosticsForRequest({
        localDiagnostics,
        workspaceVariableFlowService: null,
        request,
      });

      expect(result).toEqual(localDiagnostics);
    });

    it('filters local diagnostics and merges workspace diagnostics', () => {
      const localDiagnostics: Diagnostic[] = [
        {
          code: DiagnosticCode.UndefinedVariable,
          message: 'Variable "x" is not defined',
          range: { start: { line: 0, character: 2 }, end: { line: 0, character: 11 } },
          severity: DiagnosticSeverity.Error,
          source: 'risu-cbs',
        },
        {
          code: DiagnosticCode.UnknownFunction,
          message: 'Unknown function',
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
          severity: DiagnosticSeverity.Error,
          source: 'risu-cbs',
        },
      ];
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{getvar::x}}\n{{unknown}}',
      };

      // Mock VariableFlowService that suppresses the UndefinedVariable diagnostic
      const mockVariableFlowService = {
        queryAt: () => ({ writers: [{ uri: 'file:///other.risulorebook' }], defaultValue: null }),
        getGraph: () => ({ getOccurrencesByUri: () => [] }),
        getIssues: () => [],
      } as unknown as VariableFlowService;

      const result = assembleDiagnosticsForRequest({
        localDiagnostics,
        workspaceVariableFlowService: mockVariableFlowService,
        request,
      });

      // Should only contain the UnknownFunction diagnostic (UndefinedVariable is suppressed)
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe(DiagnosticCode.UnknownFunction);
    });

    it('produces deterministically sorted diagnostics', () => {
      const localDiagnostics: Diagnostic[] = [
        {
          code: DiagnosticCode.UnusedVariable,
          message: 'Unused var',
          range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
          severity: DiagnosticSeverity.Warning,
          source: 'risu-cbs',
        },
        {
          code: DiagnosticCode.UnknownFunction,
          message: 'Unknown function',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
          severity: DiagnosticSeverity.Error,
          source: 'risu-cbs',
        },
      ];
      const request = {
        uri: 'file:///test.risulorebook',
        version: 1,
        filePath: '/test.risulorebook',
        text: '{{unknown}}\n{{setvar::a::1}}',
      };

      const result = assembleDiagnosticsForRequest({
        localDiagnostics,
        workspaceVariableFlowService: null,
        request,
      });

      // Should be sorted by range (line 0 before line 1)
      expect(result[0].code).toBe(DiagnosticCode.UnknownFunction);
      expect(result[1].code).toBe(DiagnosticCode.UnusedVariable);
    });
  });
});
