import { describe, expect, it } from 'vitest';
import type { CustomExtensionTarget } from '../../src/domain/custom-extension/contracts';
import {
  buildPromptTemplatePath,
  extractPromptTemplateFromPreset,
  injectPromptTemplateIntoPreset,
  parsePromptTemplateContent,
  parsePromptTemplateOrder,
  PromptTemplateAdapterError,
  rebuildPromptTemplatesInCanonicalOrder,
  serializePromptTemplateBundle,
  serializePromptTemplateContent,
  serializePromptTemplateOrder,
  type PromptTemplateContent,
  type UpstreamPromptTemplateItem,
} from '../../src/domain/custom-extension/extensions/prompt-template';

describe('prompt-template canonical adapter', () => {
  describe('parsePromptTemplateContent', () => {
    it('parses plain prompt files with TEXT sections', () => {
      const parsed = parsePromptTemplateContent(`---
type: plain
type2: main
role: system
name: AI Mandate & Core Constraints
---
@@@ TEXT
# AI Mandate
{{#if {{? {{getglobalvar::toggle_real}}=1}}}}
Text body
{{/if}}
`);

      expect(parsed).toEqual({
        type: 'plain',
        type2: 'main',
        role: 'system',
        name: 'AI Mandate & Core Constraints',
        text: '# AI Mandate\n{{#if {{? {{getglobalvar::toggle_real}}=1}}}}\nText body\n{{/if}}',
      });
    });

    it('parses cache prompts with cache_role rename handling', () => {
      const parsed = parsePromptTemplateContent(`---
type: cache
name: main-cache
depth: 2
cache_role: all
---
`);

      expect(parsed).toEqual({
        type: 'cache',
        name: 'main-cache',
        depth: 2,
        role: 'all',
      });
    });

    it('rejects unsupported fields for a variant', () => {
      expect(() =>
        parsePromptTemplateContent(`---
type: persona
role: system
---
@@@ INNER_FORMAT
{{slot}}
`),
      ).toThrow(PromptTemplateAdapterError);
      expect(() =>
        parsePromptTemplateContent(`---
type: persona
role: system
---
@@@ INNER_FORMAT
{{slot}}
`),
      ).toThrow(/Unsupported frontmatter field "role"/);
    });

    it('rejects invalid range_end literal', () => {
      expect(() =>
        parsePromptTemplateContent(`---
type: chat
range_start: 0
range_end: tail
---
`),
      ).toThrow(PromptTemplateAdapterError);
      expect(() =>
        parsePromptTemplateContent(`---
type: chat
range_start: 0
range_end: tail
---
`),
      ).toThrow(/range_end/);
    });
  });

  describe('serializePromptTemplateContent', () => {
    it('serializes cache prompts with canonical cache_role field', () => {
      const serialized = serializePromptTemplateContent({
        type: 'cache',
        name: 'main-cache',
        depth: 2,
        role: 'assistant',
      });

      expect(serialized).toBe(`---
type: cache
name: main-cache
depth: 2
cache_role: assistant
---
`);
      expect(serialized).not.toContain('\nrole: ');
    });

    it('serializes chat prompts with snake_case range fields', () => {
      expect(
        serializePromptTemplateContent({
          type: 'chat',
          name: '과거 챗',
          rangeStart: 0,
          rangeEnd: -4,
          chatAsOriginalOnSystem: true,
        }),
      ).toBe(`---
type: chat
name: 과거 챗
range_start: 0
range_end: -4
chat_as_original_on_system: true
---
`);
    });
  });

  describe('order helpers', () => {
    it('serializes and parses _order.json entries for .risuprompt files', () => {
      const order = ['Main_Prompt.risuprompt', 'persona.risuprompt'];
      const raw = serializePromptTemplateOrder(order);

      expect(raw).toBe('[\n  "Main_Prompt.risuprompt",\n  "persona.risuprompt"\n]\n');
      expect(parsePromptTemplateOrder(raw)).toEqual(order);
    });

    it('rebuilds prompt templates in canonical order', () => {
      const ordered = rebuildPromptTemplatesInCanonicalOrder(
        ['persona.risuprompt', 'main.risuprompt', 'cache.risuprompt'],
        [
          {
            fileName: 'cache.risuprompt',
            content: { type: 'cache', name: 'main-cache', depth: 1, role: 'all' },
          },
          {
            fileName: 'main.risuprompt',
            content: { type: 'plain', type2: 'main', role: 'system', text: 'hello' },
          },
          {
            fileName: 'persona.risuprompt',
            content: { type: 'persona', innerFormat: '{{slot}}' },
          },
        ],
      );

      expect(ordered).toEqual<PromptTemplateContent[]>([
        { type: 'persona', innerFormat: '{{slot}}' },
        { type: 'plain', type2: 'main', role: 'system', text: 'hello' },
        { type: 'cache', name: 'main-cache', depth: 1, role: 'all' },
      ]);
    });
  });

  describe('bundle serialization', () => {
    it('preserves array order and adds deterministic suffixes for duplicate names', () => {
      const bundle = serializePromptTemplateBundle(
        [
          { type: 'plain', type2: 'main', role: 'system', name: 'Same Name', text: 'main' },
          { type: 'persona', name: 'Same Name', innerFormat: '{{slot}}' },
          { type: 'chat', rangeStart: 0, rangeEnd: 'end' },
        ],
        'preset',
      );

      expect(bundle.order).toEqual([
        'Same_Name.risuprompt',
        'Same_Name_1.risuprompt',
        'chat.risuprompt',
      ]);
      expect(bundle.files.map((file) => file.path)).toEqual([
        'prompt_template/Same_Name.risuprompt',
        'prompt_template/Same_Name_1.risuprompt',
        'prompt_template/chat.risuprompt',
      ]);
    });
  });

  describe('preset mapping', () => {
    it('drops orphan fields according to the variant whitelist on extraction', () => {
      const extracted = extractPromptTemplateFromPreset(
        {
          promptTemplate: [
            {
              type: 'description',
              text: '',
              role: 'bot',
              type2: 'normal',
              innerFormat: '<material>{{slot}}</material>',
              name: '🧬 Material',
            },
            {
              type: 'chatML',
              text: '<|im_start|>user',
              role: 'bot',
              type2: 'normal',
            },
          ],
        },
        'preset',
      );

      expect(extracted).toEqual<UpstreamPromptTemplateItem[]>([
        {
          type: 'description',
          innerFormat: '<material>{{slot}}</material>',
          name: '🧬 Material',
        },
        {
          type: 'chatML',
          text: '<|im_start|>user',
        },
      ]);
    });

    it('injects sanitized prompt template arrays back into preset shape', () => {
      const preset: { promptTemplate?: UpstreamPromptTemplateItem[] } = {};
      injectPromptTemplateIntoPreset(
        preset,
        [
          {
            type: 'cache',
            name: 'main-cache',
            depth: 2,
            role: 'all',
          },
          {
            type: 'chat',
            rangeStart: 0,
            rangeEnd: 'end',
            chatAsOriginalOnSystem: true,
            name: 'recent chat',
          },
        ],
        'preset',
      );

      expect(preset.promptTemplate).toEqual([
        {
          type: 'cache',
          name: 'main-cache',
          depth: 2,
          role: 'all',
        },
        {
          type: 'chat',
          rangeStart: 0,
          rangeEnd: 'end',
          chatAsOriginalOnSystem: true,
          name: 'recent chat',
        },
      ]);
    });
  });

  describe('target discrimination', () => {
    it('rejects non-preset targets for prompt template paths', () => {
      expect(() => buildPromptTemplatePath('module' as CustomExtensionTarget, 'main')).toThrow(
        PromptTemplateAdapterError,
      );
      expect(() => buildPromptTemplatePath('charx' as CustomExtensionTarget, 'main')).toThrow(
        /does not support.*risuprompt/,
      );
    });
  });
});
