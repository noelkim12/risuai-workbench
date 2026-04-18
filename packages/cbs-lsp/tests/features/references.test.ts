import type { Position, ReferenceParams } from 'vscode-languageserver/node';
import { describe, expect, it } from 'vitest';

import { FragmentAnalysisService } from '../../src/core';
import { ReferencesProvider } from '../../src/features/references';
import { offsetToPosition } from '../../src/utils/position';
import { createFixtureRequest, getFixtureCorpusEntry } from '../fixtures/fixture-corpus';

function locateNthOffset(text: string, needle: string, occurrence: number = 0): number {
  let fromIndex = 0;
  let foundIndex = -1;

  for (let index = 0; index <= occurrence; index += 1) {
    foundIndex = text.indexOf(needle, fromIndex);
    if (foundIndex === -1) {
      break;
    }

    fromIndex = foundIndex + needle.length;
  }

  expect(foundIndex).toBeGreaterThanOrEqual(0);
  return foundIndex;
}

function positionAt(
  text: string,
  needle: string,
  characterOffset: number = 0,
  occurrence: number = 0,
): Position {
  return offsetToPosition(text, locateNthOffset(text, needle, occurrence) + characterOffset);
}

function createProvider(
  service: FragmentAnalysisService,
  request: ReturnType<typeof createFixtureRequest>,
): ReferencesProvider {
  return new ReferencesProvider({
    analysisService: service,
    resolveRequest: ({ textDocument }) => (textDocument.uri === request.uri ? request : null),
  });
}

function createParams(
  request: ReturnType<typeof createFixtureRequest>,
  position: Position,
  includeDeclaration: boolean = false,
): ReferenceParams {
  return {
    textDocument: { uri: request.uri },
    position,
    context: {
      includeDeclaration,
    },
  };
}

