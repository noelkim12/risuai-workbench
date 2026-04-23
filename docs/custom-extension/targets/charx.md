# 캐릭터 카드 대상 (Charx Target)

`charx`는 로어북, 정규식, Lua, 변수, HTML 아티팩트를 포함하는 표준 캐릭터 카드 대상 명세입니다.

## 표준 워크스페이스 구조 (Canonical Layout)

```text
<캐릭터_루트>/
├── character/
│   ├── description.txt (캐릭터 묘사)
│   ├── first_mes.txt (첫 메시지)
│   ├── system_prompt.txt (시스템 프롬프트)
│   ├── post_history_instructions.txt (대화 로그 후속 지침)
│   ├── creator_notes.txt (제작자 노트)
│   ├── additional_text.txt (추가 텍스트)
│   ├── alternate_greetings.json (대체 인사말)
│   └── metadata.json (구조화 메타데이터)
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

- **핵심 데이터**: `character/` 디렉토리는 패키징 시 직접 참조되는 실제 페이로드(Payload) 하위 트리입니다.
- **파일명 규칙**: `lua/` 및 `variables/` 디렉토리 내의 파일명은 임의의 이름이 아닌, 캐릭터 메타데이터의 `name` 필드를 정제(Sanitize)한 '대상 이름' 규칙을 따릅니다.
- **고정 파일**: `html/background.risuhtml`은 예외적으로 파일명이 고정되어 있습니다.

## 아티팩트 소유권 및 매핑 명세

| 아티팩트 종류 | 매핑되는 상위(Upstream) 필드 |
|---|---|
| 캐릭터 페이로드 파일 | `data` 하위의 `description`, `first_mes`, `system_prompt`, `post_history_instructions`, `creator_notes`, `extensions.risuai.additionalText`, `alternate_greetings` |
| 캐릭터 메타데이터 | `data` 하위의 `name`, `creator`, `character_version`, `creation_date`, `modification_date`, `extensions.risuai.utilityBot`, `extensions.risuai.lowLevelAccess` |
| 로어북 | `char_book` 및 로어북 관련 확장(Extension) 필드 전체 |
| 정규식 | `extensions.risuai.customScripts` 필드 |
| Lua | `triggerscript` 필드 |
| 변수 설정 | `extensions.risuai.defaultVariables` 필드 |
| HTML | `extensions.risuai.backgroundHTML` 필드 |

> **참고**: `character/metadata.json`은 구조화된 메타데이터 편집을 위한 인터페이스이며, `character/*.txt` 파일들은 실제 데이터 페이로드 인터페이스입니다. 두 부류의 파일은 동일 계층에 위치하더라도 패키징 시의 역할은 엄격히 분리됩니다.

## 메타데이터 관리 원칙

데이터 페이로드가 아닌 구조화된 메타데이터는 `character/metadata.json` 또는 지정된 별도 인터페이스에서 소유합니다. 캐릭터 카드 패키징 시 참조하는 주요 메타데이터 필드는 다음과 같습니다.

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

## 루트 JSON 제거 및 호환성 방침

- **편집 인터페이스**: 현재 유효한 편집 소스는 `charx.json`이 아닙니다.
- **지연된 범위**: 분석이나 레거시 호환성 설명 문맥에서만 `charx.json` 폴백(Fallback)을 아카이브 또는 지연된 메모로 언급할 수 있습니다.
- **재조립 규칙**: 패키징 워크플로우는 워크스페이스 내의 표준 아티팩트와 기본값 오버레이를 기준으로 캐릭터 카드를 최종 재조립합니다.
