import { describe, expect, it } from 'vitest';

import type { CharxV3Envelope } from '../src/domain/charx/blank-char';
import {
  convertCharbookEntriesToGlobalLore,
  convertCharxV3ToRisuDefinition,
} from '../src/domain/hmr/charx-to-risu';

function makeEnvelope(overrides: Record<string, unknown> = {}): CharxV3Envelope {
  return {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      name: 'Aria',
      description: 'desc-text',
      first_mes: 'hello',
      creator: 'noel',
      character_version: '1.2',
      creator_notes: 'notes',
      system_prompt: 'sys',
      alternate_greetings: ['alt1'],
      post_history_instructions: 'phi',
      tags: ['t1'],
      personality: 'p',
      scenario: 's',
      extensions: {
        risuai: {
          customScripts: [{ comment: 'rx' }],
          triggerscript: [{ comment: 'tg' }],
          additionalText: 'add',
          utilityBot: false,
          lowLevelAccess: false,
        },
      },
      ...overrides,
    },
  };
}

describe('convertCharbookEntriesToGlobalLore', () => {
  it('maps card book entries to risu loreBook shape', () => {
    const result = convertCharbookEntriesToGlobalLore([
      {
        keys: ['a', 'b'],
        secondary_keys: ['c'],
        insertion_order: 5,
        name: 'entry1',
        content: 'body',
        constant: true,
        selective: false,
        use_regex: false,
        case_sensitive: true,
        folder: 'f1',
        extensions: { risu_activationPercent: 50 },
      },
    ]);

    expect(result).toEqual([
      {
        key: 'a, b',
        secondkey: 'c',
        insertorder: 5,
        comment: 'entry1',
        content: 'body',
        mode: 'normal',
        alwaysActive: true,
        selective: false,
        extentions: { risu_activationPercent: 50, risu_case_sensitive: true },
        activationPercent: 50,
        loreCache: null,
        useRegex: false,
        folder: 'f1',
      },
    ]);
  });

  it('skips non-object entries and defaults missing fields', () => {
    const result = convertCharbookEntriesToGlobalLore([null, { content: 'only' }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: '',
      secondkey: '',
      insertorder: 0,
      comment: '',
      content: 'only',
    });
  });
});

describe('convertCharxV3ToRisuDefinition', () => {
  it('maps scalar definition fields', () => {
    const def = convertCharxV3ToRisuDefinition(makeEnvelope(), new Map());

    expect(def).toMatchObject({
      name: 'Aria',
      desc: 'desc-text',
      firstMessage: 'hello',
      creatorNotes: 'notes',
      systemPrompt: 'sys',
      replaceGlobalNote: 'phi',
      alternateGreetings: ['alt1'],
      tags: ['t1'],
      creator: 'noel',
      characterVersion: '1.2',
      personality: 'p',
      scenario: 's',
      customscript: [{ comment: 'rx' }],
      triggerscript: [{ comment: 'tg' }],
      additionalText: 'add',
      utilityBot: false,
      globalLore: [],
      emotionImages: [],
      additionalAssets: [],
      ccAssets: [],
    });
    expect(def).not.toHaveProperty('chats');
    expect(def).not.toHaveProperty('chatPage');
    expect(def).not.toHaveProperty('chaId');
    expect(def).not.toHaveProperty('image');
  });

  it('maps sparse asset slots by charx data.assets indexes with placeholders', () => {
    const envelope = makeEnvelope({
      assets: [
        undefined,
        { type: 'icon', name: 'main', ext: 'png', uri: 'embeded://assets/icon/image/main.png' },
        undefined,
        { type: 'emotion', name: 'joy', ext: 'webp', uri: 'embeded://assets/emotion/image/joy.webp' },
        { type: 'x-risu-asset', name: 'bgm', ext: 'mp3', uri: 'embeded://assets/other/audio/bgm.mp3' },
        { type: 'asset', name: 'misc', ext: 'png', uri: 'embeded://assets/other/image/misc.png' },
      ],
    });
    const placeholders = new Map<number, string>([
      [1, 'hmr-asset://h1'],
      [3, 'hmr-asset://h3'],
      [4, 'hmr-asset://h4'],
      [5, 'hmr-asset://h5'],
    ]);

    const def = convertCharxV3ToRisuDefinition(envelope, placeholders);

    expect(def.image).toBe('hmr-asset://h1');
    expect(def.emotionImages).toEqual([['joy', 'hmr-asset://h3']]);
    expect(def.additionalAssets).toEqual([['bgm', 'hmr-asset://h4', 'mp3']]);
    expect(def.ccAssets).toEqual([{ type: 'asset', uri: 'hmr-asset://h5', name: 'misc', ext: 'png' }]);
  });

  it('includes loreSettings only when charbook has the full settings triple', () => {
    const withSettings = convertCharxV3ToRisuDefinition(
      makeEnvelope({
        character_book: {
          entries: [],
          recursive_scanning: true,
          scan_depth: 3,
          token_budget: 1000,
          extensions: { risu_fullWordMatching: true },
        },
      }),
      new Map(),
    );

    expect(withSettings.loreSettings).toEqual({
      tokenBudget: 1000,
      scanDepth: 3,
      recursiveScanning: true,
      fullWordMatching: true,
    });

    const withoutSettings = convertCharxV3ToRisuDefinition(
      makeEnvelope({ character_book: { entries: [] } }),
      new Map(),
    );
    expect(withoutSettings).not.toHaveProperty('loreSettings');
  });
});
