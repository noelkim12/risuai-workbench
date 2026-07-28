# risuai-workbench-mcp 문서 인덱스

> npm package: `@risuai-workbench/mcp`. RisuAI와 제휴·승인되지 않은 비공식 companion 도구입니다.

이 패키지는 RisuAI Workbench의 canonical workspace를 AI agent가 안전하게 읽고, 검증하고, 필요한 경우 승인된 patch plan으로 수정할 수 있게 해 주는 local stdio MCP server입니다. 이 README는 패키지 문서를 탐색하는 진입점이며, 세부 사용법은 주제별 문서로 분리되어 있습니다.

문서의 신뢰 기준(Source of Truth)은 `packages/risuai-workbench-mcp/src/`, `package.json`, 테스트, 그리고 실제 MCP client 동작입니다. README는 운영 흐름을 한눈에 고르는 인덱스 역할만 합니다.

## 이 문서는 왜 나뉘었나

- MCP package는 설치, client 설정, facade tool surface, archive 추출, mutation safety, troubleshooting, 개발 명령이 한 번에 섞이기 쉽습니다.
- 대부분의 사용자는 처음에 설정과 기본 흐름만 필요하고, agent나 maintainer는 facade 내부 구조와 안전 경계를 별도로 확인해야 합니다.
- README에는 페이지 선택 기준만 남기고, 반복되는 명령·표·주의사항은 `docs/` 하위 문서로 이동해 관심사를 분리합니다.

## 디렉토리 구조

```text
packages/risuai-workbench-mcp/
├── README.md                  ← 이 파일. 인덱스 + 탐색 가이드
├── README-reference.md        ← 상세 운영/구현 reference
├── docs/
│   ├── README.md              ← MCP package 문서 묶음 인덱스
│   ├── setup.md               ← 요구사항, 빌드, MCP client 설정
│   ├── workflows.md           ← 기본 facade 흐름과 archive 추출
│   ├── facade-tools.md        ← 공개 facade tool 8개의 역할
│   ├── risulua-runtime.md     ← Fengari runtime action, source/context, trace 흐름
│   ├── mutation-safety.md     ← patch preview/apply와 파일 변경 안전성
│   ├── troubleshooting.md     ← 자주 발생하는 문제와 점검 순서
│   └── development.md         ← CLI, 개발 명령, stdout/stderr 규칙
├── prompt-assets/README.md    ← prompt asset 목록
└── src/tools/README.md        ← tool 구현 구조
```

## 작업 유형 × 문서 매트릭스

| 작업 유형 | 먼저 읽을 페이지 | 현재 근거 |
|---|---|---|
| 처음 설치하거나 MCP client에 연결 | [`docs/setup.md`](docs/setup.md) | `package.json`, `bin/risuai-workbench-mcp.js`, `src/cli.ts` |
| agent에게 기본 사용 흐름을 설명 | [`docs/workflows.md`](docs/workflows.md) | `src/tools/facade/*`, `src/actions/create-registry.ts` |
| 공개 tool surface를 확인 | [`docs/facade-tools.md`](docs/facade-tools.md) | `src/tools/facade/index.ts`, `src/dev/snapshot-tool-surface.ts` |
| RisuLua를 Fengari로 실행·회귀 테스트 | [`docs/risulua-runtime.md`](docs/risulua-runtime.md) | `src/actions/adapters/runtime-actions.ts`, `src/tools/runtime/*` |
| 파일 변경 안전 경계를 검토 | [`docs/mutation-safety.md`](docs/mutation-safety.md) | `src/mutation/*`, `src/project/safe-path.ts`, `src/tools/facade/patch-*.ts` |
| 실행 오류나 tool 노출 문제를 진단 | [`docs/troubleshooting.md`](docs/troubleshooting.md) | `src/cli.ts`, facade tools, MCP client 설정 |
| maintainer용 CLI·개발 명령 확인 | [`docs/development.md`](docs/development.md) | `package.json`, `src/dev/*`, `README-reference.md` |
| 상세 구조와 protocol reference 확인 | [`README-reference.md`](README-reference.md) | package source와 기존 상세 문서 |

