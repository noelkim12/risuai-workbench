import { describe, expect, it } from 'vitest';
import { createBlankChar, createBlankCharxV3 } from '../src/domain/charx/blank-char';

describe('blank character CharX mapping', () => {
  it('exports replaceGlobalNote directly on charx data', () => {
    const character = createBlankChar();
    character.replaceGlobalNote = 'Replace global note with {{original}} plus character context.';

    const charx = createBlankCharxV3(character);

    expect(charx.data.replaceGlobalNote).toBe(
      'Replace global note with {{original}} plus character context.',
    );
  });

  it('does not expose the legacy post-history field as the active local blank character field', () => {
    const character = createBlankChar() as unknown as Record<string, unknown>;
    const legacyPostHistoryKey = ['postHistory', 'Instructions'].join('');

    expect(character.replaceGlobalNote).toBe('');
    expect(Object.prototype.hasOwnProperty.call(character, legacyPostHistoryKey)).toBe(false);
  });

  it('exports tags into charx v3 data', () => {
    const character = createBlankChar();
    character.tags = ['female', 'OfficeLady', 'romance'];

    const charx = createBlankCharxV3(character);

    expect(charx.data.tags).toEqual(['female', 'OfficeLady', 'romance']);
  });
});
