import { describe, expect, it } from 'vitest';

import {
  assembleLorebookCollection,
  buildLorebookFolders,
  extractLorebooksFromCharx,
  extractLorebooksFromModule,
  injectLorebooksIntoCharx,
  injectLorebooksIntoModule,
  LorebookAdapterError,
  parseLorebookContent,
  parseLorebookFolders,
  parseLorebookOrder,
  serializeLorebookFolders,
  serializeLorebookOrder,
  type LorebookCanonicalFile,
  type LorebookContent,
  type LorebookFolders,
  type UpstreamCharxLorebookEntry,
  type UpstreamModuleLorebookEntry,
} from '../../src/domain/custom-extension/extensions/lorebook';

describe('lorebook canonical adapter', () => {
  describe('parseLorebookContent', () => {
    it('parses unified frontmatter plus body sections without YAML dependencies', () => {
      const content = `---
name: "🌟 이벤트 - 반전"
comment: "🌟 이벤트 - 반전"
mode: normal
constant: true
selective: true
insertion_order: 500
case_sensitive: false
use_regex: false
folder: null
extensions: {"nested":{"depth":1},"risu_loreCache":null}
book_version: 2
activation_percent: 15
id: lore-1
---
@@@ KEYS
Yagyu Maki
야규 마키
@@@ SECONDARY_KEYS
elder sister
rumi
@@@ CONTENT
@@depth 0
{{#if {{? {{roll::500}}<=3}} }}
Twist.
{{/if}}
`;

      expect(parseLorebookContent(content)).toEqual({
        name: '🌟 이벤트 - 반전',
        comment: '🌟 이벤트 - 반전',
        mode: 'normal',
        constant: true,
        selective: true,
        insertion_order: 500,
        case_sensitive: false,
        use_regex: false,
        folder: null,
        extensions: {
          nested: { depth: 1 },
          risu_loreCache: null,
        },
        book_version: 2,
        activation_percent: 15,
        id: 'lore-1',
        keys: ['Yagyu Maki', '야규 마키'],
        secondary_keys: ['elder sister', 'rumi'],
        content: '@@depth 0\n{{#if {{? {{roll::500}}<=3}} }}\nTwist.\n{{/if}}',
      });
    });
  });

  describe('target-specific extraction', () => {

    it('extracts module lorebooks into the same canonical shape while preserving module-only fields', () => {
      const extracted = extractLorebooksFromModule(
        {
          lorebook: [
            {
              key: 'Baek ryeon, 백련 , White Lotus',
              secondkey: ' elder sister, rumi ',
              comment: '백련 길드',
              content: 'Baekryeon guild content',
              mode: 'normal',
              alwaysActive: false,
              selective: true,
              insertorder: 680,
              useRegex: true,
              folder: 'guild-root',
              bookVersion: 2,
              activationPercent: 15,
              id: 'module-lore-1',
              extentions: {
                customTag: 'faction',
                risu_case_sensitive: false,
                risu_loreCache: null,
              },
            },
          ],
        },
        'module'
      );

      expect(extracted).toEqual([
        {
          name: '백련 길드',
          comment: '백련 길드',
          mode: 'normal',
          constant: false,
          selective: true,
          insertion_order: 680,
          case_sensitive: false,
          use_regex: true,
          folder: 'guild-root',
          extensions: {
            customTag: 'faction',
          },
          book_version: 2,
          activation_percent: 15,
          id: 'module-lore-1',
          keys: ['Baek ryeon', '백련', 'White Lotus'],
          secondary_keys: ['elder sister', 'rumi'],
          content: 'Baekryeon guild content',
        },
      ]);
    });
  });

  describe('target-specific injection', () => {
    it('exports charx lorebooks with V3-specific loss boundaries while preserving canonical name', () => {
      const upstream: {
        data?: {
          character_book?: {
            entries?: UpstreamCharxLorebookEntry[];
          };
        };
      } = {};
      const canonical: LorebookContent[] = [
        {
          name: 'Canonical Name',
          comment: 'Canonical Comment',
          mode: 'normal',
          constant: false,
          selective: false,
          insertion_order: 300,
          case_sensitive: false,
          use_regex: true,
          folder: 'guild-root',
          extensions: {
            customTag: 'faction',
            risu_loreCache: null,
          },
          book_version: 7,
          activation_percent: 15,
          id: 'drop-on-charx-export',
          keys: ['alpha', 'beta'],
          secondary_keys: ['gamma', 'delta'],
          content: 'Lore body',
        },
      ];

      injectLorebooksIntoCharx(upstream, canonical, 'charx');

      expect(upstream.data?.character_book?.entries).toEqual([
        {
          keys: ['alpha', 'beta'],
          content: 'Lore body',
          extensions: {
            customTag: 'faction',
            risu_activationPercent: 15,
            risu_bookVersion: 7,
            risu_case_sensitive: false,
            risu_loreCache: null,
          },
          enabled: true,
          insertion_order: 300,
          constant: false,
          selective: false,
          name: 'Canonical Name',
          comment: 'Canonical Comment',
          case_sensitive: false,
          use_regex: true,
          mode: 'normal',
          folder: 'guild-root',
        },
      ]);
      expect('secondary_keys' in (upstream.data?.character_book?.entries?.[0] ?? {})).toBe(false);
      expect('id' in (upstream.data?.character_book?.entries?.[0] ?? {})).toBe(false);
      expect('book_version' in (upstream.data?.character_book?.entries?.[0] ?? {})).toBe(false);
    });

    it('round-trips distinct charx name and comment fields without collapsing name to comment', () => {
      const extracted = extractLorebooksFromCharx(
        {
          data: {
            character_book: {
              entries: [
                {
                  keys: ['alpha'],
                  content: 'Lore body',
                  extensions: {},
                  enabled: true,
                  insertion_order: 100,
                  constant: false,
                  selective: false,
                  name: 'Preserved Name',
                  comment: 'Preserved Comment',
                  case_sensitive: false,
                  use_regex: false,
                  mode: 'normal',
                },
              ],
            },
          },
        },
        'charx'
      );
      const upstream: {
        data?: {
          character_book?: {
            entries?: UpstreamCharxLorebookEntry[];
          };
        };
      } = {};

      injectLorebooksIntoCharx(upstream, extracted, 'charx');

      expect(upstream.data?.character_book?.entries?.[0]).toEqual(
        expect.objectContaining({
          name: 'Preserved Name',
          comment: 'Preserved Comment',
        })
      );
    });

    it('exports module lorebooks with comma-joined keys and typo-restored extentions', () => {
      const upstream: { lorebook?: UpstreamModuleLorebookEntry[] } = {};
      const canonical: LorebookContent[] = [
        {
          name: 'Canonical Name',
          comment: 'Canonical Comment',
          mode: 'normal',
          constant: false,
          selective: true,
          insertion_order: 300,
          case_sensitive: false,
          use_regex: true,
          folder: 'guild-root',
          extensions: {
            customTag: 'faction',
            risu_loreCache: null,
          },
          book_version: 7,
          activation_percent: 15,
          id: 'module-lore-1',
          keys: ['alpha', 'beta'],
          secondary_keys: ['gamma', 'delta'],
          content: 'Lore body',
        },
      ];

      injectLorebooksIntoModule(upstream, canonical, 'module');

      expect(upstream.lorebook).toEqual([
        {
          key: 'alpha, beta',
          secondkey: 'gamma, delta',
          comment: 'Canonical Name',
          content: 'Lore body',
          mode: 'normal',
          alwaysActive: false,
          selective: true,
          insertorder: 300,
          useRegex: true,
          folder: 'guild-root',
          bookVersion: 7,
          activationPercent: 15,
          id: 'module-lore-1',
          extentions: {
            customTag: 'faction',
            risu_case_sensitive: false,
            risu_loreCache: null,
          },
        },
      ]);
      expect('name' in (upstream.lorebook?.[0] ?? {})).toBe(false);
      expect('enabled' in (upstream.lorebook?.[0] ?? {})).toBe(false);
    });
  });

  describe('folder and order helpers', () => {

    it('round-trips _folders.json and _order.json deterministically without inventing ids or enabled fields', () => {
      const folderEntry: LorebookContent = {
        name: '길드',
        comment: '길드',
        mode: 'folder',
        constant: false,
        selective: false,
        insertion_order: 100,
        case_sensitive: false,
        use_regex: false,
        keys: ['guild-root'],
        content: '',
      };

      const folders = buildLorebookFolders([folderEntry]);

      expect(folders).toEqual({
        'guild-root': {
          name: '길드',
          comment: '길드',
          mode: 'folder',
          constant: false,
          selective: false,
          insertion_order: 100,
          case_sensitive: false,
          use_regex: false,
        },
      });
      expect('id' in folders['guild-root']).toBe(false);
      expect('enabled' in folders['guild-root']).toBe(false);

      const serializedFolders = serializeLorebookFolders(folders);
      const serializedOrder = serializeLorebookOrder([
        'zeta.risulorebook',
        'guild/white_lotus.risulorebook',
      ]);

      expect(serializedFolders).toBe(`{
  "guild-root": {
    "name": "길드",
    "comment": "길드",
    "mode": "folder",
    "constant": false,
    "selective": false,
    "insertion_order": 100,
    "case_sensitive": false,
    "use_regex": false
  }
}\n`);
      expect(serializedOrder).toBe(`[
  "zeta.risulorebook",
  "guild/white_lotus.risulorebook"
]\n`);
      expect(parseLorebookFolders(serializedFolders)).toEqual(folders);
      expect(parseLorebookOrder(serializedOrder)).toEqual([
        'zeta.risulorebook',
        'guild/white_lotus.risulorebook',
      ]);
    });

    it('rejects folder lorebooks with multiple keys instead of truncating them', () => {
      expect(() =>
        buildLorebookFolders([
          {
            name: '길드',
            comment: '길드',
            mode: 'folder',
            constant: false,
            selective: false,
            insertion_order: 100,
            case_sensitive: false,
            use_regex: false,
            keys: ['guild-root', 'extra-key'],
            content: '',
          },
        ])
      ).toThrow(LorebookAdapterError);
      expect(() =>
        buildLorebookFolders([
          {
            name: '길드',
            comment: '길드',
            mode: 'folder',
            constant: false,
            selective: false,
            insertion_order: 100,
            case_sensitive: false,
            use_regex: false,
            keys: ['guild-root', 'extra-key'],
            content: '',
          },
        ])
      ).toThrow(/multiple keys|single key|folder key/);
    });

    it('assembles folders ahead of their first descendant while preserving declared entry order', () => {
      const files: LorebookCanonicalFile[] = [
        {
          relativePath: 'guild/white_lotus.risulorebook',
          content: {
            name: '백련 길드',
            comment: '백련 길드',
            mode: 'normal',
            constant: false,
            selective: false,
            insertion_order: 680,
            case_sensitive: false,
            use_regex: false,
            folder: 'guild-root',
            keys: ['백련'],
            content: 'Baekryeon guild content',
          },
        },
        {
          relativePath: 'zeta.risulorebook',
          content: {
            name: '제타',
            comment: '제타',
            mode: 'normal',
            constant: true,
            selective: false,
            insertion_order: 900,
            case_sensitive: false,
            use_regex: false,
            keys: [],
            content: 'Always active',
          },
        },
      ];
      const folders: LorebookFolders = {
        'guild-root': {
          name: '길드',
          comment: '길드',
          mode: 'folder',
          constant: false,
          selective: false,
          insertion_order: 100,
          case_sensitive: false,
          use_regex: false,
        },
      };

      expect(
        assembleLorebookCollection(files, folders, ['zeta.risulorebook', 'guild/white_lotus.risulorebook'])
      ).toEqual([
        files[1].content,
        {
          name: '길드',
          comment: '길드',
          mode: 'folder',
          constant: false,
          selective: false,
          insertion_order: 100,
          case_sensitive: false,
          use_regex: false,
          keys: ['guild-root'],
          content: '',
        },
        files[0].content,
      ]);
    });

    it('rejects forbidden enabled fields in folder manifests', () => {
      expect(() =>
        parseLorebookFolders(`{
  "guild-root": {
    "name": "길드",
    "comment": "길드",
    "mode": "folder",
    "constant": false,
    "selective": false,
    "insertion_order": 100,
    "case_sensitive": false,
    "use_regex": false,
    "enabled": true
  }
}`)
      ).toThrow(LorebookAdapterError);
      expect(() =>
        parseLorebookFolders(`{
  "guild-root": {
    "name": "길드",
    "comment": "길드",
    "mode": "folder",
    "constant": false,
    "selective": false,
    "insertion_order": 100,
    "case_sensitive": false,
    "use_regex": false,
    "enabled": true
  }
}`)
      ).toThrow(/enabled/);
    });
  });
});
