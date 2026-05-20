/**
 * Private regression fixture paths are resolved from environment variables.
 * @file tests/helpers/private-fixture-paths.ts
 */

import path from 'node:path';

import { resolveFixtureRepositoryRoot } from './fixture-corpus';

const externalFixturePlaceholderRoot = '__external_private_fixtures__';

/**
 * resolvePrivateFixturePath 함수.
 * 실제 regression fixture 경로는 환경변수에서만 읽고, 소스에는 익명 slot만 남김.
 *
 * @param envVar - 실제 fixture 경로를 제공하는 환경변수 이름
 * @param slot - 환경변수가 없을 때 사용할 익명 placeholder slot
 * @returns 절대 경로로 정규화된 fixture 후보 경로
 */
export function resolvePrivateFixturePath(envVar: string, slot: string): string {
  const configuredPath = process.env[envVar];
  const fixturePath = configuredPath ?? path.posix.join(externalFixturePlaceholderRoot, slot);

  return path.isAbsolute(fixturePath)
    ? fixturePath
    : path.join(resolveFixtureRepositoryRoot(), fixturePath);
}

/**
 * resolvePrivateFixturePaths 함수.
 * 여러 env var / slot 쌍을 같은 규칙으로 fixture 후보 경로 배열로 변환함.
 *
 * @param fixtures - 환경변수 이름과 익명 slot 쌍 목록
 * @returns 절대 경로로 정규화된 fixture 후보 경로 배열
 */
export function resolvePrivateFixturePaths(
  fixtures: readonly { readonly envVar: string; readonly slot: string }[],
): string[] {
  return fixtures.map((fixture) => resolvePrivateFixturePath(fixture.envVar, fixture.slot));
}
