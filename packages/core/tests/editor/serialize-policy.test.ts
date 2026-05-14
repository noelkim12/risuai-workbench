/**
 * Editor format serialize policy 함수 테스트.
 * Phase 3에서 추출한 `canSerialize{Format}Model` 정책 함수와
 * duplicate section / unsupported frontmatter 동작을 검증.
 * @file packages/core/tests/editor/serialize-policy.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  canSerializeLorebookModel,
  canSerializeRegexModel,
  canSerializePromptModel,
  parseLorebookEditorDocument,
  parseRegexEditorDocument,
  parsePromptEditorDocument,
  reassembleLorebookEditorDocument,
  reassembleRegexEditorDocument,
  reassemblePromptEditorDocument,
} from '../../src/domain/editor';
import type { EditorDocumentModel, LorebookEditorState, RegexEditorState, PromptEditorState, EditorDocumentWarning } from '../../src/domain/editor';

/**
 * makeLorebookModelWithWarnings 함수.
 * 테스트용 lorebook model에 임의 warning을 주입함.
 *
 * @param warnings - 정책 검사에 사용할 warning 목록
 * @returns warning이 주입된 최소 lorebook editor model
 */
function makeLorebookModelWithWarnings(warnings: EditorDocumentWarning[]): EditorDocumentModel<LorebookEditorState> {
  return {
    formatKind: 'lorebook',
    source: 'original',
    lineEnding: '\n',
    hasFinalNewline: false,
    frontmatter: null,
    sections: [],
    warnings,
    state: {
      frontmatter: {},
      unknownFrontmatter: [],
      keysText: '',
      secondaryKeysText: '',
      contentText: '',
      hasSecondaryKeysSection: false,
    },
  };
}

/**
 * makeRegexModelWithWarnings 함수.
 * 테스트용 regex model에 임의 warning을 주입함.
 *
 * @param warnings - 정책 검사에 사용할 warning 목록
 * @returns warning이 주입된 최소 regex editor model
 */
function makeRegexModelWithWarnings(warnings: EditorDocumentWarning[]): EditorDocumentModel<RegexEditorState> {
  return {
    formatKind: 'regex',
    source: 'original',
    lineEnding: '\n',
    hasFinalNewline: false,
    frontmatter: null,
    sections: [],
    warnings,
    state: { frontmatter: {}, inText: '', outText: '' },
  };
}

/**
 * makePromptModelWithWarnings 함수.
 * 테스트용 prompt model에 임의 warning을 주입함.
 *
 * @param warnings - 정책 검사에 사용할 warning 목록
 * @returns warning이 주입된 최소 prompt editor model
 */
function makePromptModelWithWarnings(warnings: EditorDocumentWarning[]): EditorDocumentModel<PromptEditorState> {
  return {
    formatKind: 'prompt',
    source: 'original',
    lineEnding: '\n',
    hasFinalNewline: false,
    frontmatter: null,
    sections: [],
    warnings,
    state: { frontmatter: {}, type: null, sections: {} },
  };
}

const RANGE = { startOffset: 0, endOffset: 0 };

