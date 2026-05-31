/**
 * Validate domain barrel — validation, path building, and test suggestion handlers.
 * @file packages/risuai-workbench-mcp/src/tools/validate/index.ts
 */

export { handleValidateArtifact } from './validate-artifact';
export { handleValidateOrder } from './validate-order';
export { handleValidateRootMarkers } from './validate-root-markers';
export { handleValidateMetadata } from './validate-metadata';
export { handleValidateFrontmatter } from './validate-frontmatter';
export { handleValidatePath } from './validate-path';
export { handleBuildPath } from './build-path';
export { handleSuggestTests } from './suggest-tests';
export { handleValidateCbsSyntax } from './validate-cbs-syntax';
