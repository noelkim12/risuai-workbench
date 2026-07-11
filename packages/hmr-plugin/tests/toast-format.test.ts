import { describe, expect, it } from 'vitest';

import type { HmrNotice } from '../src/hmr/notifier';
import { formatNotice } from '../src/helpers/toast';

describe('formatNotice', () => {
  const cases: ReadonlyArray<readonly [string, HmrNotice, string, string]> = [
    [
      'initial',
      { kind: 'initial', label: '미카', version: 3 },
      '미카 연결됨',
      'v3 · 최신 상태 반영',
    ],
    [
      'single with assets',
      { kind: 'single', label: '미카', version: 18, assetCount: 2 },
      '미카 업데이트 반영됨',
      'v18 · 애셋 2개',
    ],
    [
      'single without assets',
      { kind: 'single', label: '미카', version: 18, assetCount: 0 },
      '미카 업데이트 반영됨',
      'v18',
    ],
    [
      'digest with assets',
      { kind: 'digest', label: '미카', count: 5, fromVersion: 13, toVersion: 18, assetCount: 4 },
      '자리를 비운 사이 5회 반영됨',
      'v13 → v18 · 애셋 4개',
    ],
    [
      'digest without assets',
      { kind: 'digest', label: '미카', count: 5, fromVersion: 13, toVersion: 18, assetCount: 0 },
      '자리를 비운 사이 5회 반영됨',
      'v13 → v18',
    ],
  ];

  for (const [name, notice, line1, line2] of cases) {
    it(`formats ${name}`, () => {
      expect(formatNotice(notice)).toEqual({ line1, line2 });
    });
  }
});
