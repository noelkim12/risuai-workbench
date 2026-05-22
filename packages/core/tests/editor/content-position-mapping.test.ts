import { describe, expect, it } from 'vitest';
import {
  mapContentMonacoPositionToSourcePosition,
  mapSourceRangeToContentMonacoRange,
  parseLorebookEditorDocument,
} from '../../src/domain/editor';

describe('main editor CONTENT position mapping', () => {
  const source = ['---', 'name: Entry', '---', '@@@ KEYS', 'alpha', '@@@ CONTENT', 'Hello {{user}}', 'Second line', ''].join('\n');

  it('maps one-based Monaco CONTENT positions to zero-based source positions', () => {
    const model = parseLorebookEditorDocument(source);
    const mapped = mapContentMonacoPositionToSourcePosition(model, 'CONTENT', { lineNumber: 1, column: 9 });

    expect(mapped).toEqual({ line: 6, character: 8, offset: source.indexOf('{{user}}') + 2 });
  });

  it('maps source ranges back into one-based Monaco ranges', () => {
    const model = parseLorebookEditorDocument(source);
    const startOffset = source.indexOf('{{user}}');
    const mapped = mapSourceRangeToContentMonacoRange(model, 'CONTENT', {
      startOffset,
      endOffset: startOffset + '{{user}}'.length,
    });

    expect(mapped).toEqual({ startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 15 });
  });

  it('returns null for unsupported sections in Phase 4', () => {
    const model = parseLorebookEditorDocument(source);
    expect(mapContentMonacoPositionToSourcePosition(model, 'KEYS', { lineNumber: 1, column: 1 })).toBeNull();
  });
});
