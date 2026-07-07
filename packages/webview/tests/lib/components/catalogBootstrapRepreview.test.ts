import { describe, expect, it } from 'vitest';
import appSource from '../../../src/AssetManagerApp.svelte?raw';
import modalSource from '../../../src/lib/components/asset-manager/CatalogBootstrapModal.svelte?raw';

// 회귀 가드: catalog 없는 프로젝트에서 bootstrap modal이 watcher 스냅샷보다 먼저 뜨면
// 미리보기가 비어 보인다. 스냅샷이 갱신될 때마다 modal이 preview를 다시 요청해야 한다.
describe('CatalogBootstrapModal re-preview on snapshot refresh', () => {
  it('AssetManagerApp bumps a snapshot revision and passes it to the modal', () => {
    expect(appSource).toContain('snapshotRevision');
    expect(appSource).toContain('assetRevision={snapshotRevision}');
  });

  it('modal refreshes its preview when the asset revision changes after mount', () => {
    expect(modalSource).toContain('export let assetRevision');
    expect(modalSource).toContain('seenAssetRevision');
    expect(modalSource).toMatch(/seenAssetRevision[\s\S]{0,200}refreshPreview\(\)/);
  });
});
