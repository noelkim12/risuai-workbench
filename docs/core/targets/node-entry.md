# Node 엔트리 (Node Entry)

이 문서는 `risu-workbench-core/node` 하위 경로의 현재 보장 범위와 라우팅만을 다룹니다. Node.js 헬퍼 내부의 상세 의미론은 리프 문서에서 다루며, 여기서는 공개 엔트리 경계만을 확정합니다.

## 현재 명세

- `packages/core/package.json`의 `exports["./node"]`는 `./dist/node/index.js`를 가리킵니다.
- 공개 임포트 경로는 `risu-workbench-core/node`입니다.
- `packages/core/src/node/index.ts`는 Node.js 전용 헬퍼를 집약하여 다시 내보냅니다(Re-export).
- `packages/core/tests/node-entry.test.ts`는 하위 경로 내보내기 선언과 빌드된 Node 엔트리에서 `stripPngTextChunks`가 노출되는지 검증합니다.
- `packages/core/tests/export-surface.test.ts`는 Node 엔트리의 실제 내보내기 키 집합 스냅샷을 확정합니다.
- `packages/core/tests/domain-node-structure.test.ts`는 `parseCardFile`, `parseCharxFile`, `ensureDir`와 같은 헬퍼가 Node 엔트리에만 존재하고 도메인 엔트리에는 노출되지 않음을 검증합니다.

## 라우팅 (Routing)

```text
소비자 임포트 'risu-workbench-core/node'
  -> package.json exports["./node"]
  -> dist/node/index.js
  -> src/node/index.ts
  -> 각 Node 어댑터 모듈
```

CLI는 별도의 경로를 사용합니다. `risu-core` 바이너리는 `src/cli/main.ts`를 진입점으로 하며, `./node` 하위 경로를 대체하지 않습니다. CLI 경계는 [`cli.md`](cli.md)에서 별도로 다룹니다.

## 이 엔트리가 보장하는 사항

- 파일 시스템 헬퍼 접근 권한 제공
- PNG/카드 파싱 헬퍼 API 제공
- 로어북/JSON 리스팅 헬퍼 API 제공
- rpack 인코딩 헬퍼 API 제공
- 커스텀 익스텐션 워크스페이스 탐색 헬퍼 API 제공

현재 내보내기 목록의 상세 리스트는 [`../node/README.md`](../node/README.md)에서 확인할 수 있습니다.

## 이 엔트리가 보장하지 않는 사항

- 브라우저 환경에서의 안전한 임포트 인터페이스
- 순수 도메인 헬퍼의 상세 의미론 설명
- CLI 명령어 디스패치 및 도움말 텍스트 명세
- 분석(Analyze) 워크플로우의 상세 라우팅 규칙

위 내용은 [`root-browser`](root-browser.md), [`../domains/analyze/README.md`](../domains/analyze/README.md), `packages/core/src/cli/main.ts`, `packages/core/src/cli/analyze/workflow.ts`를 참조하십시오.

## 언제 이 페이지를 먼저 읽나

| 작업 유형 | 이유 |
|---|---|
| Node 전용 public import 문구 수정 | `./node` subpath 계약을 직접 다루기 때문 |
| root와 node export 경계 점검 | 어떤 helper가 어느 entry에 있어야 하는지 나누기 때문 |
| fs/png/workspace discovery leaf 문서 시작 | public 진입 경계를 먼저 맞춰야 하기 때문 |

## 관련 근거 파일

- `../../packages/core/package.json`
- `../../packages/core/src/node/index.ts`
- `../../packages/core/tests/node-entry.test.ts`
- `../../packages/core/tests/domain-node-structure.test.ts`
- `../../packages/core/tests/export-surface.test.ts`
- `../../packages/core/src/cli/main.ts`

## 같이 읽을 문서

- [`../common/principles.md`](../common/principles.md)
- [`../common/testing-and-evidence.md`](../common/testing-and-evidence.md)
- [`../node/README.md`](../node/README.md)
- [`cli.md`](cli.md)
- [`root-browser.md`](root-browser.md)
- [`../domains/analyze/README.md`](../domains/analyze/README.md)
