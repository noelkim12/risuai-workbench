import type { SignatureHelp, SignatureHelpParams } from 'vscode-languageserver/node';
import { CBSBuiltinRegistry, generateDocumentation } from 'risu-workbench-core';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import {
  SignatureHelpProvider,
  type SignatureHelpDocumentContext,
} from '../../src/features/presentation';
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

  it('tracks local #func parameter slots for call:: signature help', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const document = createTestDocument(
      'signature-local-call.risulorebook',
      lorebookDocument([
        '{{#func greet user target}}Hello {{arg::1}}{{/func}}{{call::greet::Noel::friend}}',
      ]),
    );

    const signature = expectSignature(provideAt(provider, document, 'friend', 2));

    expect(signature.signatures[0]?.label).toBe('call::greet::user::target');
    expect(signature.signatures[0]?.documentation).toContain(
      'Local function call for fragment-local `#func greet` declared at line',
    );
    expect(signature.activeParameter).toBe(2);
    expect(getParameterLabel(signature, 2)).toBe('target');
    expect(signature.signatures[0]?.parameters?.[0]?.documentation).toContain(
      'Local function name slot. Resolves to fragment-local `#func greet` declared at line',
    );
    expect(signature.signatures[0]?.parameters?.[1]?.documentation).toContain(
      '`arg::0` is the function name and `arg::1` maps to `user`',
    );
    expect(signature.signatures[0]?.parameters?.[2]?.documentation).toContain(
      'feeds local parameter `target` as runtime `arg::2`',
    );
  });

  it('describes #each block headers with separate iterator and alias slots', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const document = createTestDocument(
      'signature-each-header.risulorebook',
      lorebookDocument(['{{#each items as item}}{{slot::item}}{{/each}}']),
    );

    const iteratorSignature = expectSignature(provideAt(provider, document, 'items', 2));
    const aliasSignature = expectSignature(provideAt(provider, document, 'item', 2, 1));

    expect(iteratorSignature.signatures[0]?.label).toBe('#each iteratorExpression as alias');
    expect(iteratorSignature.activeParameter).toBe(0);
    expect(getParameterLabel(iteratorSignature, 0)).toBe('iteratorExpression');
    expect(iteratorSignature.signatures[0]?.parameters?.[0]?.documentation).toContain(
      'List or array expression consumed by the current `#each` block',
    );

    expect(aliasSignature.activeParameter).toBe(1);
    expect(getParameterLabel(aliasSignature, 1)).toBe('alias');
    expect(aliasSignature.signatures[0]?.documentation).toContain(
      '`slot::alias` inside the block body',
    );
    expect(aliasSignature.signatures[0]?.parameters?.[1]?.documentation).toContain(
      'Loop binding name introduced by `as`',
    );
  });

  it('describes #func block headers with function-name and parameter-slot semantics', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const document = createTestDocument(
      'signature-func-header.risulorebook',
      lorebookDocument(['{{#func greet user target}}Hello{{/func}}{{call::greet::Noel::friend}}']),
    );

    const functionNameSignature = expectSignature(provideAt(provider, document, 'greet', 2));
    const parameterSignature = expectSignature(provideAt(provider, document, 'target', 2));

    expect(functionNameSignature.signatures[0]?.label).toBe('#func functionName ...parameters');
    expect(functionNameSignature.activeParameter).toBe(0);
    expect(getParameterLabel(functionNameSignature, 0)).toBe('functionName');
    expect(functionNameSignature.signatures[0]?.parameters?.[0]?.documentation).toContain(
      '`{{call::functionName::...}}` resolves this slot',
    );

    expect(parameterSignature.activeParameter).toBe(1);
    expect(getParameterLabel(parameterSignature, 1)).toBe('...parameters');
    expect(parameterSignature.signatures[0]?.documentation).toContain(
      '`arg::0` → function name, `arg::1` → `user`, `arg::2` → `target`',
    );
    expect(parameterSignature.signatures[0]?.parameters?.[1]?.documentation).toContain(
      'Space-separated local parameter names',
    );
  });

  it('uses the same calc expression sublanguage signature wording for inline and macro forms', () => {
    const registry = new CBSBuiltinRegistry();
    const provider = new SignatureHelpProvider(registry, new FragmentAnalysisService());
    const corpusEntry = getFixtureCorpusEntry('lorebook-calc-expression-context');
    const document: TestDocument = {
      filePath: corpusEntry.filePath,
      text: corpusEntry.text,
      uri: corpusEntry.uri,
      version: 1,
    };

    const inlineSignature = expectSignature(provideAt(provider, document, '+', 0, 0));
    const macroSignature = expectSignature(provideAt(provider, document, '+', 0, 1));

    expect(inlineSignature).toEqual(macroSignature);
    expect(inlineSignature.signatures[0]?.label).toBe('{{? expression}} / {{calc::expression}}');
    expect(inlineSignature.activeParameter).toBe(0);
    expect(getParameterLabel(inlineSignature, 0)).toBe('expression');
    expect(inlineSignature.signatures[0]?.documentation).toContain(
      'This is not regular CBS argument syntax.',
    );
    expect(inlineSignature.signatures[0]?.documentation).toContain(
      'both use the same `CBS expression sublanguage`',
    );
    expect(inlineSignature.signatures[0]?.parameters?.[0]?.documentation).toContain(
      'Variables: `$name` for chat variables, `@name` for global variables',
    );
  });
});