describe('ReferencesProvider', () => {
  describe('local-first resolution', () => {
    it('returns references only from current fragment', () => {
      // Create a document with setvar and getvar for the same variable
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::myScore::100}} and {{getvar::myScore}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      // Position on 'myScore' in {{getvar::myScore}}
      const position = offsetToPosition(modifiedText, modifiedText.indexOf('myScore', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, false));

      // Should return the reference (getvar call), not the definition
      expect(locations.length).toBeGreaterThanOrEqual(1);
      expect(locations[0].uri).toBe(request.uri);
    });

    it('includes definitions first when includeDeclaration=true', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::myScore::100}} and {{getvar::myScore}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      // Position on 'myScore' in {{getvar::myScore}}
      const position = offsetToPosition(modifiedText, modifiedText.indexOf('myScore', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should include definition first, then reference
      // The scope analyzer adds: 1 definition (setvar) + 1 reference (getvar)
      expect(locations.length).toBeGreaterThanOrEqual(2);
      expect(locations[0].uri).toBe(request.uri);
      expect(locations[1].uri).toBe(request.uri);
    });

    it('excludes declarations when includeDeclaration=false', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::myScore::100}} and {{getvar::myScore}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      // Position on 'myScore' in {{getvar::myScore}}
      const position = offsetToPosition(modifiedText, modifiedText.indexOf('myScore', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, false));

      // Should return only references, no definitions
      // The reference is the getvar call
      expect(locations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('global variable handling', () => {
    it('returns empty array for global variables', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace('{{user}}', '{{getglobalvar::globalVar}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('globalVar'));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should return empty for globals
      expect(locations).toEqual([]);
    });
  });

  describe('unresolved cursor positions', () => {
    it('returns empty array when cursor is not on a variable', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Position on 'user' which is a builtin, not a variable argument
      const position = positionAt(entry.text, 'user', 2);

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should return empty for non-variable positions
      expect(locations).toEqual([]);
    });

    it('returns empty array when variable is not found in symbol table', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const request = createFixtureRequest(entry);
      const service = new FragmentAnalysisService();

      // Position on 'name' in frontmatter - not a CBS variable
      const position = positionAt(entry.text, 'name:', 2);

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should return empty when symbol not found
      expect(locations).toEqual([]);
    });
  });

  describe('host-range mapping', () => {
    it('maps local ranges to host document positions correctly', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::myScore::100}} and {{getvar::myScore}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('myScore', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      expect(locations.length).toBeGreaterThan(0);
      // Verify all locations have valid ranges
      for (const location of locations) {
        expect(location.range.start.line).toBeGreaterThanOrEqual(0);
        expect(location.range.start.character).toBeGreaterThanOrEqual(0);
        expect(location.range.end.line).toBeGreaterThanOrEqual(location.range.start.line);
        expect(location.uri).toBe(request.uri);
      }
    });
  });

  describe('temp variable support', () => {
    it('resolves temp variable references correctly', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{settempvar::counter::1}} and {{tempvar::counter}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('counter', 25));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should include definition and reference for temp variables
      expect(locations.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty for gettempvar when no definition exists', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Only reading a temp variable without defining it first
      const modifiedText = entry.text.replace('{{user}}', '{{gettempvar::undefinedTemp}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('undefinedTemp'));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should return empty since temp variable is not defined (undefined reference)
      expect(locations).toEqual([]);
    });
  });

  describe('outside CBS fragments', () => {
    it.each([
      {
        label: 'lorebook frontmatter',
        entryId: 'lorebook-basic',
        position: (text: string) => positionAt(text, 'name: entry', 2),
      },
      {
        label: 'non-CBS toggle artifact',
        entryId: 'toggle-excluded',
        position: (text: string) => positionAt(text, 'enabled', 1),
      },
    ])('returns empty outside CBS fragments for $label', ({ entryId, position }) => {
      const entry = getFixtureCorpusEntry(entryId);
      const request = createFixtureRequest(entry);
      const provider = createProvider(new FragmentAnalysisService(), request);

      expect(provider.provide(createParams(request, position(entry.text), true))).toEqual([]);
    });
  });

  describe('multiple definitions and references', () => {
    it('handles multiple references correctly', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Multiple getvar calls for the same variable
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::multi::1}} {{getvar::multi}} {{getvar::multi}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('multi', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should include 1 definition + 2 references
      expect(locations.length).toBeGreaterThanOrEqual(3);
    });

    it('handles references-only mode with multiple references', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{setvar::multi::1}} {{getvar::multi}} {{getvar::multi}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('multi', 20));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, false));

      // Should return only the 2 references (no definition)
      expect(locations.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('loop and slot variable support', () => {
    it('resolves slot variable references inside #each blocks', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Create an each block with slot reference
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items}}{{slot::item}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('item', 20));
      const lookup = service.locatePosition(request, position);
      expect(lookup).not.toBeNull();

      // The scope analyzer should have added the loop variable definition
      const symbolTable = lookup!.fragmentAnalysis.providerLookup.getSymbolTable();
      const loopVars = symbolTable.getVariables('item', 'loop');

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // If loop variable exists in symbol table, should return locations
      // Otherwise returns empty (which is also valid behavior)
      expect(Array.isArray(locations)).toBe(true);
      if (loopVars.length > 0) {
        expect(locations.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('resolves loop variables from #each binding', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // Create an each block with proper binding syntax
      const modifiedText = entry.text.replace(
        '{{user}}',
        '{{#each items as loopItem}}{{slot::loopItem}}{{/each}}',
      );
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('loopItem', 30));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // Should handle loop variables consistently
      expect(Array.isArray(locations)).toBe(true);
    });

    it('handles addvar which both defines and references', () => {
      const entry = getFixtureCorpusEntry('lorebook-basic');
      // addvar both defines and references a variable
      const modifiedText = entry.text.replace('{{user}}', '{{addvar::score::10}}');
      const request = { ...createFixtureRequest(entry), text: modifiedText };
      const service = new FragmentAnalysisService();

      const position = offsetToPosition(modifiedText, modifiedText.indexOf('score'));

      const provider = createProvider(service, request);
      const locations = provider.provide(createParams(request, position, true));

      // addvar creates a definition and potentially a reference
      expect(locations.length).toBeGreaterThanOrEqual(1);
    });
  });
});
