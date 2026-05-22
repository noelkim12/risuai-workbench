/**
 * Generated-only mutation allowlist stubs for future validators and handlers.
 * @file packages/risuai-workbench-mcp/src/mutation/validation-allowlist.ts
 */

const SOURCE_ARTIFACT_PATTERNS = [/^characters\//, /^modules\//, /^presets\//, /\.risu(?:char|module|preset|lorebook)$/];

const GENERATED_WIKI_PATTERNS = [
  /^wiki\/artifacts\/[^/]+\/_generated\//,
  /^wiki\/SCHEMA\.md$/,
  /^wiki\/_schema\//,
  /^wiki\/_index\.md$/,
  /^wiki\/_log\.md$/,
];

const PROTECTED_MANUAL_PATTERNS = [/^wiki\/notes\//, /^wiki\/domain\//, /^workspace\.yaml$/];

/**
 * normalizePolicyPath 함수.
 * allowlist 검사에 사용할 portable relative path로 정규화함.
 *
 * @param relativePath - workspace-relative path
 * @returns slash-normalized relative path
 */
function normalizePolicyPath(relativePath: string): string {
  return relativePath.split('\\').join('/');
}

/**
 * isSourceArtifactPath 함수.
 * source artifact로 간주되는 path인지 판정함.
 *
 * @param relativePath - workspace-relative path
 * @returns source artifact path 여부
 */
export function isSourceArtifactPath(relativePath: string): boolean {
  const normalized = normalizePolicyPath(relativePath);
  return SOURCE_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * isGeneratedMutationAllowedPath 함수.
 * generated-only mode에서 허용되는 생성 산출물 path인지 판정함.
 *
 * @param relativePath - workspace-relative path
 * @returns generated-only allowlist 통과 여부
 */
export function isGeneratedMutationAllowedPath(relativePath: string): boolean {
  const normalized = normalizePolicyPath(relativePath);
  if (SOURCE_ARTIFACT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  if (PROTECTED_MANUAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return GENERATED_WIKI_PATTERNS.some((pattern) => pattern.test(normalized));
}
