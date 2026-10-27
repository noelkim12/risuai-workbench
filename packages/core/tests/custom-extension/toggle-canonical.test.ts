import { describe, expect, it } from 'vitest';

import {
  buildTogglePath,
  extractToggleFromCharx,
  extractToggleFromModule,
  extractToggleFromPreset,
  injectToggleIntoCharx,
  injectToggleIntoModule,
  injectToggleIntoPreset,
  parseToggleContent,
  parseToggleDefinitions,
  resolveDuplicateToggleSources,
  serializeToggleContent,
  ToggleAdapterError,
} from '../../src/domain/custom-extension/extensions/toggle';

describe('toggle canonical adapter', () => {

  describe('parseToggleDefinitions', () => {
    it('extracts toggle keys and derived global variable names from risutoggle DSL', () => {
      const content = [
        'response_mode-gpt-5.4=모드=select=기본,OOC(지침X),OOC(지침O)',
        'pastmj-gpt-5.4=중요사건',
      ].join('\n');

      expect(parseToggleDefinitions(content)).toEqual([
        {
          name: 'response_mode-gpt-5.4',
          globalVariableName: 'toggle_response_mode-gpt-5.4',
          line: 0,
          startOffset: 0,
          endOffset: 'response_mode-gpt-5.4'.length,
        },
        {
          name: 'pastmj-gpt-5.4',
          globalVariableName: 'toggle_pastmj-gpt-5.4',
          line: 1,
          startOffset: content.indexOf('pastmj-gpt-5.4'),
          endOffset: content.indexOf('pastmj-gpt-5.4') + 'pastmj-gpt-5.4'.length,
        },
      ]);
    });
  });

  describe('serializeToggleContent', () => {

    it('is inverse of parseToggleContent (round-trip identity)', () => {
      const original = '=⚔️RPG=group\noption=value\n==groupEnd';
      const parsed = parseToggleContent(original);
      const serialized = serializeToggleContent(parsed);
      expect(serialized).toBe(original);
    });
  });

  describe('buildTogglePath', () => {

    it('throws for charx or module without target name', () => {
      expect(() => buildTogglePath('charx')).toThrow(ToggleAdapterError);
      expect(() => buildTogglePath('charx', '')).toThrow(ToggleAdapterError);
      expect(() => buildTogglePath('module')).toThrow(ToggleAdapterError);
      expect(() => buildTogglePath('module', '')).toThrow(ToggleAdapterError);
    });
  });

  describe('extractToggleFromCharx', () => {
    it('extracts toggle from data.extensions.risuai.toggles field', () => {
      const charx = { data: { extensions: { risuai: { toggles: 'mode=on' } } } };
      const result = extractToggleFromCharx(charx, 'charx');
      expect(result).toBe('mode=on');
    });
  });

  describe('extractToggleFromPreset', () => {
    it('extracts toggle from customPromptTemplateToggle field', () => {
      const preset = { customPromptTemplateToggle: '<toggle>preset</toggle>' };
      const result = extractToggleFromPreset(preset, 'preset');
      expect(result).toBe('<toggle>preset</toggle>');
    });
  });

  describe('injectToggleIntoModule', () => {

    it('deletes field when content is null', () => {
      const module: { customModuleToggle?: string } = {
        customModuleToggle: 'old',
      };
      injectToggleIntoModule(module, null, 'module');
      expect(module.customModuleToggle).toBeUndefined();
    });
  });

  describe('injectToggleIntoCharx', () => {

    it('removes toggle field when content is null', () => {
      const charx = { data: { extensions: { risuai: { toggles: 'remove-me' } } } };
      injectToggleIntoCharx(charx, null, 'charx');
      expect(charx.data.extensions.risuai.toggles).toBeUndefined();
    });
  });

  describe('resolveDuplicateToggleSources', () => {

    it('throws deterministically for multiple file sources', () => {
      const file1 = {
        target: 'module' as const,
        source: 'toggle/a.risutoggle',
        content: 'a',
      };
      const file2 = {
        target: 'module' as const,
        source: 'toggle/b.risutoggle',
        content: 'b',
      };
      expect(() => resolveDuplicateToggleSources([file1, file2])).toThrow(
        ToggleAdapterError
      );
      expect(() => resolveDuplicateToggleSources([file1, file2])).toThrow(
        /Duplicate toggle sources.*multiple .risutoggle files/
      );
    });
  });

  describe('round-trip integrity', () => {
    it('maintains lossless round-trip for module toggle', () => {
      const original = '=⚔️RPG=group\nBGMplugin=on\n==groupEnd';
      const module = { customModuleToggle: original };

      // Extract
      const extracted = extractToggleFromModule(module, 'module');
      expect(extracted).toBe(original);

      // Serialize and inject back
      const newModule: { customModuleToggle?: string } = {};
      injectToggleIntoModule(newModule, extracted, 'module');
      expect(newModule.customModuleToggle).toBe(original);
    });

    it('maintains lossless round-trip for preset toggle', () => {
      const original = '<toggle>{{user}}</toggle>';
      const preset = { customPromptTemplateToggle: original };

      // Extract
      const extracted = extractToggleFromPreset(preset, 'preset');
      expect(extracted).toBe(original);

      // Serialize and inject back
      const newPreset: { customPromptTemplateToggle?: string } = {};
      injectToggleIntoPreset(newPreset, extracted, 'preset');
      expect(newPreset.customPromptTemplateToggle).toBe(original);
    });
  });
});
