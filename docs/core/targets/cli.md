# CLI entry

이 문서는 `risu-core` 실행 경계와 top-level command routing만 다룬다. 각 커맨드 내부 phase와 상세 옵션 의미론은 command workflow 파일과 관련 테스트로 넘긴다.

## 현재 계약

- `packages/core/package.json`의 `bin.risu-core`는 `bin/risu-core.js`를 가리킨다.
- `packages/core/bin/risu-core.js`는 built `dist/cli/main`의 `run` 함수를 로드한 뒤 argv를 넘긴다.
- `packages/core/src/cli/main.ts`는 `extract`, `pack`, `analyze`, `build`, `scaffold`를 top-level command로 등록한다.
- `packages/core/tests/cli-smoke.test.ts`는 바이너리 shim 기준 `--help`와 unknown command exit code를 확인한다.
- `packages/core/tests/cli-main-dispatch.test.ts`는 built dispatcher 기준 top-level help, unknown command, 대표 서브커맨드 진입을 검증한다.

## routing

```text
shell
  -> risu-core
  -> packages/core/bin/risu-core.js
  -> dist/cli/main.js run(argv)
  -> src/cli/main.ts COMMANDS
  -> 각 command workflow
```

## top-level command 매핑

| command | 현재 라우팅 대상 | 현재 truth가 있는 곳 |
|---|---|---|
| `extract` | `src/cli/extract/workflow.ts` | 파일/확장자 기반 분기, `--type` 우선, 관련 tests |
| `pack` | `src/cli/pack/workflow.ts` | 기본 charx, `--format module|preset` 분기 |
| `analyze` | `src/cli/analyze/workflow.ts` | `--type`, canonical marker auto-detect, `compose` explicit only |
| `build` | `src/cli/build/workflow.ts` | 단일 build workflow |
| `scaffold` | `src/cli/scaffold/workflow.ts` | 첫 인수 type + 옵션 파싱 |

`main.ts`는 registry와 dispatcher 역할만 한다. command별 세부 help, 옵션 파싱, phase orchestration은 각 workflow가 소유한다.

## command-specific workflow truth는 어디에 있나

| 주제 | 먼저 볼 파일 |
|---|---|
| top-level help와 command 목록 | `../../packages/core/src/cli/main.ts`, `../../packages/core/tests/cli-main-dispatch.test.ts` |
| extract type 분기 | `../../packages/core/src/cli/extract/workflow.ts` |
| pack format 분기 | `../../packages/core/src/cli/pack/workflow.ts` |
| analyze type 분기와 auto-detect | `../../packages/core/src/cli/analyze/workflow.ts`, `../../packages/core/tests/cli-main-dispatch.test.ts` |
| scaffold 타입/옵션 | `../../packages/core/src/cli/scaffold/workflow.ts` |
| build 옵션과 출력 | `../../packages/core/src/cli/build/workflow.ts` |
| CLI 레이어 구조 설명 | `../../packages/core/src/cli/CLI.md` |

이 페이지는 위 파일들의 존재와 top-level 연결만 요약한다. 각 workflow phase 설명을 여기서 다시 복제하지 않는다.

## 현재 라우팅에서 바로 말할 수 있는 것

- `extract`는 `--type`이 있으면 우선 적용하고, 없으면 파일 확장자와 JSON shape를 보고 character/module/preset으로 보낸다.
- `pack`은 `--format module|preset`일 때 해당 workflow로 보내고, 그 외는 character packer로 간다.
- `analyze`는 `--type`을 우선 읽고, 없으면 `.lua`/`.risulua`와 canonical workspace marker로 auto-detect한다.
- `analyze`의 `compose`는 auto-detect 대상이 아니다.
- `scaffold`는 `charx|module|preset` 첫 인수를 받아 새 프로젝트 구조를 만든다.

위 문장들은 각각 `extract/workflow.ts`, `pack/workflow.ts`, `analyze/workflow.ts`, `scaffold/workflow.ts`에 직접 보인다.

## 이 entry가 보장하지 않는 것

- 각 command의 모든 phase 세부
- 각 출력 포맷의 전체 schema
- domain helper 의미론
- Node subpath export 설명

그 내용은 관련 workflow 파일, [`../root-browser.md`](root-browser.md), [`node-entry.md`](node-entry.md), [`../domains/analyze/README.md`](../domains/analyze/README.md), [`../node/README.md`](../node/README.md)로 보낸다.

## 언제 이 페이지를 먼저 읽나

| 작업 유형 | 이유 |
|---|---|
| `risu-core` 소개 문구 수정 | 실행 경계가 bin과 dispatcher에 걸쳐 있기 때문 |
| CLI와 library import 경계 설명 | executable과 import surface를 분리해야 하기 때문 |
| command routing 요약 수정 | top-level registry와 각 workflow 연결을 먼저 맞춰야 하기 때문 |

## 관련 근거 파일

- `../../packages/core/package.json`
- `../../packages/core/bin/risu-core.js`
- `../../packages/core/src/cli/main.ts`
- `../../packages/core/src/cli/extract/workflow.ts`
- `../../packages/core/src/cli/pack/workflow.ts`
- `../../packages/core/src/cli/analyze/workflow.ts`
- `../../packages/core/src/cli/build/workflow.ts`
- `../../packages/core/src/cli/scaffold/workflow.ts`
- `../../packages/core/src/cli/CLI.md`
- `../../packages/core/tests/cli-smoke.test.ts`
- `../../packages/core/tests/cli-main-dispatch.test.ts`

## 같이 읽을 문서

- [`../common/principles.md`](../common/principles.md)
- [`../common/testing-and-evidence.md`](../common/testing-and-evidence.md)
- [`root-browser.md`](root-browser.md)
- [`node-entry.md`](node-entry.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
- [`../node/README.md`](../node/README.md)
