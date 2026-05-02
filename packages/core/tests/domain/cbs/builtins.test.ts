import { describe, expect, it } from 'vitest';

import { CBSBuiltinRegistry } from '../../../src/domain';

describe('CBSBuiltinRegistry', () => {
  it('registers the full upstream builtin surface for canonical lookup', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.getAll()).toHaveLength(175);
    expect(registry.get('char')?.name).toBe('char');
    expect(registry.get('CHAR')?.name).toBe('char');
    expect(registry.get('getvar')?.category).toBe('variable');
    expect(registry.get('setvar')?.category).toBe('variable');
    expect(registry.get('#WHEN')?.name).toBe('#when');
    expect(registry.get('time')?.description).toContain('Formats date/time');
  });

  it('resolves alias lookups with lowercase-normalized matching', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('bot')?.name).toBe('char');
    expect(registry.get('BOT')?.name).toBe('char');
    expect(registry.get('charpersona')?.name).toBe('personality');
    expect(registry.get(':each')?.name).toBe('#each');
  });

  it('accepts tokenizer-normalized lookups for printable builtin names', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('videoimg')?.name).toBe('video-img');
    expect(registry.get('VIDEO_IMG')?.name).toBe('video-img');
    expect(registry.has('video img')).toBe(true);
  });

  it('exposes deprecated replacement metadata with planned overrides', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('#if')?.deprecated?.replacement).toBe('#when');
    expect(registry.get('#if_pure')?.deprecated?.replacement).toBe('#when::keep');
    expect(registry.get('#pure')?.deprecated?.replacement).toBe('#puredisplay');
  });

  it('keeps deprecated and alias metadata exact in focused lookups', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('charpersona')?.name).toBe('personality');
    expect(registry.get('#if_pure')?.deprecated?.replacement).toBe('#when::keep');
  });

  it('registers special literal and internal-only entries for editor metadata', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('?')?.category).toBe('math');
    expect(registry.get('//')?.name).toBe('//');
    expect(registry.get(':')?.name).toBe('displayescapedcolon');
    expect(registry.get(';')?.name).toBe('displayescapedsemicolon');
    expect(registry.get('__')?.internalOnly).toBe(true);
  });

  it('classifies documentation-only syntax entries in the registry source of truth', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('#when')?.docOnly).toBe(true);
    expect(registry.get('#each')?.docOnly).toBe(true);
    expect(registry.get(':each')?.docOnly).toBe(true);
    expect(registry.get('slot')?.docOnly).toBe(true);
    expect(registry.get('#pure')?.docOnly).toBe(true);
    expect(registry.get('#puredisplay')?.docOnly).toBe(true);
    expect(registry.get('#escape')?.docOnly).toBe(true);
    expect(registry.get(':else')?.docOnly).toBe(true);
    expect(registry.get('getvar')?.docOnly).toBeUndefined();
  });

  it('classifies contextual syntax entries in the registry source of truth', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('slot')?.contextual).toBe(true);
    expect(registry.get('position')?.contextual).toBe(true);
    expect(registry.get('#when')?.contextual).toBeUndefined();
    expect(registry.get('getvar')?.contextual).toBeUndefined();
  });

  it('reuses docOnly classification through dedicated registry helpers', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.isDocOnly('#when')).toBe(true);
    expect(registry.isDocOnly(':each')).toBe(true);
    expect(registry.isDocOnly('slot')).toBe(true);
    expect(registry.isDocOnly('getvar')).toBe(false);
    expect(registry.getDocOnly().map((fn) => fn.name)).toEqual(
      expect.arrayContaining([
        '#each',
        '#escape',
        '#pure',
        '#puredisplay',
        '#when',
        ':else',
        'slot',
      ]),
    );
  });

  it('reuses contextual classification through dedicated registry helpers', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.isContextual('slot')).toBe(true);
    expect(registry.isContextual('position')).toBe(true);
    expect(registry.isContextual('getvar')).toBe(false);
    expect(registry.isContextual('#when')).toBe(false);
    expect(registry.getContextual().map((fn) => fn.name)).toEqual(
      expect.arrayContaining(['slot', 'position']),
    );
  });

  it('filters populated builtins by category metadata', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.getByCategory('variable').map((fn) => fn.name)).toEqual(
      expect.arrayContaining([
        'addvar',
        'getglobalvar',
        'getvar',
        'return',
        'settempvar',
        'setvar',
        'tempvar',
      ]),
    );
    expect(registry.getByCategory('block').map((fn) => fn.name)).toEqual(
      expect.arrayContaining([
        '#each',
        '#if',
        '#if_pure',
        '#pure',
        '#puredisplay',
        '#when',
        ':else',
      ]),
    );
    expect(registry.getByCategory('asset').map((fn) => fn.name)).toEqual(
      expect.arrayContaining(['asset', 'bg', 'emotion', 'image', 'moduleassetlist']),
    );
  });

  it('provides usable argument metadata for signature-driven registry surfaces', () => {
    const registry = new CBSBuiltinRegistry();

    expect(registry.get('getvar')?.arguments).toEqual([
      {
        name: 'variableName',
        description: 'Persistent chat variable name to read',
        required: true,
        variadic: false,
      },
    ]);
    expect(registry.get('setvar')?.arguments).toEqual([
      {
        name: 'variableName',
        description: 'Persistent chat variable name to write',
        required: true,
        variadic: false,
      },
      {
        name: 'value',
        description: 'Value to store in the persistent chat variable',
        required: true,
        variadic: false,
      },
    ]);
    expect(registry.get('addvar')?.arguments).toEqual([
      {
        name: 'variableName',
        description: 'Persistent chat variable name to increment',
        required: true,
        variadic: false,
      },
      {
        name: 'amount',
        description: 'Numeric amount to add to the variable',
        required: true,
        variadic: false,
      },
    ]);
    expect(registry.get('#when')?.arguments).toEqual([
      {
        name: 'conditionSegments',
        description: 'Condition text and optional operators supplied after #when',
        required: true,
        variadic: true,
      },
    ]);
    expect(registry.get('#each')?.arguments).toEqual([
      {
        name: 'iteratorExpression',
        description: 'Array source, optional operators, and `as` binding expression',
        required: true,
        variadic: true,
      },
    ]);
  });
});
