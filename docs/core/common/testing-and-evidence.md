# core 문서 검증 및 근거(Evidence) 규칙

이 문서는 `docs/core/` 하위 페이지에서 기술하는 문장을 코드와 테스트에 어떻게 결합해야 하는지 정의합니다. 목표는 과장 없는 '있는 그대로의 사실'을 기록하는 것입니다.

## 기본 원칙

- 구현 근거와 테스트 근거를 병기합니다.
- 구현만 존재하고 테스트가 없는 경우 `현재 구현상`, `코드 기준` 등으로 명시합니다.
- 테스트가 뒷받침되는 경우 `확정한다`, `검증한다`, `보장 범위` 등의 표현을 사용할 수 있습니다.
- 아직 구현되지 않은 동작, 미래의 리팩터링 의도, 희망 사항은 확정된 명세처럼 기술하지 않습니다.

## 근거 우선순위

| 근거 종류 | 활용 범위 |
|---|---|
| `packages/core/package.json`, `src/index.ts`, `src/node/index.ts`, `src/cli/main.ts` | 공개 엔트리, 바이너리, 라우팅, 현재 내보내기(Export) 경로 명시 |
| 워크플로우 구현 파일 | 커맨드별 라우팅, 옵션 해석, 자동 감지(Auto-detect), 단계(Phase) 위임 상세 |
| `packages/core/tests/*` | 도움말 텍스트, 종료 코드(Exit code), 내보내기 인터페이스, 주요 경계 검증 |
| 보조 구조 문서 | 배경 설명 용도로만 제한적 허용 (공개 명세 판정 근거로는 사용 불가) |

## 문장 작성 규칙

### 권장 사례

- `packages/core/src/cli/main.ts`는 현재 `extract`, `pack`, `analyze`, `build`, `scaffold`를 디스패치합니다.
- `packages/core/tests/cli-main-dispatch.test.ts`는 최상위 도움말, 알 수 없는 명령어 처리, 주요 서브커맨드 진입 여부를 검증합니다.
- `packages/core/src/cli/analyze/workflow.ts` 기준 `compose`는 자동 감지 없이 `--type compose` 옵션을 통해서만 실행됩니다.

### 지양 사례

- `CLI는 모든 워크플로우를 안정적으로 문서화한다.`
- `analyze는 어떤 작업 공간(Workspace)도 자동으로 판별한다.`
- `node 엔트리는 모든 Node 헬퍼를 완벽히 보장한다.`

위 문장들은 코드나 테스트가 직접 증명하지 못하거나, 보장 범위가 지나치게 포괄적입니다.

## 주장(Claim) 등급

| 등급 | 사용 시점 | 예시 |
|---|---|---|
| 구현 관찰 | 코드 레벨에서만 확인된 사실 | `현재 구현은 ...` |
| 테스트 확정 | 테스트 코드가 직접 검증하는 사실 | `...를 검증한다`, `...를 확정한다` |
| 문서 경계 | 의도적으로 범위를 제한할 때 | `이 페이지는 ...를 다루지 않는다` |

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
