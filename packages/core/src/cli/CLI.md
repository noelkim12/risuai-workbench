# `src/cli/` — 애플리케이션 레이어

## 정체성

`src/cli/`는 risu-workbench-core의 **애플리케이션 레이어**다. 라이브러리가 아니라 도구다.

`src/types/`가 데이터 형태를, `src/domain/`이 순수 변환 로직을, `src/node/`가 플랫폼 어댑터를 담당한다면, `src/cli/`는 이 세 레이어를 **조합하여 실행 가능한 워크플로우로 만드는** 곳이다. 사용자가 터미널에서 `risu-core <command>`를 입력하면, 그 명령이 도달하는 최종 목적지가 바로 이 디렉토리다.

CLI 레이어는 자체적으로 도메인 로직을 소유하지 않는다. 대신 하위 레이어의 함수들을 **올바른 순서로, 올바른 입력과 함께 호출**하는 오케스트레이션에 집중한다. 이 레이어에 비즈니스 규칙이 침투하면 재사용성이 무너진다.

## 아키텍처 원칙

### 1. 얇은 커맨드, 두꺼운 워크플로우

각 커맨드 파일(`extract.ts`, `pack.ts`, `analyze.ts`, `analyze-card.ts`, `build.ts`)은 의도적으로 얇다. argv를 받아 대응하는 워크플로우 함수에 위임하는 것이 전부다. 커맨드 파일에는 분기, 파싱, I/O가 없다.

```
main.ts          →  커맨드 디스패치
extract.ts       →  runExtractWorkflow(argv)
pack.ts          →  runPackWorkflow(argv)
analyze.ts       →  runAnalyzeWorkflow(argv)
analyze-card.ts  →  runAnalyzeCardWorkflow(argv)
build.ts         →  runBuildWorkflow(argv)
```

실제 동작은 각 커맨드의 하위 디렉토리에 있는 `workflow.ts`가 담당한다. 이 구조 덕분에 커맨드 디스패치와 오케스트레이션 로직이 깔끔하게 분리된다.

### 2. 디스패처는 라우터일 뿐이다

`main.ts`는 서브커맨드 문자열을 `CommandRunner` 함수에 매핑하는 라우터다. 여기에 조건 분기, 옵션 파싱, 에러 핸들링을 추가하지 않는다. 알 수 없는 커맨드에 대한 에러 메시지와 `--help` 출력이 이 파일이 해야 할 일의 전부다.

### 3. 워크플로우는 phase로 구성된다

복잡한 워크플로우는 명시적인 phase 구조를 따른다.

- `extract/`: 아티팩트 유형별 서브 워크플로우 (`character/`, `preset/`, `module/`) + 파싱 유틸리티 (`parsers.ts`)
- `analyze-card/`: COLLECT → CORRELATE → ANALYZE → REPORT 4-phase 파이프라인
- `analyze/`: 파싱 → 수집 → 분석 → 상관관계 → 리포팅
- `build/`: 옵션 파싱 → regex/lorebook 빌드 → 출력
- `pack/`: 아티팩트 유형별 패킹 (현재 character만 구현)

phase 구조는 각 단계가 독립적으로 테스트 가능하고, 실패 시 어느 지점에서 문제가 발생했는지 즉시 파악할 수 있게 해준다.

### 4. 의존 방향은 아래로만 흐른다

```
cli/
 ├── domain/     (순수 변환, 분석 primitive)
 ├── node/       (파일시스템, PNG I/O)
 └── shared/     (convenience re-export — 필요한 경우에만)
```

CLI는 domain과 node를 호출하지만, domain이나 node가 CLI를 호출하는 일은 없다. 이 방향성이 깨지면 패키지 전체의 레이어링이 무너진다.

## 커맨드 목록

| 커맨드 | 역할 | 입력 | 출력 |
|--------|------|------|------|
| `extract` | 캐릭터 카드 / 프리셋 / 모듈 추출 | `.charx`, `.png`, `.risum`, `.json` 등 | 프로젝트 디렉토리 구조 |
| `pack` | 추출된 컴포넌트를 카드로 재조립 | 프로젝트 디렉토리 | 출력 카드 |
| `analyze` | Lua 스크립트 정적 분석 | `.lua` 파일 (+ 선택적 카드) | Markdown / HTML / JSON 리포트 |
| `analyze-card` | 카드 전체 종합 분석 | 추출된 output 디렉토리 | Markdown / HTML 분석 리포트 |
| `build` | regex / lorebook 컴포넌트 빌드 | `regex/`, `lorebooks/` 디렉토리 | `regexscript_export.json`, `lorebook_export.json` |

## 디렉토리 구조

