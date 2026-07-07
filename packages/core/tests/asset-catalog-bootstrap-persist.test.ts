import { describe, expect, it } from 'vitest';
import { createDefaultAssetCatalog, type AssetCatalog } from '../src/domain/asset/catalog';
import { bootstrapAssetCatalogFromEntries } from '../src/node/asset-catalog-bootstrap';

describe('asset catalog bootstrap persist', () => {
  it('preserves the bootstrap section across full and missing bootstrap runs', () => {
    const catalog: AssetCatalog = {
      ...createDefaultAssetCatalog(),
      bootstrap: { separator: '_', slotTokenCounts: { s1: 1 } },
    };
    const entries = [{ path: 'additional/rin_angry.png', name: 'rin_angry' }];

    const full = bootstrapAssetCatalogFromEntries(catalog, entries, { mode: 'full' });
    expect(full.bootstrap).toEqual({ separator: '_', slotTokenCounts: { s1: 1 } });

    const missing = bootstrapAssetCatalogFromEntries(full, entries, { mode: 'missing' });
    expect(missing.bootstrap).toEqual({ separator: '_', slotTokenCounts: { s1: 1 } });
  });
});
