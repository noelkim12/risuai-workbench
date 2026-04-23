# core 문서 testing and evidence 규칙

이 문서는 `docs/core/` 페이지가 문장을 코드와 테스트에 어떻게 묶어야 하는지 정한다. 목표는 과장 없는 현재 truth다.

## 기본 원칙

- 구현 근거와 테스트 근거를 같이 쓴다.
- 구현만 있고 테스트가 없으면 `현재 구현`, `코드 기준`처럼 적는다.
- 테스트까지 있으면 `고정한다`, `검증한다`, `보장 범위`처럼 적을 수 있다.
- 아직 없는 동작, 미래 리팩터링 의도, 희망사항은 계약처럼 쓰지 않는다.

## 근거 우선순위

| 근거 종류 | 문서에서의 쓰임 |
|---|---|
| `packages/core/package.json`, `src/index.ts`, `src/node/index.ts`, `src/cli/main.ts` | public entry, bin, routing, 현재 export 경로 설명 |
| workflow 구현 파일 | 커맨드별 라우팅, 옵션 해석, auto-detect, phase 위임 설명 |
| `packages/core/tests/*` | help text, exit code, export surface, 대표 경계 검증 |
| 보조 구조 문서 | 배경 설명 정도만 허용, public truth 판정은 불가 |

## 문장 작성 규칙

### 이렇게 쓴다

- `packages/core/src/cli/main.ts`는 현재 `extract`, `pack`, `analyze`, `build`, `scaffold`를 디스패치한다.
- `packages/core/tests/cli-main-dispatch.test.ts`는 top-level help, unknown command, 대표 서브커맨드 진입을 검증한다.
- `packages/core/src/cli/analyze/workflow.ts` 기준 `compose`는 auto-detect 없이 `--type compose`로만 들어간다.

### 이렇게 쓰지 않는다

- `CLI는 모든 워크플로우를 안정적으로 문서화한다.`
- `analyze는 어떤 workspace도 자동 판별한다.`
- `node entry는 모든 Node helper를 완전히 보장한다.`

위 세 문장은 코드나 테스트가 직접 증명하지 않거나 범위가 너무 넓다.

## claim 등급

| 등급 | 언제 쓰나 | 예시 |
|---|---|---|
| 구현 관찰 | 코드만 확인했을 때 | `현재 구현은 ...` |
| 테스트 고정 | 테스트가 직접 확인할 때 | `...를 검증한다` |
| 문서 경계 | 이 페이지가 일부러 다루지 않을 때 | `이 페이지는 ...를 다루지 않는다` |

## 테스트를 anchor로 거는 방식

- entry 문서는 대표 contract test를 먼저 건다. 예: `root-entry-contract.test.ts`, `node-entry.test.ts`, `cli-main-dispatch.test.ts`.
- subtree/leaf 문서는 해당 helper나 analyzer를 직접 검증하는 테스트를 건다. 예: `token-budget.test.ts`, `variable-flow.test.ts`, `cli-smoke.test.ts`.
- snapshot test가 exported key set이나 help text를 고정하면, 문서에서는 `실제 exported key set snapshot`, `help output`처럼 범위를 좁혀 적는다.

## CLI 관련 wording 규칙

- `risu-core`는 executable boundary다. root import나 `./node` subpath와 섞어 쓰지 않는다.
- top-level dispatch는 `src/cli/main.ts`와 `cli-main-dispatch.test.ts` 기준으로 설명한다.
- command-specific workflow truth는 각 `src/cli/<command>/workflow.ts`와 관련 테스트로 보낸다.
- 각 커맨드의 모든 phase를 `targets/cli.md`에 길게 복사하지 않는다. entry boundary와 진입 라우팅만 요약한다.

## 링크 규칙

- 문서 안의 탐색 링크는 상대 경로만 쓴다.
- 근거 파일은 코드 블록이나 인라인 코드로 적어도 되지만, 문서 페이지를 가리킬 때는 링크를 우선 쓴다.

## 빠른 체크리스트

- 이 문장이 코드에서 직접 보이나?
- 테스트가 같은 범위를 검증하나?
- 구현 관찰과 보장 문구를 구분했나?
- 이 페이지가 소유하지 않는 내용을 leaf나 다른 target으로 넘겼나?
