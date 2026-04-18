import type { SignatureHelp, SignatureHelpParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry, generateDocumentation } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import {
  SignatureHelpProvider,
  type SignatureHelpDocumentContext,
} from '../../src/features/signature';
import { offsetToPosition } from '../../src/utils/position';
import { getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

interface TestDocument extends SignatureHelpDocumentContext {
  uri: string;
  version: number;
}

function lorebookDocument(bodyLines: readonly string[]): string {
  return ['---', 'name: entry', '---', '@@@ CONTENT', ...bodyLines, ''].join('\n');
}

function createTestDocument(fileName: string, text: string): TestDocument {
  const filePath = `/fixtures/${fileName}`;

  return {
    filePath,
    text,
    uri: `file://${filePath}`,
    version: 1,
  };
}

function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
) {
  let searchFrom = 0;
  let offset = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    offset = text.indexOf(needle, searchFrom);
    if (offset === -1) {
      break;
    }
    searchFrom = offset + needle.length;
  }

  expect(offset).toBeGreaterThanOrEqual(0);
  return offsetToPosition(text, offset + characterOffset);
}

function provideAt(
  provider: SignatureHelpProvider,
  document: TestDocument,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): SignatureHelp | null {
  const params: SignatureHelpParams = {
    textDocument: { uri: document.uri },
    position: positionAt(document.text, needle, characterOffset, occurrence),
  };

  return provider.provide(params, document);
}

function expectSignature(signature: SignatureHelp | null): SignatureHelp {
  expect(signature).not.toBeNull();
  return signature!;
}

function getParameterLabel(signature: SignatureHelp, parameterIndex: number): string {
  const parameter = signature.signatures[0]?.parameters?.[parameterIndex];
  expect(parameter).toBeDefined();

  if (typeof parameter!.label === 'string') {
    return parameter!.label;
  }

  const [start, end] = parameter!.label;
  return signature.signatures[0]!.label.slice(start, end);
}

describe('SignatureHelpProvider', () => {
  it('uses registry metadata for fixed macro signatures from the shared fixture corpus', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const corpusEntry = getFixtureCorpusEntry('lorebook-setvar-macro');
    const document: TestDocument = {
      filePath: corpusEntry.filePath,
      text: corpusEntry.text,
      uri: corpusEntry.uri,
      version: 1,
    };
    const builtin = registry.get('setvar');

    expect(builtin).toBeDefined();

    const variableSignature = expectSignature(provideAt(provider, document, 'mood', 2));
    const valueSignature = expectSignature(provideAt(provider, document, 'happy', 2));

    expect(variableSignature.signatures[0]?.label).toBe(generateDocumentation(builtin!).signature);
    expect(variableSignature.activeParameter).toBe(0);
    expect(valueSignature.activeParameter).toBe(1);
    expect(getParameterLabel(valueSignature, 0)).toBe('variableName');
    expect(getParameterLabel(valueSignature, 1)).toBe('value');
    expect(valueSignature.signatures[0]?.parameters?.[1]?.documentation).toBe(
      builtin!.arguments[1]?.description,
    );
  });

  it('tracks active parameters for nested macro arguments using fragment-local separators', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const document = createTestDocument(
      'signature-nested.risulorebook',
      lorebookDocument(['{{setvar::name::{{replace::Hello::o::0}}}}']),
    );
    const builtin = registry.get('replace');

    expect(builtin).toBeDefined();

    const signature = expectSignature(provideAt(provider, document, '0'));

    expect(signature.signatures[0]?.label).toBe(generateDocumentation(builtin!).signature);
    expect(signature.activeParameter).toBe(2);
    expect(getParameterLabel(signature, 2)).toBe(builtin!.arguments[2]!.name);
    expect(signature.signatures[0]?.parameters?.[2]?.documentation).toBe(
      builtin!.arguments[2]!.description,
    );
  });

  it('keeps variadic block headers pinned to the registry variadic parameter metadata', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const document = createTestDocument(
      'signature-when.risulorebook',
      lorebookDocument(['{{#when::keep::not::A::and::B}}ok{{/}}']),
    );
    const builtin = registry.get('#when');

    expect(builtin).toBeDefined();

    const signature = expectSignature(provideAt(provider, document, 'B'));

    expect(signature.signatures[0]?.label).toBe(generateDocumentation(builtin!).signature);
    expect(signature.activeParameter).toBe(0);
    expect(getParameterLabel(signature, 0)).toBe('...conditionSegments');
    expect(signature.signatures[0]?.parameters?.[0]?.documentation).toBe(
      builtin!.arguments[0]!.description,
    );
  });

  it('handles empty trailing arguments and malformed separators without crashing', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const emptyTrailingDocument = createTestDocument(
      'signature-empty-trailing.risulorebook',
      lorebookDocument(['{{setvar::name::}}']),
    );
    const malformedSeparatorDocument = createTestDocument(
      'signature-malformed-separator.risulorebook',
      lorebookDocument(['{{setvar:name::value}}']),
    );

    const emptyTrailingSignature = expectSignature(
      provideAt(provider, emptyTrailingDocument, '}}'),
    );
    const malformedSeparatorSignature = expectSignature(
      provideAt(provider, malformedSeparatorDocument, 'name', 1, 1),
    );

    expect(emptyTrailingSignature.activeParameter).toBe(1);
    expect(getParameterLabel(emptyTrailingSignature, 1)).toBe('value');
    expect(malformedSeparatorSignature.activeParameter).toBe(0);
  });
});