## Subagent 사용 가이드

subagent가 이 MCP package를 다룰 때는 다음 순서로 문서를 좁힙니다.

1. **이 README**, 작업 유형과 관련 페이지를 먼저 고릅니다.
2. **[`docs/README.md`](docs/README.md)**, `docs/` 하위 페이지의 범위를 확인합니다.
3. **작업별 leaf 문서**, 설치·workflow·tool surface·mutation safety 중 필요한 문서만 읽습니다.
4. **[`README-reference.md`](README-reference.md)**, leaf 문서보다 상세한 protocol·architecture 근거가 필요할 때만 읽습니다.
5. **관련 source/test**, 마지막에 실제 구현과 테스트로 문장을 고정합니다.

### 빠른 로드 조합

| 상황 | 권장 로드 파일 |
|---|---|
| MCP client 설정 문구 수정 | `docs/setup.md` + `package.json` |
| archive 추출 가이드 수정 | `docs/workflows.md` + `README-reference.md` |
| facade tool 설명 수정 | `docs/facade-tools.md` + `src/tools/facade/index.ts` |
| mutation 관련 문구 수정 | `docs/mutation-safety.md` + `src/mutation/*` |
| 문제 해결 문구 수정 | `docs/troubleshooting.md` + 관련 설정 예시 |
| 개발 명령 수정 | `docs/development.md` + `package.json` |

## 핵심 운영 원칙

- 기본 `tools/list`에는 facade tool 8개만 노출됩니다. 세부 기능은 `route_intent` → `catalog` → `prepare_action`으로 찾습니다.
- 읽기/분석 작업은 `run_action`으로 실행하고, 파일 변경 작업은 `patch_preview`로 plan을 만든 뒤 저장된 plan만 `patch_apply`로 적용합니다.
- `.risum`, `.charx`, `.risup` archive 추출은 내부 action `core.run_extract`를 사용합니다. archive를 text로 읽거나 수동 unzip하지 않습니다.
- RisuLua 실행은 공개 tool을 추가하지 않고 내부 action `risulua.debug_call`, `risulua.runtime_smoke`를 `workbench.run_action`으로 호출합니다. 큰 source는 먼저 `workbench.context`에 저장합니다.
- stdio mode에서 stdout은 MCP JSON-RPC 전용입니다. 일반 로그와 diagnostic은 stderr로 보냅니다.

## 파일 수정 규칙

- README에는 새 기능의 상세 사용법을 길게 복사하지 않습니다. 새 주제는 `docs/` leaf 문서에 추가하고 README의 매트릭스에서 링크합니다.
- 공개 facade tool 이름과 내부 `actionId`를 구분해서 씁니다. 예: MCP tool은 `workbench.run_action`, 내부 action은 `core.run_extract`입니다.
- 보장처럼 쓰는 문장은 구현 파일이나 테스트 근거를 함께 확인합니다. 구현만 확인한 내용은 `현재 구현` 또는 `코드 기준`처럼 표현합니다.
- 링크는 패키지 내부 상대 링크를 우선 사용합니다.

## 같이 읽을 문서

- [`docs/README.md`](docs/README.md)
- [`docs/setup.md`](docs/setup.md)
- [`docs/workflows.md`](docs/workflows.md)
- [`docs/facade-tools.md`](docs/facade-tools.md)
- [`docs/risulua-runtime.md`](docs/risulua-runtime.md)
- [`docs/mutation-safety.md`](docs/mutation-safety.md)
- [`docs/troubleshooting.md`](docs/troubleshooting.md)
- [`docs/development.md`](docs/development.md)
- [`README-reference.md`](README-reference.md)
- [`prompt-assets/README.md`](prompt-assets/README.md)
- [`src/tools/README.md`](src/tools/README.md)

## License

MIT
