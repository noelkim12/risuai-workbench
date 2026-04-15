import { describe, expect, it } from 'vitest';
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
  it('entity → sibling entity is flat filename', () => {
    expect(entityToSiblingEntity('이하은')).toBe('이하은.md');
  });

  it('entity → consolidated is one level up', () => {
    expect(entityToConsolidated('variables')).toBe('../variables.md');
  });

  it('entity → chain goes up one then into chains', () => {
    expect(entityToChain('lorebook-activation', '헌터_협회')).toBe(
      '../chains/lorebook-activation/헌터_협회.md',
    );
  });

  it('entity → notes companion is two levels up', () => {
    expect(entityToNotes('lorebook/강유라.md')).toBe('../../notes/lorebook/강유라.md');
  });

  it('chain → entity is two levels up', () => {
    expect(chainToEntity('상태창')).toBe('../../lorebook/상태창.md');
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
    expect(
      entityToExtractSource('character_alternate-hunters-v2', 'lorebooks/강유라.risulorebook'),
    ).toBe('../../../../../character_alternate-hunters-v2/lorebooks/강유라.risulorebook');
  });
});
