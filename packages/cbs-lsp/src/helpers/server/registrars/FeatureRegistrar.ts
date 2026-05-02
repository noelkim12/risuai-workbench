/**
 * server feature registrar 공통 seam 정의.
 * @file packages/cbs-lsp/src/helpers/server/registrars/FeatureRegistrar.ts
 */

export interface FeatureRegistrar {
  register(): void;
}
