import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildTogglePath,
  extractToggleFromModule,
  extractToggleFromPreset,
  injectToggleIntoModule,
  injectToggleIntoPreset,
  parseToggleContent,
  parseToggleDefinitions,
  resolveDuplicateToggleSources,
  serializeToggleContent,
  ToggleAdapterError,
} from '../../src/domain/custom-extension/extensions/toggle';

describe('toggle canonical adapter', () => {
  describe('parseToggleContent', () => {
    it('preserves exact file content without transformation', () => {
      const content = '=🔦백엔드=group\nlightboard.active=전원\n==groupEnd';
      expect(parseToggleContent(content)).toBe(content);
    });

    it('preserves empty strings', () => {
      expect(parseToggleContent('')).toBe('');
    });

    it('preserves multiline DSL with special characters', () => {
      const multiline = `=⚔️Merry RPG 모듈=group
BGMplugin=🎵 BGM(BGM 플러그인 필요)
SoundEffect=🔊 효과음
==groupEnd`;
      expect(parseToggleContent(multiline)).toBe(multiline);
    });

    it('preserves leading and trailing whitespace', () => {
      const content = '  toggle content  \n';
      expect(parseToggleContent(content)).toBe(content);
    });

    it('preserves content with XML-like tags', () => {
      const content = '<toggle condition="1 == 1"/>';
      expect(parseToggleContent(content)).toBe(content);
    });
  });

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

    it('ignores blank and comment lines while preserving raw toggle names', () => {
      const content = ['# comment', '', '  spaced.name = label'].join('\n');

      expect(parseToggleDefinitions(content)).toEqual([
        {
          name: 'spaced.name',
          globalVariableName: 'toggle_spaced.name',
          line: 2,
          startOffset: content.indexOf('spaced.name'),
          endOffset: content.indexOf('spaced.name') + 'spaced.name'.length,
        },
      ]);
    });
  });

  describe('serializeToggleContent', () => {
    it('serializes content exactly as-is', () => {
      const content = '=🔦백엔드=group\nlightboard.active=전원';
      expect(serializeToggleContent(content)).toBe(content);
    });

    it('serializes empty strings', () => {
      expect(serializeToggleContent('')).toBe('');
    });

    it('is inverse of parseToggleContent (round-trip identity)', () => {
      const original = '=⚔️RPG=group\noption=value\n==groupEnd';
      const parsed = parseToggleContent(original);
      const serialized = serializeToggleContent(parsed);
      expect(serialized).toBe(original);
    });
  });

  describe('target discrimination', () => {
    it('rejects charx target with clear error', () => {
      expect(() => buildTogglePath('charx' as CustomExtensionTarget)).toThrow(
        ToggleAdapterError
      );
      expect(() => buildTogglePath('charx' as CustomExtensionTarget)).toThrow(
        /charx.*does not support.*risutoggle/
      );
    });

    it('accepts module target', () => {
      expect(() => buildTogglePath('module', 'test-module')).not.toThrow();
    });

    it('accepts preset target', () => {
      expect(() => buildTogglePath('preset')).not.toThrow();
    });
  });

  describe('buildTogglePath', () => {
    it('builds module toggle path with target name', () => {
      const path = buildTogglePath('module', 'lightboard-module');
      expect(path).toBe('toggle/lightboard-module.risutoggle');
    });

    it('builds preset toggle path with fixed stem', () => {
      const path = buildTogglePath('preset');
      expect(path).toBe('toggle/prompt_template.risutoggle');
    });

    it('sanitizes module names with special characters', () => {
      const path = buildTogglePath('module', 'module/with\\slashes');
      expect(path).toBe('toggle/module_with_slashes.risutoggle');
    });

    it('preserves Korean characters in module names', () => {
      const path = buildTogglePath('module', '라이트보드-모듈');
      expect(path).toBe('toggle/라이트보드-모듈.risutoggle');
    });

    it('throws for module without target name', () => {
      expect(() => buildTogglePath('module')).toThrow(ToggleAdapterError);
      expect(() => buildTogglePath('module', '')).toThrow(ToggleAdapterError);
    });
  });

  describe('extractToggleFromModule', () => {
    it('extracts toggle from customModuleToggle field', () => {
      const module = { customModuleToggle: '<toggle>content</toggle>' };
      const result = extractToggleFromModule(module, 'module');
      expect(result).toBe('<toggle>content</toggle>');
    });

    it('returns null when customModuleToggle is undefined', () => {
      const module = {};
      const result = extractToggleFromModule(module, 'module');
      expect(result).toBeNull();
    });

    it('returns null when customModuleToggle is null', () => {
      const module = { customModuleToggle: null as unknown as string };
      const result = extractToggleFromModule(module, 'module');
      expect(result).toBeNull();
    });

    it('preserves empty string toggle', () => {
      const module = { customModuleToggle: '' };
      const result = extractToggleFromModule(module, 'module');
      expect(result).toBe('');
    });

    it('rejects preset target for module extraction', () => {
      const module = { customModuleToggle: 'content' };
      expect(() => extractToggleFromModule(module, 'preset')).toThrow(
        ToggleAdapterError
      );
    });

    it('rejects charx target', () => {
      const module = { customModuleToggle: 'content' };
      expect(() =>
        extractToggleFromModule(module, 'charx' as CustomExtensionTarget)
      ).toThrow(ToggleAdapterError);
    });
  });

  describe('extractToggleFromPreset', () => {
    it('extracts toggle from customPromptTemplateToggle field', () => {
      const preset = { customPromptTemplateToggle: '<toggle>preset</toggle>' };
      const result = extractToggleFromPreset(preset, 'preset');
      expect(result).toBe('<toggle>preset</toggle>');
    });

    it('returns null when customPromptTemplateToggle is undefined', () => {
      const preset = {};
      const result = extractToggleFromPreset(preset, 'preset');
      expect(result).toBeNull();
    });

    it('returns null when customPromptTemplateToggle is null', () => {
      const preset = { customPromptTemplateToggle: null as unknown as string };
      const result = extractToggleFromPreset(preset, 'preset');
      expect(result).toBeNull();
    });

    it('preserves empty string toggle', () => {
      const preset = { customPromptTemplateToggle: '' };
      const result = extractToggleFromPreset(preset, 'preset');
      expect(result).toBe('');
    });

    it('rejects module target for preset extraction', () => {
      const preset = { customPromptTemplateToggle: 'content' };
      expect(() => extractToggleFromPreset(preset, 'module')).toThrow(
        ToggleAdapterError
      );
    });

    it('rejects charx target', () => {
      const preset = { customPromptTemplateToggle: 'content' };
      expect(() =>
        extractToggleFromPreset(preset, 'charx' as CustomExtensionTarget)
      ).toThrow(ToggleAdapterError);
    });
  });

  describe('injectToggleIntoModule', () => {
    it('injects toggle into customModuleToggle field', () => {
      const module: { customModuleToggle?: string } = {};
      injectToggleIntoModule(module, '<toggle>new</toggle>', 'module');
      expect(module.customModuleToggle).toBe('<toggle>new</toggle>');
    });

    it('deletes field when content is null', () => {
      const module: { customModuleToggle?: string } = {
        customModuleToggle: 'old',
      };
      injectToggleIntoModule(module, null, 'module');
      expect(module.customModuleToggle).toBeUndefined();
    });

    it('injects empty string toggle', () => {
      const module: { customModuleToggle?: string } = {};
      injectToggleIntoModule(module, '', 'module');
      expect(module.customModuleToggle).toBe('');
    });

    it('rejects preset target for module injection', () => {
      const module: { customModuleToggle?: string } = {};
      expect(() =>
        injectToggleIntoModule(module, 'content', 'preset')
      ).toThrow(ToggleAdapterError);
    });

    it('rejects charx target', () => {
      const module: { customModuleToggle?: string } = {};
      expect(() =>
        injectToggleIntoModule(
          module,
          'content',
          'charx' as CustomExtensionTarget
        )
      ).toThrow(ToggleAdapterError);
    });
  });

  describe('injectToggleIntoPreset', () => {
    it('injects toggle into customPromptTemplateToggle field', () => {
      const preset: { customPromptTemplateToggle?: string } = {};
      injectToggleIntoPreset(preset, '<toggle>preset</toggle>', 'preset');
      expect(preset.customPromptTemplateToggle).toBe('<toggle>preset</toggle>');
    });

    it('deletes field when content is null', () => {
      const preset: { customPromptTemplateToggle?: string } = {
        customPromptTemplateToggle: 'old',
      };
      injectToggleIntoPreset(preset, null, 'preset');
      expect(preset.customPromptTemplateToggle).toBeUndefined();
    });

    it('injects empty string toggle', () => {
      const preset: { customPromptTemplateToggle?: string } = {};
      injectToggleIntoPreset(preset, '', 'preset');
      expect(preset.customPromptTemplateToggle).toBe('');
    });

    it('rejects module target for preset injection', () => {
      const preset: { customPromptTemplateToggle?: string } = {};
      expect(() =>
        injectToggleIntoPreset(preset, 'content', 'module')
      ).toThrow(ToggleAdapterError);
    });

    it('rejects charx target', () => {
      const preset: { customPromptTemplateToggle?: string } = {};
      expect(() =>
        injectToggleIntoPreset(
          preset,
          'content',
          'charx' as CustomExtensionTarget
        )
      ).toThrow(ToggleAdapterError);
    });
  });

  describe('resolveDuplicateToggleSources', () => {
    it('returns single source as-is', () => {
      const source = {
        target: 'module' as const,
        source: 'toggle/test.risutoggle',
        content: 'content',
      };
      expect(resolveDuplicateToggleSources([source])).toBe(source);
    });

    it('throws when no sources provided', () => {
      expect(() => resolveDuplicateToggleSources([])).toThrow(
        ToggleAdapterError
      );
      expect(() => resolveDuplicateToggleSources([])).toThrow(
        /No toggle sources provided/
      );
    });

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

    it('throws deterministically for multiple metadata sources', () => {
      const source1 = {
        target: 'module' as const,
        source: 'metadata1.json',
        content: 'content1',
      };
      const source2 = {
        target: 'module' as const,
        source: 'metadata2.json',
        content: 'content2',
      };
      expect(() => resolveDuplicateToggleSources([source1, source2])).toThrow(
        ToggleAdapterError
      );
      expect(() => resolveDuplicateToggleSources([source1, source2])).toThrow(
        /Duplicate toggle sources.*multiple metadata toggle fields/
      );
    });

    it('throws deterministically for mixed file and metadata sources', () => {
      const fileSource = {
        target: 'module' as const,
        source: 'toggle/test.risutoggle',
        content: 'file content',
      };
      const metadataSource = {
        target: 'module' as const,
        source: 'metadata.json',
        content: 'metadata content',
      };
      expect(() =>
        resolveDuplicateToggleSources([fileSource, metadataSource])
      ).toThrow(ToggleAdapterError);
      expect(() =>
        resolveDuplicateToggleSources([fileSource, metadataSource])
      ).toThrow(/Duplicate toggle sources.*both file.*and metadata/);
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

    it('handles complex multiline toggle DSL round-trip', () => {
      const original = `=🔦백엔드=group
lightboard.active=전원
lightboard.language=언어　명시=select=한국어,영어,일본어,명시 안함
=——————⚙️요　　청=divider
lightboard.maxCtx=최대　컨텍=text
=↑ 기억력 향상, 비용 증가. 커뮤니티 모듈 사용 시 높게 설정=caption
==groupEnd`;

      const module = { customModuleToggle: original };
      const extracted = extractToggleFromModule(module, 'module');

      const newModule: { customModuleToggle?: string } = {};
      injectToggleIntoModule(newModule, extracted, 'module');

      expect(newModule.customModuleToggle).toBe(original);
    });
  });
});