```
src/cli/
├── main.ts                  디스패처 (서브커맨드 → 워크플로우 라우팅)
│
├── extract.ts               커맨드 진입점 (얇은 위임)
├── extract/
│   ├── workflow.ts           유형 감지 + 서브 워크플로우 라우팅
│   ├── parsers.ts            CharX / module 파싱 유틸리티
│   ├── character/
│   │   ├── workflow.ts       캐릭터 카드 extraction 오케스트레이션
│   │   └── phases.ts         lorebook, regex, Lua, assets 등 개별 추출 phase
│   ├── preset/
│   │   ├── workflow.ts       프리셋 extraction 오케스트레이션
│   │   └── phases.ts         프리셋 전용 추출 phase
│   └── module/
│       ├── workflow.ts       모듈 extraction 오케스트레이션
│       └── phases.ts         모듈 전용 추출 phase
│
├── pack.ts                  커맨드 진입점
├── pack/
│   ├── workflow.ts           유형 라우팅 (현재 character만)
│   ├── utils.ts              패킹 유틸리티
│   └── character/
│       └── workflow.ts       캐릭터 카드 재조립 오케스트레이션
│
├── analyze.ts               커맨드 진입점
├── analyze/
│   ├── workflow.ts           Lua 분석 오케스트레이터
│   ├── collector.ts          AST에서 데이터 수집
│   ├── analyzer.ts           수집된 데이터 분석
│   ├── correlation.ts        lorebook/regex 상관관계
│   ├── reporting.ts          리포트 생성
│   ├── reporting/            리포트 렌더러
│   └── types.ts              분석 전용 타입
│
├── analyze-card.ts          커맨드 진입점
├── analyze-card/
│   ├── workflow.ts           카드 종합 분석 4-phase 오케스트레이터
│   ├── collectors.ts         CBS 수집기 (lorebook, regex, HTML, TS, Lua)
│   ├── reporting.ts          Markdown 리포트
│   ├── reporting/
│   │   └── htmlRenderer.ts   HTML 분석 시트
│   └── types.ts              분석 전용 타입
│
├── build.ts                 커맨드 진입점
└── build/
    └── workflow.ts           regex/lorebook export 빌드
```

## 설계 계약

### 커맨드 파일의 책임 범위

커맨드 파일은 다음만 한다:

1. 대응하는 워크플로우 함수를 호출한다.
2. `require.main === module` 가드로 직접 실행을 지원한다.

커맨드 파일에 옵션 파싱, 유효성 검사, I/O 로직을 넣지 않는다.

### 워크플로우 함수의 시그니처

모든 워크플로우 함수는 동일한 계약을 따른다:

```typescript
function runXxxWorkflow(argv: readonly string[]): number
```

- `argv`를 받는다 (이미 서브커맨드는 제거된 상태).
- 성공이면 `0`, 실패면 `1` 이상을 반환한다.
- `process.exit()`을 직접 호출하지 않는다 — 종료 코드를 반환값으로 위임한다.

### 에러 처리 전략

- 워크플로우 내부에서 발생하는 예외는 **워크플로우 안에서** 잡아 사용자 친화적 메시지로 변환한다.
- `safeCollect` 패턴 (analyze-card): 부분 실패를 허용하고, 경고를 출력한 뒤 fallback 값으로 계속 진행한다.
- 파싱 에러, 파일 미발견 같은 치명적 오류는 즉시 비정상 종료 코드를 반환한다.

## 변경 가이드라인

### 새 커맨드를 추가할 때

1. `src/cli/` 아래에 얇은 커맨드 파일을 만든다 (`new-command.ts`).
2. 같은 이름의 디렉토리를 만들고 `workflow.ts`를 작성한다.
3. `main.ts`의 `COMMANDS` 맵에 등록한다.
4. 도메인 로직이 필요하면 `src/domain/`에, I/O가 필요하면 `src/node/`에 둔다.

### 기존 워크플로우를 수정할 때

- 순수 변환 로직이 바뀌면 → `src/domain/`을 수정한다. CLI 워크플로우는 건드리지 않는다.
- 새 phase가 추가되면 → 해당 커맨드의 하위 디렉토리에 파일을 추가하고, `workflow.ts`에서 호출한다.
- 옵션이 추가되면 → `workflow.ts`의 argv 파싱 부분과 헬프 텍스트를 함께 수정한다.

### 하지 말아야 할 것

- 워크플로우에 도메인 로직을 직접 구현하지 않는다. 오케스트레이션만 한다.
- 커맨드 파일에 워크플로우 로직을 넣지 않는다. 위임만 한다.
- `main.ts`에 커맨드별 분기 로직을 넣지 않는다. 라우팅만 한다.
- CLI 레이어에서 `src/types/`나 `src/domain/`의 공개 API를 변경하지 않는다. 소비자일 뿐이다.

## 패키지 내 위치

```
packages/core/
├── src/
│   ├── types/       ← 데이터 형태 정의         (브라우저 안전)
│   ├── domain/      ← 순수 변환 로직           (브라우저 안전)
│   ├── node/        ← 플랫폼 어댑터           (Node 전용)
│   ├── shared/      ← 편의 re-export          (내부용)
│   └── cli/         ← 이 디렉토리             (Node 전용, 실행 표면)
├── bin/
│   └── risu-core.js ← CLI 바이너리 shim → dist/cli/main.js
└── package.json     ← "bin": { "risu-core": "bin/risu-core.js" }
```

CLI는 패키지의 라이브러리 API (`exports`의 `.`과 `./node`)에 포함되지 않는다. `bin` 필드를 통해 독립적인 실행 바이너리로만 노출된다. 라이브러리 소비자는 CLI 코드를 import하지 않으며, 그래야 한다.
