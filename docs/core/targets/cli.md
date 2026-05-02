# CLI 엔트리 (CLI Entry)

이 문서는 `risu-core` 실행 인터페이스와 최상위 명령어 라우팅(Command Routing)만을 다룹니다. 각 명령어 내부의 단계(Phase)와 상세 옵션의 의미론은 개별 명령어 워크플로우 파일과 관련 테스트에서 다룹니다.

## 현재 명세

- `packages/core/package.json`의 `bin.risu-core`는 `bin/risu-core.js`를 가리킵니다.
- `packages/core/bin/risu-core.js`는 빌드된 `dist/cli/main`의 `run` 함수를 로드한 후 `argv`를 전달합니다.
- `packages/core/src/cli/main.ts`는 `extract`, `pack`, `analyze`, `build`, `scaffold`를 최상위 명령어로 등록합니다.
- `packages/core/tests/cli-smoke.test.ts`는 바이너리 심(Shim) 기준 `--help` 출력 및 알 수 없는 명령어 요청 시의 종료 코드를 검증합니다.
- `packages/core/tests/cli-main-dispatch.test.ts`는 빌드된 디스패처(Dispatcher) 기준 최상위 도움말, 알 수 없는 명령어 처리, 주요 서브커맨드 진입 여부를 검증합니다.

## 라우팅 (Routing)

```text
Shell
  -> risu-core
  -> packages/core/bin/risu-core.js
  -> dist/cli/main.js run(argv)
  -> src/cli/main.ts COMMANDS
  -> 각 명령어 워크플로우
```

## 최상위 명령어 매핑

| 명령어 | 현재 라우팅 대상 | 현재 신뢰 기준(Source of Truth) 위치 |
|---|---|---|
| `extract` | `src/cli/extract/workflow.ts` | 파일/확장자 기반 분기, `--type` 우선 적용 규칙, 관련 테스트 |
| `pack` | `src/cli/pack/workflow.ts` | 기본 charx 처리, `--format module|preset` 분기 규칙 |
| `analyze` | `src/cli/analyze/workflow.ts` | `--type` 옵션, canonical marker 자동 감지, `compose` 명시 실행 규칙 |
| `build` | `src/cli/build/workflow.ts` | 단일 빌드 워크플로우 명세 |
| `scaffold` | `src/cli/scaffold/workflow.ts` | 첫 번째 인자 타입 및 옵션 파싱 규칙 |

`main.ts`는 등록(Registry) 및 디스패처 역할만을 수행합니다. 명령어별 상세 도움말, 옵션 파싱, 단계별 오케스트레이션은 각 워크플로우 파일에서 담당합니다.

## 명령어별 워크플로우 상세 정보 위치

| 주제 | 참조 파일 |
|---|---|
| 최상위 도움말 및 명령어 목록 | `../../packages/core/src/cli/main.ts`, `../../packages/core/tests/cli-main-dispatch.test.ts` |
| `extract` 타입 분기 규칙 | `../../packages/core/src/cli/extract/workflow.ts` |
| `pack` 포맷 분기 규칙 | `../../packages/core/src/cli/pack/workflow.ts` |
| `analyze` 타입 분기 및 자동 감지 | `../../packages/core/src/cli/analyze/workflow.ts`, `../../packages/core/tests/cli-main-dispatch.test.ts` |
| `scaffold` 타입 및 옵션 명세 | `../../packages/core/src/cli/scaffold/workflow.ts` |
| `build` 옵션 및 출력 명세 | `../../packages/core/src/cli/build/workflow.ts` |
| CLI 레이어 구조 설명 | `../../packages/core/src/cli/CLI.md` |

이 페이지는 위 파일들의 존재와 최상위 연결 구조만을 요약합니다. 각 워크플로우의 상세 단계 설명은 이 문서에서 중복하여 기술하지 않습니다.

## 현재 라우팅의 특징

- `extract`는 `--type` 옵션이 지정된 경우 이를 우선 적용하며, 없는 경우 파일 확장자와 JSON 형상을 분석하여 character/module/preset으로 분기합니다.
- `pack`은 `--format module|preset` 옵션이 지정된 경우 해당 워크플로우를 실행하며, 그 외의 경우는 character packer를 사용합니다.
- `analyze`는 `--type` 옵션을 최우선으로 참조하며, 없는 경우 `.lua`/`.risulua` 파일 및 표준 워크스페이스 마커(Canonical Workspace Marker)를 통해 자동으로 타입을 판별합니다.
- `analyze`의 `compose` 명령어는 자동 감지 대상이 아니며 반드시 명시적으로 호출해야 합니다.
- `scaffold`는 `charx|module|preset` 중 하나를 첫 번째 인자로 받아 새로운 프로젝트 구조를 생성합니다.

위 명세는 각각 `extract/workflow.ts`, `pack/workflow.ts`, `analyze/workflow.ts`, `scaffold/workflow.ts` 구현에서 직접 확인할 수 있습니다.

## 이 엔트리가 보장하지 않는 사항

- 각 명령어의 모든 단계별 상세 동작
- 각 출력 포맷의 전체 스키마(Schema)
- 도메인 헬퍼 상세 의미론
- Node.js 하위 경로 내보내기 상세 설명

상기 내용은 관련 워크플로우 파일, [`../root-browser.md`](root-browser.md), [`node-entry.md`](node-entry.md), [`../domains/analyze/README.md`](../domains/analyze/README.md), [`../node/README.md`](../node/README.md)를 참조하십시오.

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
