# Module Extract 설계

> 날짜: 2026-03-20
> 상태: 승인됨

## 목표

기존 extract 워크플로우에 RisuAI 모듈(`.risum`, `.json`) 추출 기능을 추가한다.
캐릭터/프리셋 추출기와 동일한 phase 기반 아키텍처를 따르며, 공통 컴포넌트(lorebook, regex, trigger/lua)는 기존 로직을 재사용한다.

## 입력 포맷

| 포맷 | 설명 | 처리 |
|------|------|------|
| `.risum` (메인) | RPack 인코딩된 바이너리 모듈 | RPack 디코딩 → JSON 메타 + 바이너리 에셋 추출 |
| `.json` | JSON export (`type: 'risuModule'`) | JSON 파싱 + 타입 검증, 에셋 추출 없음 |

## RisuModule 필드 매핑

| 필드 | 타입 | 추출 대상 | 비고 |
|------|------|----------|------|
| `name` | string | metadata.json | |
| `description` | string | metadata.json | |
| `id` | string | metadata.json | |
| `namespace` | string? | metadata.json | |
| `lowLevelAccess` | boolean? | metadata.json | |
| `hideIcon` | boolean? | metadata.json | |
| `mcp` | MCPModule? | metadata.json | |
| `lorebook` | loreBook[]? | lorebooks/ | 캐릭터 Phase 2 패턴 |
| `regex` | customscript[]? | regex/ | 캐릭터 Phase 3 패턴 |
| `trigger` | triggerscript[]? | lua/ | 캐릭터 Phase 4 패턴 |
| `assets` | [string,string,string][]? | assets/ | .risum 전용 |
| `backgroundEmbedding` | string? | html/background.html | 캐릭터 backgroundHTML 패턴 |
| `customModuleToggle` | string? | metadata.json 또는 별도 파일 | |
| `cjs` | string? | 스킵 | 미사용 필드 |

## Phase 구조

| Phase | 내용 | 출력 | 비고 |
|-------|------|------|------|
| 1. 모듈 파싱 | .risum/.json 파싱 | `module.json` | `parseModuleRisum()` 확장 (에셋 바이너리 포함) |
| 2. Lorebook 추출 | `module.lorebook[]` | `lorebooks/` + `_order.json` + `manifest.json` | 캐릭터 `extractLorebookRows` 재사용 |
| 3. Regex 추출 | `module.regex[]` | `regex/` + `_order.json` | 캐릭터 Phase 3 패턴 동일 |
| 4. TriggerLua 추출 | `module.trigger[]` | `lua/*.lua` | 캐릭터 Phase 4 패턴 동일 |
| 5. Asset 추출 | .risum 바이너리 에셋 | `assets/` + `manifest.json` | `.risum` 전용, `.json` 시 스킵 |
| 6. BackgroundEmbedding | `module.backgroundEmbedding` | `html/background.html` | 캐릭터 `backgroundHTML`과 동일 패턴 |
| 7. Module Identity | name, description, id 등 | `metadata.json` | 캐릭터 Phase 8 대응 |

## 출력 구조

```
module_<name>/
├── module.json                  ← Phase 1: raw parsed data
├── metadata.json                ← Phase 7: identity + flags
├── lorebooks/                   ← Phase 2
│   ├── _order.json
│   ├── manifest.json
│   └── *.json
├── regex/                       ← Phase 3
│   ├── _order.json
│   └── *.json
├── lua/                         ← Phase 4
│   └── *.lua
├── assets/                      ← Phase 5 (.risum only)
│   ├── manifest.json
│   └── *.*
└── html/                        ← Phase 6
    └── background.html
```

## 코드 구조

```
extract/
├── parsers.ts                   ← parseModuleRisum() 확장 (에셋 추출 추가)
├── workflow.ts                  ← --type module 라우팅 추가, .risum 확장자 감지
└── module/
    ├── workflow.ts              ← runExtractWorkflow() — phase 오케스트레이션
    └── phases.ts               ← phase1~7 함수 (캐릭터 헬퍼 재사용)
```

## 라우팅 변경 (extract/workflow.ts)

- `--type module` 명시 시 모듈 추출
- 확장자 `.risum` 감지 시 자동으로 모듈 추출
- `.json`은 내용 기반 판별 (`type: 'risuModule'` 체크)

## 설계 결정 사항

1. **`.charx` 내장 module.risum은 범위 밖** — 이미 캐릭터 추출기에서 카드에 병합하는 방식으로 처리 중
2. **`.json` 입력 시 에셋 추출 스킵** — JSON에는 에셋 바이너리가 포함되지 않음
3. **`cjs` 필드 스킵** — risuai-pork에서도 미사용 (타입 정의에만 존재)
4. **`backgroundEmbedding`은 HTML로 추출** — 캐릭터의 backgroundHTML과 동일 패턴
5. **캐릭터 추출기 헬퍼 재사용** — lorebook, regex, trigger/lua 추출 로직 공유
