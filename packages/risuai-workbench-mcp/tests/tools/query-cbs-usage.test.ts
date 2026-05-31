import { describe, expect, it } from 'vitest';
import { handleQueryCbsUsage } from '../../src/tools/analyze/query-cbs-usage';

describe('handleQueryCbsUsage', () => {
  it('returns metadata for getvar', async () => {
    const result = await handleQueryCbsUsage({ tag: 'getvar' });
    expect(result.data?.found).toBe(true);
    expect(result.data?.name).toBe('getvar');
    expect(result.data?.aliases.length).toBeGreaterThanOrEqual(0);
    expect(result.data?.arguments.length).toBeGreaterThanOrEqual(1);
  });

  it('returns found false for unknown tag', async () => {
    const result = await handleQueryCbsUsage({ tag: 'notarealtag' });
    expect(result.data?.found).toBe(false);
    expect(result.data?.name).toBeNull();
  });

  it('resolves aliases (e.g., bot → char)', async () => {
    const result = await handleQueryCbsUsage({ tag: 'bot' });
    expect(result.data?.found).toBe(true);
    expect(result.data?.canonicalName).toBe('char');
  });

  it('returns index-aware fields for known tags', async () => {
    const result = await handleQueryCbsUsage({ tag: 'char' });

    expect(result.status).toBe('ok');
    expect(result.data?.found).toBe(true);
    expect(result.data).toMatchObject({
      category: 'identity',
      categoryUri: 'risuai-workbench://cbs/category/identity',
      detailUri: 'risuai-workbench://cbs/tag/char',
    });
    expect(result.data?.relatedTags).toContain('user');
    expect(result.data?.suggestions).toEqual([]);
  });

  it('returns suggestions for unknown partial tags', async () => {
    const result = await handleQueryCbsUsage({ tag: 'cha' });

    expect(result.status).toBe('ok');
    expect(result.data?.found).toBe(false);
    expect(result.data?.suggestions).toContain('char');
  });
});
