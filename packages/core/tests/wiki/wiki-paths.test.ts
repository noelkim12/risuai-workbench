import { describe, expect, it } from 'vitest';
import * as wikiPaths from '@/cli/analyze/shared/wiki/paths';
import {
  entityToSiblingEntity,
  entityToConsolidated,
  entityToChain,
  entityToNotes,
  chainToEntity,
  chainToConsolidated,
  chainToSiblingChain,
  chainToNotes,
  overviewToNotes,
  overviewToCompanion,
  overviewToDomain,
  consolidatedToNotes,
  lorebookIndexToNotes,
  entityToExtractSource,
} from '@/cli/analyze/shared/wiki/paths';

describe('wiki/paths', () => {
  it('exposes a helper that preserves nested lorebook folder paths', () => {
    expect(wikiPaths).toHaveProperty('buildLorebookEntityPath');
    const buildLorebookEntityPath = (
      wikiPaths as typeof wikiPaths & {
        buildLorebookEntityPath: (folder: string | null | undefined, slug: string) => string;
      }
    ).buildLorebookEntityPath;

    expect(buildLorebookEntityPath(undefined, '이하은')).toBe('lorebook/이하은.md');
    expect(buildLorebookEntityPath('🌟이벤트_트리거/서브', '🌟_이벤트_-_나쁜일')).toBe(
      'lorebook/🌟이벤트_트리거/서브/🌟_이벤트_-_나쁜일.md',
    );
  });

  it('exposes a helper that preserves nested lorebook activation chain folder paths', () => {
    expect(wikiPaths).toHaveProperty('buildLorebookActivationChainPath');
    const buildLorebookActivationChainPath = (
      wikiPaths as typeof wikiPaths & {
        buildLorebookActivationChainPath: (folder: string | null | undefined, slug: string) => string;
      }
    ).buildLorebookActivationChainPath;

    expect(buildLorebookActivationChainPath(undefined, '상태창')).toBe('chains/lorebook-activation/상태창.md');
    expect(buildLorebookActivationChainPath('🌟이벤트_트리거/서브', '🌟_이벤트_-_나쁜일')).toBe(
      'chains/lorebook-activation/🌟이벤트_트리거/서브/🌟_이벤트_-_나쁜일.md',
    );
  });

  it('entity → sibling entity preserves folder-aware relative paths', () => {
    const fn = entityToSiblingEntity as unknown as (
      sourceRelativePath: string,
      targetRelativePath: string,
    ) => string;

    expect(fn('lorebook/🌟이벤트_트리거/NPC.md', 'lorebook/상태창.md')).toBe('../상태창.md');
  });

  it('entity → consolidated is one level up', () => {
    const fn = entityToConsolidated as unknown as (
      sourceRelativePath: string,
      filename: string,
    ) => string;

    expect(fn('lorebook/🌟이벤트_트리거/NPC.md', 'variables')).toBe('../../variables.md');
  });

  it('entity → chain goes up one then into chains', () => {
    const fn = entityToChain as unknown as (
      sourceRelativePath: string,
      category: string,
      slug: string,
    ) => string;

    expect(fn('lorebook/🌟이벤트_트리거/강유라.md', 'lorebook-activation', '헌터_협회')).toBe(
      '../../chains/lorebook-activation/헌터_협회.md',
    );
  });

  it('entity → nested chain accepts a pre-resolved target path', () => {
    const fn = entityToChain as unknown as (
      sourceRelativePath: string,
      category: string,
      slugOrTargetRelativePath: string,
    ) => string;

    expect(
      fn(
        'lorebook/🌟이벤트_트리거/강유라.md',
        'lorebook-activation',
        'chains/lorebook-activation/🌟이벤트_트리거/강유라.md',
      ),
    ).toBe('../../chains/lorebook-activation/🌟이벤트_트리거/강유라.md');
  });

  it('entity → notes companion is two levels up', () => {
    const fn = entityToNotes as unknown as (
      sourceRelativePath: string,
      pathUnderNotes: string,
    ) => string;

    expect(fn('lorebook/🌟이벤트_트리거/강유라.md', 'lorebook/🌟이벤트_트리거/강유라.md')).toBe(
      '../../../notes/lorebook/🌟이벤트_트리거/강유라.md',
    );
  });

  it('chain → entity is two levels up', () => {
    expect(chainToEntity('lorebook/🌟이벤트_트리거/상태창.md')).toBe(
      '../../lorebook/🌟이벤트_트리거/상태창.md',
    );
  });

  it('chain → consolidated is two levels up', () => {
    expect(chainToConsolidated('lua.md')).toBe('../../lua.md');
  });

  it('chain → sibling chain category is one level up', () => {
    expect(chainToSiblingChain('variable-flow', 'hp')).toBe('../variable-flow/hp.md');
  });

  it('chain → notes is three levels up', () => {
    expect(chainToNotes('chains/상태창-flow.md')).toBe('../../../notes/chains/상태창-flow.md');
  });

  it('overview → notes is one level up', () => {
    expect(overviewToNotes('design-intent.md')).toBe('../notes/design-intent.md');
  });

  it('overview → companion artifact is two levels up into artifacts tree', () => {
    expect(overviewToCompanion('module_shop_dlc')).toBe(
      '../../module_shop_dlc/_generated/overview.md',
    );
  });

  it('overview → domain is three levels up', () => {
    expect(overviewToDomain('cbs.md')).toBe('../../../domain/cbs.md');
  });

  it('consolidated → notes is one level up', () => {
    expect(consolidatedToNotes('variables.md')).toBe('../notes/variables.md');
  });

  it('lorebook-index → notes is two levels up', () => {
    expect(lorebookIndexToNotes('lorebook/_index.md')).toBe('../../notes/lorebook/_index.md');
  });

  it('entity → extract source is five levels up (workspace root → extract dir)', () => {
    const fn = entityToExtractSource as unknown as (
      sourceRelativePath: string,
      extractDirName: string,
      pathInsideExtract: string,
    ) => string;

    expect(
      fn(
        'lorebook/🌟이벤트_트리거/강유라.md',
        'character_alternate-hunters-v2',
        'lorebooks/🌟이벤트_트리거/강유라.risulorebook',
      ),
    ).toBe(
      '../../../../../../character_alternate-hunters-v2/lorebooks/🌟이벤트_트리거/강유라.risulorebook',
    );
  });
});
