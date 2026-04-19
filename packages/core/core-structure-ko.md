# `packages/core` 구조

## 목적

`packages/core`는 RisuAI workbench 모노레포에서 재사용 가능한 엔진 레이어입니다. 이 패키지는 다음을 제공합니다.

- 타입과 순수 도메인 헬퍼를 위한 브라우저 안전 root API
- 파일시스템 및 PNG/card I/O를 위한 별도의 Node 전용 엔트리
- 위 레이어들 위에 구축된 CLI 표면

의도된 공개 계약은 `tests/root-entry-contract.test.ts`, `tests/domain-node-structure.test.ts` 같은 테스트로 강제됩니다.

## 최상위 레이아웃

```text
packages/core/
|- assets/        정적 패키지 자산 (`pack` workflow용 `rpack_map.bin`)
|- bin/           배포되는 CLI 바이너리 shim (`risu-core`)
|- dist/          TypeScript 빌드 출력물
|- src/           실제 구현 소스
|- tests/         Vitest 기반 계약 및 workflow 테스트
|- .tmp/          로컬 샘플 출력물 / 임시 산출물
|- package.json   패키지 exports, scripts, bin 매핑
|- tsconfig.json  TypeScript 빌드 설정
`- vitest.config.ts
```

## 엔트리 포인트

### root 패키지 엔트리

- `src/index.ts`
- `src/types`, `src/domain`만 다시 export
- root import를 브라우저 안전하게 유지하기 위해 Node 전용 헬퍼는 의도적으로 제외

### Node 전용 엔트리

- `src/node/index.ts`
- filesystem 헬퍼, PNG chunk 헬퍼, `parseCharxFile`와 호환 alias `parseCardFile`를 다시 export
- `package.json`에서 `./node` subpath export로 배포

### CLI 엔트리

- `bin/risu-core.js`
- `dist/cli/main.js`를 로드하고, 그 모듈의 `run()` export로 같은 프로세스 안에서 위임
- `src/cli/main.ts`가 `extract`, `pack`, `analyze`, `build` 서브커맨드를 디스패치

## 소스 레이어링

### `src/types/`

이 디렉토리는 root 패키지에서 export되는 구조적 TypeScript 계약을 담습니다.

- `src/types/charx.ts`는 `CharxData`, 호환 alias `CardData`, `RegexScript`, `LorebookEntry`, `Variable` 같은 핵심 데이터 형태를 정의
- `src/types/index.ts`는 `src/index.ts`에서 사용하는 작은 barrel

이 레이어에는 런타임 동작이 없습니다.

### `src/domain/`

이곳은 패키지의 순수 로직 중심부입니다. Node.js I/O에 의존하지 않아야 합니다.

- `src/domain/charx/`
  - `data.ts`: unknown card 형태 입력에서 유용한 필드를 읽음
  - `cbs.ts`: 텍스트에서 CBS 변수 read/write를 추출
  - `filenames.ts`: 파일명 정규화
  - `asset-uri.ts`: asset URI 해석과 mime/extension 추론
- `src/domain/lorebook/`
  - `folders.ts`: folder ID -> folder name 매핑 유틸리티
  - `structure.ts`: lorebook 구조 분석, 키워드 중첩 통계, lorebook CBS 수집
- `src/domain/regex/scripts.ts`
  - regex script CBS 추출 및 기본 변수 파싱
- `src/domain/analyze/`
  - `constants.ts`: 리포트 상수, 토큰 heuristic, 분석용 pipeline phase 정의
  - `correlation.ts`: unified CBS graph 생성과 lorebook/regex 상관관계 계산
  - `token-budget.ts`: analyzer source 전반의 heuristic 토큰 예산 추정
  - `variable-flow.ts`: pipeline-aware 변수 read/write 흐름 분석
  - `dead-code.ts`: 변수/로어북/regex 죽은 코드 탐지
  - `composition.ts`: 다중 artifact 조합 충돌 분석
  - `prompt-chain.ts`: 순서가 있는 prompt/template 체인 의존성 분석
  - `lua-helpers.ts`: 분석 흐름에서 공유하는 Lua AST 유틸리티 헬퍼
- `src/domain/index.ts`
  - 모든 순수 도메인 헬퍼의 공개 barrel

실용적인 기준은 단순합니다. 어떤 함수가 파일시스템을 건드리지 않고 메모리 안의 값만으로 동작할 수 있다면, 그 함수는 여기 있어야 합니다.

### `src/node/`

이 디렉토리는 Node.js 런타임 관점을 담당하는 플랫폼 어댑터 레이어입니다.

- `fs-helpers.ts`: `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`
- `png.ts`: PNG text chunk 파싱, character JSON 디코딩, text chunk 제거
- `charx-io.ts`: 디스크의 `.json`, `.png` 캐릭터 입력 파싱
- `index.ts`: 명시적인 Node 전용 export 표면

이 레이어는 Node built-in에 의존하며, root 패키지 export와 의도적으로 분리되어 있습니다.

### `src/shared/`

`shared/`는 주로 compatibility 및 convenience facade 역할을 합니다. 하나의 import 경로를 계속 쓰고 싶은 내부 호출자를 위해 domain과 node 헬퍼를 함께 다시 export합니다.

- `shared/risu-api.ts`: Risu 전용 헬퍼 묶음
- `shared/extract-helpers.ts`: extract workflow에서 쓰는 convenience bridge
- `shared/analyze-helpers.ts`: analyze-domain 헬퍼 재export
- `shared/uri-resolver.ts`: asset URI 유틸리티용 compatibility 재export
- `shared/index.ts`: 위 파일들을 모은 barrel

중요한 뉘앙스가 하나 있습니다. `shared/`는 내부적으로는 유용하지만, 1차 외부 계약은 아닙니다. 패키지 수준의 핵심 계약은 root 엔트리와 `./node` 엔트리입니다.

### `src/cli/`

이곳은 애플리케이션 레이어입니다. 각 커맨드는 아주 얇은 command module과 workflow 중심 구현으로 구성됩니다.

- command wrappers
  - `extract.ts`
  - `pack.ts`
  - `analyze.ts`
  - 분석 진입점은 `analyze.ts`로 통합됨
  - `build.ts`
- dispatcher
  - `main.ts`
- command별 workflow 디렉토리
  - `extract/`
    - `workflow.ts`: 전체 extraction pipeline 오케스트레이션
    - `phases.ts`: lorebook, regex, Lua, assets, HTML, variables, character card 필드에 대한 구체적인 extraction phase
    - `parsers.ts`: 저수준 CharX 및 module 파싱 헬퍼
  - `pack/`
    - `workflow.ts`: 추출된 컴포넌트와 asset을 다시 조합해 출력 카드를 재구성
  - `analyze/`
    - `workflow.ts`: lua/charx/module/preset/compose를 분기하는 상위 analyze 라우터
    - `lua/`: script-level Lua 분석 workflow
    - `charx/`: character-wide analyzer
    - `module/`: module-wide analyzer, collectors, reporting
    - `preset/`: preset-wide analyzer, collectors, reporting, prompt-chain 통합
    - `compose/`: 다중 artifact compatibility를 보는 explicit composition analyzer
    - `shared/`: visualization contract, HTML shell, analyzer view-model helper
  - `analyze/charx/`
    - `workflow.ts`: charx 전체 분석용 end-to-end 오케스트레이터
    - `collectors.ts`, `reporting.ts`, `reporting/htmlRenderer.ts`, `types.ts`
  - `build/`
    - `workflow.ts`: `regex/`, `lorebooks/`로부터 export JSON을 생성

CLI 레이어는 다음을 조합합니다.

- `src/domain/`의 순수 헬퍼
- `src/node/`의 Node 어댑터
- 기존 import 편의나 호환성이 아직 필요한 곳에서 `src/shared/`의 compatibility 헬퍼

## 코드에서 드러나는 아키텍처 규칙

### 1. 공개 API는 의도적으로 분리되어 있다

- root import: 순수 types + domain만 포함
- `./node` import: filesystem 및 binary/parsing 헬퍼 포함
- CLI: root 라이브러리 API에 포함되지 않는 별도 실행 표면

이 분리는 `tests/root-entry-contract.test.ts`, `tests/domain-node-structure.test.ts`에서 직접 검증됩니다.

### 2. orchestration은 workflow가 담당한다

command 파일은 의도적으로 얇게 유지됩니다. 실제 동작은 다음과 같은 workflow 파일에 있습니다.

- `src/cli/extract/workflow.ts`
- `src/cli/pack/workflow.ts`
- `src/cli/analyze/workflow.ts`
- `src/cli/analyze/charx/workflow.ts`
- `src/cli/analyze/module/workflow.ts`
- `src/cli/analyze/preset/workflow.ts`
- `src/cli/build/workflow.ts`

이 구조 덕분에 command dispatch는 단순하게 유지되고, orchestration 로직은 테스트와 진화가 쉬워집니다.

### 3. domain은 계속 재사용 가능해야 한다

`src/domain/` 아래 파일은 디스크 파일이 아니라 데이터 구조와 분석 primitive를 대상으로 동작합니다. 그래서 VS Code extension과 테스트 양쪽에서 재사용하기 좋습니다.

### 4. 생성 산출물은 source of truth가 아니다

- `dist/`는 `tsc`가 생성
- `.tmp/`는 로컬 출력물/샘플 보관용
- `node_modules/`는 패키지 로컬 의존성 상태

권위 있는 구현은 `src/`, `tests/`에 있습니다.

## 테스트 커버리지 형태

`tests/` 디렉토리는 패키지 경계와 workflow 계약에 초점을 맞춥니다.

- entry/contract 테스트
  - `root-entry-contract.test.ts`
  - `node-entry.test.ts`
  - `domain-node-structure.test.ts`
- CLI 동작 테스트
  - `cli-main-dispatch.test.ts`
  - `cli-smoke.test.ts`
  - `smoke.test.ts`
- workflow별 회귀 테스트
  - `lorebook-folder-layout.test.ts`
  - `pack-character-roundtrip.test.ts`
  - `analyze-card-lorebook-manifest.test.ts`
  - `domain-phase1-extraction.test.ts`
  - `token-budget.test.ts`
  - `variable-flow.test.ts`
  - `dead-code.test.ts`
  - `composition-analysis.test.ts`
  - `prompt-chain.test.ts`

## 빌드 및 배포 메모

- `package.json`
  - `dist/`, `bin/`, `assets/rpack_map.bin`을 배포
  - `.`과 `./node`를 노출
  - `risu-core` 바이너리를 정의
- `tsconfig.json`
  - `rootDir: ./src`
  - `outDir: ./dist`
  - declaration 출력 활성화
- `vitest.config.ts`
  - `tests/**/*.test.ts`를 실행

## 변경 시 사고 모델

이 패키지를 수정할 때는 다음 기준으로 판단하면 됩니다.

- 공개 데이터 모델이 바뀌면 `src/types/`를 수정
- 순수 변환, 분석, 재사용 가능한 비즈니스 규칙이면 `src/domain/`을 수정
- 파일/buffer/runtime 어댑터면 `src/node/`를 수정
- command 동작이나 workflow orchestration이 바뀌면 `src/cli/`를 수정
- 새 구조에 맞춰 compatibility 또는 convenience export를 옮겨야 할 때만 `src/shared/`를 수정

이 사고 모델은 현재 패키지 계약과 기존 테스트 스위트에 부합합니다.
