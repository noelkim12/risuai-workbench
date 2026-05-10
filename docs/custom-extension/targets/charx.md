# 캐릭터 카드 대상 (Charx Target)

`charx`는 로어북, 정규식, Lua, 변수, HTML 아티팩트를 포함하는 표준 캐릭터 카드 대상 명세입니다.

## 표준 워크스페이스 구조 (Canonical Layout)

현재 Lua 레이아웃은 **단일 파일 개발**과 **모듈식 개발**을 지원합니다. CLI 표기는 `--risulua-mode <classic|modular>`입니다. `bundle mode`는 내부 구현 개념이고, 사용자에게 주로 설명할 이름은 모듈식 개발입니다.

### 단일 파일 개발

```text
<캐릭터_루트>/
├── .risuchar (캐릭터 루트 marker 및 metadata owner)
├── character/
│   ├── description.risutext (캐릭터 묘사)
│   ├── first_mes.risutext (첫 메시지)
│   ├── system_prompt.risutext (시스템 프롬프트)
│   ├── replace_global_note.risutext (전역 노트 대체 지침)
│   ├── creator_notes.risutext (제작자 노트)
│   ├── additional_text.risutext (추가 텍스트)
│   ├── alternate_greetings/
│   │   ├── _order.json (대체 인사말 명시 순서)
│   │   └── *.risutext
│   └── extensions.json (canonical artifact가 직접 소유하지 않는 extension sidecar, 선택)
├── lorebooks/
│   ├── _order.json (로어북 정렬 순서)
│   └── <폴더...>/<엔트리>.risulorebook
├── regex/
│   ├── _order.json (정규식 정렬 순서)
│   └── *.risuregex
├── lua/
│   └── <대상_이름>.risulua (대상 이름 기반 싱글톤)
├── variables/
│   └── <대상_이름>.risuvar (대상 이름 기반 싱글톤)
└── html/
    └── background.risuhtml (고정파일명)
```

### 모듈식 개발

```text
<캐릭터_루트>/
├── .risuchar (캐릭터 루트 marker 및 metadata owner)
├── character/
├── lorebooks/
├── regex/
├── lua/
│   ├── main.risulua (단일 작성 진입점)
│   └── common/
│       ├── variables.risulua
│       └── function.risulua
├── dist/
│   └── <대상_이름>.risulua (생성 전용 singleton pack artifact)
├── variables/
└── html/
    └── background.risuhtml (고정파일명)
```

모듈식 개발에서 `lua/**/*.risulua`는 작성 source이고, `dist/<targetName>.risulua`만 패키징 입력으로 인정되는 생성 artifact입니다. `require("common.variables")`는 `lua/common/variables.risulua`로 해석됩니다. 동적 require, slash paths, `.risulua` suffix, `package.path`/`package.cpath`/`package.searchers`/`package.loaders` mutation, `dofile`, `loadfile`, `require` shadow/alias/reassignment는 금지됩니다.

No Lua manifest in first implementation. `.risuchar`는 Lua manifest가 아니며, `risulua.json`이나 `lua/manifest.json`도 현재 동작이 아닙니다. pack은 modular pack에서 dist를 다시 만들고 `dist/<targetName>.risulua`만 `triggerscript`로 주입하며 source module을 주입하지 않습니다. extract는 upstream Lua를 `lua/main.risulua`에 쓰고 자동 분해하지 않습니다. scaffold는 starter layout과 `dist/`를 만들지만 생성된 dist 파일은 만들지 않습니다. `risulua-split`/auto-decomposition is future work.

- **핵심 데이터**: `.risuchar`는 루트 metadata owner이고, `character/*.risutext`는 패키징 시 직접 참조되는 실제 prose 페이로드(Payload)입니다.
- **파일명 규칙**: 단일 파일 개발의 `lua/` 파일과 `variables/` 디렉토리 내의 파일명은 임의의 이름이 아닌, 캐릭터 메타데이터의 `name` 필드를 정제(Sanitize)한 대상 이름 규칙을 따릅니다. 모듈식 개발의 작성 source는 `lua/main.risulua`와 `lua/**/*.risulua`를 사용하고, 대상 이름 규칙은 생성 artifact인 `dist/<targetName>.risulua`에 적용합니다. `lua/main.risulua` 자동 감지가 기존 파일명과 충돌하면 `--risulua-mode classic`을 명시합니다.
- **고정 파일**: `html/background.risuhtml`은 예외적으로 파일명이 고정되어 있습니다.

## 아티팩트 소유권 및 매핑 명세