describe('serialize policy functions', () => {
  describe('canSerializeLorebookModel', () => {
    it('allows serialization when there are no warnings', () => {
      expect(canSerializeLorebookModel(makeLorebookModelWithWarnings([]))).toBe(true);
    });

    it('allows serialization when only unsupported-frontmatter-field warnings exist', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'unsupported-frontmatter-field', severity: 'warning', message: 'test', range: RANGE },
        { code: 'unsupported-frontmatter-field', severity: 'warning', message: 'test2', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(true);
    });

    it('blocks serialization when duplicate-section warning exists', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'duplicate-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(false);
    });

    it('blocks serialization when missing-section warning exists', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'missing-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(false);
    });

    it('blocks serialization when unsupported-section warning exists', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'unsupported-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(false);
    });

    it('blocks serialization when malformed-frontmatter warning exists', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'malformed-frontmatter', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(false);
    });

    it('blocks serialization when error severity warning exists alongside unsupported-frontmatter-field', () => {
      const model = makeLorebookModelWithWarnings([
        { code: 'unsupported-frontmatter-field', severity: 'warning', message: 'ok', range: RANGE },
        { code: 'duplicate-section', severity: 'error', message: 'bad', range: RANGE },
      ]);
      expect(canSerializeLorebookModel(model)).toBe(false);
    });
  });

  describe('canSerializeRegexModel', () => {
    it('allows serialization when there are no warnings', () => {
      expect(canSerializeRegexModel(makeRegexModelWithWarnings([]))).toBe(true);
    });

    it('blocks serialization when any warning exists', () => {
      const model = makeRegexModelWithWarnings([
        { code: 'duplicate-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeRegexModel(model)).toBe(false);
    });

    it('blocks serialization when unsupported-section warning exists', () => {
      const model = makeRegexModelWithWarnings([
        { code: 'unsupported-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializeRegexModel(model)).toBe(false);
    });
  });

  describe('canSerializePromptModel', () => {
    it('allows serialization when there are no warnings', () => {
      expect(canSerializePromptModel(makePromptModelWithWarnings([]))).toBe(true);
    });

    it('blocks serialization when any warning exists', () => {
      const model = makePromptModelWithWarnings([
        { code: 'unsupported-section', severity: 'error', message: 'test', range: RANGE },
      ]);
      expect(canSerializePromptModel(model)).toBe(false);
    });
  });
});

describe('serialize policy integration with reassemble functions', () => {
  it('duplicate section serialization is blocked for lorebook', () => {
    const source = ['---', 'name: Dup', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'first', '@@@ CONTENT', 'last'].join('\n');
    const model = parseLorebookEditorDocument(source);

    expect(model.warnings.some((w) => w.code === 'duplicate-section')).toBe(true);
    expect(canSerializeLorebookModel(model)).toBe(false);
    expect(reassembleLorebookEditorDocument(model, { ...model.state, contentText: 'edited' })).toBe(source);
  });

  it('duplicate section serialization is blocked for regex', () => {
    const source = ['---', 'comment: Dup', '---', '@@@ IN', 'first', '@@@ IN', 'last', '@@@ OUT', 'B'].join('\n');
    const model = parseRegexEditorDocument(source);

    expect(model.warnings.some((w) => w.code === 'duplicate-section')).toBe(true);
    expect(canSerializeRegexModel(model)).toBe(false);
    expect(reassembleRegexEditorDocument(model, { ...model.state, inText: 'edited' })).toBe(source);
  });

  it('regex warning serialization is blocked', () => {
    const source = ['---', 'comment: Rule', '---', '@@@ IN', 'A', '@@@ UNKNOWN', 'keep', '@@@ OUT', 'B'].join('\n');
    const model = parseRegexEditorDocument(source);

    expect(model.warnings.length).toBeGreaterThan(0);
    expect(canSerializeRegexModel(model)).toBe(false);
    expect(reassembleRegexEditorDocument(model, { ...model.state, inText: 'A+' })).toBe(source);
  });

  it('prompt warning serialization is blocked', () => {
    const source = ['---', 'type: authornote', '---', '@@@ INNER_FORMAT', 'Inner', '@@@ EXTRA', 'keep'].join('\n');
    const model = parsePromptEditorDocument(source);

    expect(model.warnings.length).toBeGreaterThan(0);
    expect(canSerializePromptModel(model)).toBe(false);
    expect(reassemblePromptEditorDocument(model, { ...model.state, sections: { INNER_FORMAT: 'Edited' } })).toBe(source);
  });

  it('lorebook unsupported frontmatter field serialization is allowed', () => {
    const source = ['---', 'name: Unknown Field', 'advanced_keep: preserved', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'Body'].join('\n');
    const model = parseLorebookEditorDocument(source);

    expect(model.warnings.every((w) => w.code === 'unsupported-frontmatter-field')).toBe(true);
    expect(canSerializeLorebookModel(model)).toBe(true);
    // Can serialize means reassemble produces a valid reassembled document, not raw source.
    const result = reassembleLorebookEditorDocument(model, model.state);
    expect(result).toContain('alpha');
    expect(result).toContain('Body');
    // Editing the state works when only unsupported-frontmatter-field warnings exist.
    const edited = reassembleLorebookEditorDocument(model, { ...model.state, contentText: 'Edited body' });
    expect(edited).toContain('Edited body');
    expect(edited).not.toBe(source);
  });
});
