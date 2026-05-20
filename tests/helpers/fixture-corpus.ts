/**
 * Shared fixture corpus helpers for DRY extraction of common patterns.
 *
 * Both `packages/core/tests/custom-extension/fixture-corpus.ts` and
 * `packages/cbs-lsp/tests/fixtures/fixture-corpus.ts` repeat the same
 * base type fields (`id`, `label`, `relativePath`, `features`),
 * `Object.freeze(seeds.map(...))` construction, list-by-filter, and
 * get-by-id-with-error-message logic. This module centralises those
 * without touching any package source barrel or public exports.
 *
 * @file tests/helpers/fixture-corpus.ts
 */

import path from 'node:path';

// ---------------------------------------------------------------------------
// Base type
// ---------------------------------------------------------------------------

/**
 * Fields shared by every fixture corpus entry regardless of domain.
 *
 * Both core custom-extension and cbs-lsp corpora carry `id`, `label`,
 * `relativePath`, and `features` with the same types.  Each domain
 * extends this with its own extra fields.
 */
export interface BaseFixtureCorpusEntry {
  /** Stable identifier used as lookup key across tests. */
  readonly id: string;
  /** Human-readable label for snapshot / diagnostic output. */
  readonly label: string;
  /** Path relative to the relevant workspace root or virtual prefix. */
  readonly relativePath: string;
  /** Feature tags used for matrix filtering and coverage checks. */
  readonly features: readonly string[];
}

// ---------------------------------------------------------------------------
// Repository root resolver
// ---------------------------------------------------------------------------

/**
 * resolveFixtureRepositoryRoot 함수.
 * fixture helper 파일 위치를 기준으로 저장소 루트를 계산해 테스트 실행 cwd 의존을 제거함.
 *
 * @returns 현재 저장소 루트 절대 경로
 */
export function resolveFixtureRepositoryRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

// ---------------------------------------------------------------------------
// Frozen corpus builder
// ---------------------------------------------------------------------------

/**
 * freezeCorpusMap 함수.
 * seed 배열을 mapper 함수로 변환한 뒤 `Object.freeze`로 고정해
 * 테스트 전반에서 불변 fixture 목록으로 사용할 수 있게 만듦.
 *
 * @param seeds - 원본 seed 데이터 배열
 * @param mapper - 각 seed를 최종 entry 형태로 변환하는 함수
 * @returns frozen된 fixture corpus 읽기 전용 배열
 */
export function freezeCorpusMap<TSeed, TEntry>(
  seeds: readonly TSeed[],
  mapper: (seed: TSeed, index: number) => TEntry,
): readonly TEntry[] {
  return Object.freeze(seeds.map(mapper));
}

// ---------------------------------------------------------------------------
// List-by-filter helper
// ---------------------------------------------------------------------------

/**
 * filterCorpusEntries 함수.
 * 전체 corpus에서 optional filter predicate를 만족하는 entry만 골라서 반환.
 * filter가 없으면 전체 corpus를 그대로 반환.
 *
 * @param corpus - 조회할 전체 fixture corpus
 * @param filter - optional 필터 predicate. 생략하면 전체 반환
 * @returns 조건에 맞는 fixture entry 목록
 */
export function filterCorpusEntries<TEntry>(
  corpus: readonly TEntry[],
  filter?: ((entry: TEntry) => boolean) | undefined,
): readonly TEntry[] {
  if (!filter) {
    return corpus;
  }
  return corpus.filter(filter);
}

// ---------------------------------------------------------------------------
// Get-by-id throw helper
// ---------------------------------------------------------------------------

/**
 * getCorpusEntryOrThrow 함수.
 * corpus에서 id가 일치하는 entry를 찾고, 없으면 지정된 에러 메시지로 throw.
 *
 * @param corpus - 조회할 전체 fixture corpus
 * @param id - 찾고 싶은 fixture entry id
 * @param errorMessage - entry를 찾지 못했을 때 throw할 에러 메시지
 * @returns id와 일치하는 fixture entry
 * @throws id가 corpus에 없을 때 지정된 에러 메시지의 Error
 */
export function getCorpusEntryOrThrow<TEntry extends { readonly id: string }>(
  corpus: readonly TEntry[],
  id: string,
  errorMessage: string,
): TEntry {
  const entry = corpus.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(errorMessage);
  }
  return entry;
}