| 아티팩트 종류     | 매핑되는 상위(Upstream) 필드                                                                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 캐릭터 prose 파일 | `description`, `first_mes`, `system_prompt`, `replace_global_note`, `creator_notes`, `additionalText`, `alternate_greetings` canonical 이름을 사용하며, `replace_global_note`는 `data.replaceGlobalNote`로 직접 매핑                                                                                       |
| 캐릭터 메타데이터 | `.risuchar`가 소유하는 `data` 하위의 `name`, `creator`, `character_version`, `creation_date`, `modification_date`, `extensions.risuai.utilityBot`, `extensions.risuai.lowLevelAccess`, `data.tags`, selected thumbnail metadata via `.risuchar.image`, and existing identity/version/timestamp/flag fields |
| 로어북            | `char_book` 및 로어북 관련 확장(Extension) 필드 전체                                                                                                                                                                                                                                                       |
| 정규식            | `extensions.risuai.customScripts` 필드                                                                                                                                                                                                                                                                     |
| Lua               | `triggerscript` 필드                                                                                                                                                                                                                                                                                       |
| 변수 설정         | `extensions.risuai.defaultVariables` 필드                                                                                                                                                                                                                                                                  |
| HTML              | `extensions.risuai.backgroundHTML` 필드                                                                                                                                                                                                                                                                    |

> **참고**: `character/metadata.json`, `character/*.txt`, `character/alternate_greetings.json`은 migration window의 legacy fallback입니다. 같은 필드에 canonical과 legacy가 함께 있으면 canonical이 이기며, legacy 값은 warning 후 무시됩니다.

## 메타데이터 관리 원칙

데이터 페이로드가 아닌 구조화된 메타데이터는 루트 `.risuchar`가 소유합니다. `.risuchar`는 prose path 목록이나 field mapping entries를 포함하지 않습니다. 캐릭터 카드 패키징 시 참조하는 주요 메타데이터 필드는 다음과 같습니다.

### 문자열 필드

- `name` (캐릭터 이름)
- `creator` (제작자)
- `character_version` (캐릭터 버전)
- `creation_date` (생성일)
- `modification_date` (수정일)

### 불리언(Boolean) 필드

- `utilityBot` (유틸리티 봇 여부)
- `lowLevelAccess` (저수준 접근 허용 여부)

위 항목들은 로어북이나 정규식 같은 데이터 페이로드 영역이 아닌 구조화 메타데이터 영역에서 설명되어야 합니다. 캐릭터 카드는 `.risutoggle` 아티팩트를 지원하지 않으므로 토글 소유권을 이 대상으로 확장해서는 안 됩니다.

### 이미지 및 태그 필드

- `image`는 워크스페이스 상대 경로로 선택된 캐릭터 썸네일을 가리킵니다. 일반적으로 `assets/icons/<filename>` 형태이며, 바이너리 자체나 전체 asset manifest를 `.risuchar`에 넣지 않습니다.
- `tags`는 CCv3 `data.tags`로 다시 패킹되는 canonical 태그 배열입니다. Risu 내부 `additionalData.tag`는 호환 미러로 취급하며 `.risuchar`의 canonical 필드로 분리하지 않습니다.
- `assets/manifest.json`은 여전히 asset metadata와 추출 파일 경로의 소유자입니다. `.risuchar.image`는 그중 하나를 대표 썸네일로 선택하는 metadata pointer입니다.

## 루트 JSON 제거 및 호환성 방침

- **편집 인터페이스**: 현재 유효한 편집 소스는 `charx.json`이 아닙니다.
- **지연된 범위**: 분석이나 레거시 호환성 설명 문맥에서만 `charx.json` 폴백(Fallback)을 아카이브 또는 지연된 메모로 언급할 수 있습니다.
- **재조립 규칙**: 패키징 워크플로우는 워크스페이스 내의 표준 아티팩트와 기본값 오버레이를 기준으로 캐릭터 카드를 최종 재조립합니다.

## Migration 및 compatibility 규칙

- `.risuchar`는 `character/metadata.json`보다 우선합니다. legacy metadata는 `.risuchar`가 없을 때만 fallback입니다.
- `character/*.risutext`는 같은 이름의 `character/*.txt`보다 우선합니다. 두 파일을 자동 병합하지 않습니다.
- `character/alternate_greetings/` canonical 디렉토리는 `character/alternate_greetings.json`보다 우선합니다.
- `character/alternate_greetings/_order.json`에 적힌 파일은 반드시 존재해야 합니다. 누락 시 pack은 실패합니다.
- `_order.json`에 없는 `.risutext` 인사말은 파일명 정렬 순서로 마지막에 추가됩니다.
- `character/extensions.json`은 canonical artifact가 직접 소유하지 않는 unknown `data.extensions` namespace를 보존하기 위한 sidecar입니다.
- `assets/manifest.json`은 asset metadata와 추출 파일 경로를 보존합니다. CharX 출력은 가능한 asset/sidecar를 보존하지만, PNG/JPG 같은 target format이 지원하지 않는 asset 또는 opaque sidecar 보존은 명시적인 target-format-limited warning이 나올 수 있습니다.
- `lowLevelAccess` 및 script 관련 metadata는 `.risuchar`/canonical Lua artifact의 보존 대상일 뿐이며, metadata 편집만으로 script 실행 신뢰를 자동 상승시키지 않습니다.
