# Core Test Strategy

`packages/core`는 `packages/vscode`가 의존하는 공용 런타임이다. 따라서 core 테스트 전략의 목적은 단순한 함수 검증이 아니라, 카드 포맷 처리/파일 워크플로우/확장 연동 경계를 안정적으로 고정하는 것이다.

## 현재 상태

- 테스트 러너는 Vitest를 사용한다.
- 현재 테스트는 import smoke 수준에 가깝다.
- 실제 동작은 순수 함수와 Node I/O 함수가 함께 존재한다.
- `packages/vscode`는 `risu-workbench-core`를 의존하지만, 아직 extension-core seam 테스트는 없다.

핵심 근거 파일:

- `packages/core/package.json`
- `packages/core/vitest.config.ts`
- `packages/core/tests/smoke.test.ts`
- `packages/core/src/shared/analyze-helpers.ts`
- `packages/core/src/shared/uri-resolver.ts`
- `packages/core/src/shared/risu-api.ts`
- `packages/core/src/shared/extract-helpers.ts`

## 목표

- 포맷 파싱과 변환 로직을 빠른 unit test로 잠근다.
- 파일 시스템, Buffer, CLI, 실제 폴더 구조가 개입되는 부분은 integration test로 검증한다.
- VSCode extension이 core의 public contract만 사용하도록 경계를 유지한다.
- 실제 RisuAI 샘플 파일은 느린 regression 검증에만 제한적으로 사용한다.

## 기본 원칙

1. 대부분의 테스트는 synthetic fixture 기반으로 작성한다.
2. 실제 샘플(`test_cases/`)은 기본 테스트 레인에 넣지 않는다.
3. snapshot 중심 테스트보다 구조적 invariant 검증을 우선한다.
4. extension에서 parsing/packing 로직을 재구현하지 않고 core public API로만 접근한다.
5. 버그가 경계를 가로지르면 seam integration test를 먼저 추가하고, 그 아래 unit test를 보강한다.

## 권장 테스트 비율

- Unit: 65%
- Integration: 25%
- Smoke: 10%

이 비율은 고정 숫자라기보다 우선순위다. 새 기능을 추가할 때는 먼저 unit test로 핵심 로직을 잠그고, 이후 필요한 integration만 추가한다.

## 테스트 레이어

### 1. Unit Tests

대상:

- 순수 문자열/배열/객체 변환 로직
- 포맷 판별 및 branch-heavy helper
- invalid input 처리
- folder map 및 CBS 추출 규칙

우선 대상 파일:

- `packages/core/src/shared/analyze-helpers.ts`
- `packages/core/src/shared/uri-resolver.ts`
- `packages/core/src/shared/risu-api.ts` 중 pure function 영역

대표 케이스:

- `extractCBSVarOps`가 read/write 집합을 올바르게 분리하는지
- `buildFolderMap`과 `resolveFolderName`이 fallback과 name transform을 올바르게 적용하는지
- `resolveAssetUri`가 `__asset:`, `embeded://`, `embedded://`, `ccdefault:`, `data:`, `https://`를 구분하는지
- `guessMimeExt`가 알려진 mime과 unknown mime을 올바르게 처리하는지
- Lua AST helper가 null/unknown node를 안전하게 처리하는지

### 2. Integration Tests

대상:

- `fs`, `path`, `Buffer`, temp directory를 사용하는 로직
- 카드 파일 파싱, 추출 폴더 구성, 파일 쓰기 흐름
- CLI 또는 workflow 조립 로직

우선 대상 파일:

- `packages/core/src/shared/risu-api.ts`의 `parseCardFile`
- `packages/core/src/shared/extract-helpers.ts`
- `packages/core/scripts/*`

대표 케이스:

- tiny JSON/PNG fixture를 이용한 `parseCardFile` 성공/실패 경로
- `writeJson`, `writeText`, `writeBinary`, `uniquePath`의 실제 파일 출력
- 최소 추출 폴더 트리에서 manifest/order 파일을 읽고 pack/extract 흐름이 깨지지 않는지
- 잘못된 포맷이나 손상된 입력이 들어올 때 non-fatal 또는 명시적 실패가 유지되는지

### 3. Smoke Tests

대상:

