import { describe, expect, it } from 'vitest';
import { createPromptMainEditorPreview, getPromptTypeRule } from '../../src/domain/editor';

describe('main editor .risuprompt preview adapter', () => {
  it('encodes plain prompt rules and previews TEXT', () => {
    expect(getPromptTypeRule('plain')).toEqual({ requiredFields: ['type', 'type2', 'role'], allowedSections: ['TEXT'], sectionless: false });

    const preview = createPromptMainEditorPreview({
      frontmatter: { type: 'plain', type2: 'main', role: 'system' },
      type: 'plain',
      sections: { TEXT: 'Hello {{getvar::mood}}' },
    }, { variables: { chatVariables: { mood: 'calm' } } });

    expect(preview.status).toBe('ok');
    expect(preview.output).toBe('Hello calm');
    expect(preview.metadata.activeSection).toBe('TEXT');
  });

  it('encodes authornote rules and previews INNER_FORMAT plus DEFAULT_TEXT', () => {
    expect(getPromptTypeRule('authornote')).toEqual({ requiredFields: ['type'], allowedSections: ['INNER_FORMAT', 'DEFAULT_TEXT'], sectionless: false });

    const preview = createPromptMainEditorPreview({
      frontmatter: { type: 'authornote' },
      type: 'authornote',
      sections: { INNER_FORMAT: 'Inner {{char}}', DEFAULT_TEXT: 'Default' },
    }, { activeSection: 'INNER_FORMAT', variables: { characterLabel: 'Risu' } });

    expect(preview.status).toBe('ok');
    expect(preview.output).toContain('Risu');
    expect(preview.metadata.activeSection).toBe('INNER_FORMAT');
  });

  it('returns sectionless chat and cache guidance', () => {
    expect(getPromptTypeRule('chat')).toEqual({ requiredFields: ['type', 'range_start', 'range_end'], allowedSections: [], sectionless: true });
    expect(getPromptTypeRule('cache')).toEqual({ requiredFields: ['type', 'name', 'depth', 'cache_role'], allowedSections: [], sectionless: true });

    const chatPreview = createPromptMainEditorPreview({
      frontmatter: { type: 'chat', range_start: '0', range_end: 'end' },
      type: 'chat',
      sections: {},
    });
    const cachePreview = createPromptMainEditorPreview({
      frontmatter: { type: 'cache', name: 'K', depth: '4', cache_role: 'system' },
      type: 'cache',
      sections: {},
    });

    expect(chatPreview.output).toContain('chat history range_start/range_end');
    expect(cachePreview.output).toContain('context cache metadata');
    expect(chatPreview.metadata.sectionless).toBe('true');
    expect(cachePreview.metadata.sectionless).toBe('true');
  });
});
