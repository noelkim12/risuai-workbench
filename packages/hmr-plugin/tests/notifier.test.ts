import { describe, expect, it } from 'vitest';

import type { HmrEvent } from '../src/hmr/controller';
import { createNotifier, type HmrNotice } from '../src/hmr/notifier';

const applied = (fromVersion: number, version: number, assetCount = 0): HmrEvent => ({
  kind: 'applied',
  fromVersion,
  version,
  assetCount,
});

function makeFake(visible: boolean) {
  const shown: HmrNotice[] = [];
  let isVisible = visible;
  const notifier = createNotifier({
    isVisible: () => isVisible,
    show: (notice) => shown.push(notice),
  });
  return {
    notifier,
    shown,
    setVisible(next: boolean) {
      isVisible = next;
    },
  };
}

describe('notifier', () => {
  it('shows one single notice per applied event while visible', () => {
    const fake = makeFake(true);

    fake.notifier.notify(applied(1, 2, 1), '미카');
    fake.notifier.notify(applied(2, 3, 0), '미카');
    fake.notifier.notify(applied(3, 4, 2), '미카');

    expect(fake.shown).toEqual([
      { kind: 'single', label: '미카', version: 2, assetCount: 1 },
      { kind: 'single', label: '미카', version: 3, assetCount: 0 },
      { kind: 'single', label: '미카', version: 4, assetCount: 2 },
    ]);
  });

  it('shows an initial notice for initialSynced while visible', () => {
    const fake = makeFake(true);

    fake.notifier.notify({ kind: 'initialSynced', version: 9, assetCount: 3 }, '미카');

    expect(fake.shown).toEqual([{ kind: 'initial', label: '미카', version: 9 }]);
  });

  it('shows nothing while hidden', () => {
    const fake = makeFake(false);

    fake.notifier.notify(applied(1, 2), '미카');
    fake.notifier.notify(applied(2, 3), '미카');

    expect(fake.shown).toEqual([]);
  });

  it('merges hidden applied events into one digest on flush', () => {
    const fake = makeFake(false);

    fake.notifier.notify(applied(13, 14, 1), '미카');
    fake.notifier.notify(applied(14, 15, 0), '미카');
    fake.notifier.notify(applied(15, 18, 3), '미카');
    fake.setVisible(true);
    fake.notifier.flush();

    expect(fake.shown).toEqual([
      { kind: 'digest', label: '미카', count: 3, fromVersion: 13, toVersion: 18, assetCount: 4 },
    ]);
  });

  it('demotes a single hidden event to a single notice on flush', () => {
    const fake = makeFake(false);

    fake.notifier.notify(applied(13, 14, 2), '미카');
    fake.setVisible(true);
    fake.notifier.flush();

    expect(fake.shown).toEqual([{ kind: 'single', label: '미카', version: 14, assetCount: 2 }]);
  });

  it('clears pending so a second flush emits nothing', () => {
    const fake = makeFake(false);

    fake.notifier.notify(applied(1, 2), '미카');
    fake.notifier.notify(applied(2, 3), '미카');
    fake.setVisible(true);
    fake.notifier.flush();
    fake.notifier.flush();

    expect(fake.shown).toHaveLength(1);
  });

  it('flush is a no-op when nothing is pending', () => {
    const fake = makeFake(true);

    fake.notifier.flush();

    expect(fake.shown).toEqual([]);
  });

  it('drops initialSynced that arrives while hidden', () => {
    const fake = makeFake(false);

    fake.notifier.notify({ kind: 'initialSynced', version: 1, assetCount: 0 }, '미카');
    fake.setVisible(true);
    fake.notifier.flush();

    expect(fake.shown).toEqual([]);
  });

  it('keeps the earliest fromVersion and the latest label across a digest', () => {
    const fake = makeFake(false);

    fake.notifier.notify(applied(5, 6), '미카');
    fake.notifier.notify(applied(6, 7), '미카 (수정)');
    fake.setVisible(true);
    fake.notifier.flush();

    expect(fake.shown[0]).toMatchObject({ fromVersion: 5, toVersion: 7, label: '미카 (수정)' });
  });
});