- public entry import
- CLI wiring
- extension-core 연결

대표 케이스:

- `packages/core` public import smoke
- `risu-core --help`
- 잘못된 subcommand 또는 잘못된 인자 처리
- 추후 `packages/vscode`가 실제로 core API를 호출하기 시작하면 extension activation + core import smoke 추가

Smoke test는 매우 적게 유지한다. 목적은 세부 로직 검증이 아니라, 배포 직전 wiring이 끊어지지 않았는지 확인하는 것이다.

## Fixture Strategy

### Tier 1. Synthetic Fixtures (기본)

기본 테스트는 작은 synthetic fixture를 사용한다.

- 손으로 만든 tiny JSON card
- 최소 PNG chunk buffer
- 최소 extracted tree
- temp directory factory

장점:

- 빠르다
- 실패 원인 추적이 쉽다
- 테스트 의도가 선명하다

### Tier 2. Real Sample Fixtures (회귀 전용)

`test_cases/`의 실제 RisuAI 캐릭터 카드 파일은 regression 검증에만 사용한다.

사용 기준:

- synthetic fixture만으로 놓치기 쉬운 실제 포맷 편차를 잡고 싶을 때
- extract -> pack 또는 parse -> analyze 같은 end-to-end invariant를 확인할 때
- 이전에 실제 샘플에서 발생한 버그를 회귀 테스트로 고정할 때

주의:

- 기본 unit 테스트 레인에는 포함하지 않는다.
- workspace 정책상 `test_cases/` 스캔은 사용자가 명시적으로 요청하거나 해당 샘플 테스트가 필요한 작업에서만 수행한다.
- 실제 샘플 테스트는 느린 lane 또는 명시적 regression suite로 분리하는 것이 좋다.

## Core Boundary Rules

`packages/core`는 장기적으로 `domain` / `node` / `cli` 경계로 분리하는 것이 좋다. 테스트도 이 경계를 따라 정리한다.

- `domain`: 순수 로직, 포맷 규칙, 데이터 변환, parser helper
- `node`: 파일 시스템, 경로 처리, Buffer, 실제 입출력
- `cli`: 인자 파싱, exit code, console wiring

현재는 이 경계가 폴더 구조로 완전히 분리되어 있지 않으므로, 테스트 분류는 폴더명이 아니라 동작 성격 기준으로 나눈다.

또한 `packages/vscode`는 다음 규칙을 지킨다.

- core의 public entry만 사용한다.
- `packages/core/scripts`를 직접 import하지 않는다.
- parsing/packing/analyze 규칙을 extension 쪽에서 재구현하지 않는다.

## 권장 테스트 디렉토리 구조

```text
packages/core/tests/
  smoke/
  unit/
  integration/
  fixtures/
    synthetic/
    regression/
```

권장 운영 방식:

- `unit/`: 빠른 기본 레인
- `integration/`: temp dir, file I/O 포함
- `smoke/`: import/CLI/entry wiring
- `fixtures/regression/`: 필요 시 실제 샘플 기반 데이터 또는 golden outputs

## 우선순위

1. `uri-resolver`, `analyze-helpers`, `extractCBSVarOps`, `buildFolderMap` unit test 확장
2. `parseCardFile`, file writer 계열 integration test 추가
3. CLI smoke 추가
4. 실제 샘플 기반 regression suite 분리
5. core runtime boundary 재구성 이후 domain/node/cli별 테스트 책임 재정렬

## 하지 말아야 할 것

- 콘솔 출력 전체를 snapshot으로 고정하기
- HTML 리포트 전체를 대형 snapshot으로 비교하기
- 실제 샘플 파일만으로 테스트 체계를 구성하기
- extension 쪽 테스트에서 core 내부 구현 세부사항까지 직접 검증하기

## 성공 기준

다음 조건을 만족하면 core 테스트 전략이 제대로 자리잡은 것으로 본다.

- 순수 helper 변경이 빠른 unit test에서 바로 잡힌다.
- 카드 파일/폴더 구조 관련 회귀가 integration test에서 재현된다.
- CLI와 extension wiring 문제를 smoke test가 빠르게 감지한다.
- 실제 sample card는 느린 regression lane에서만 사용된다.
- extension 변경이 core contract를 우회하지 않는다.
