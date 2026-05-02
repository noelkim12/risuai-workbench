# 모듈 대상 (Module Target)

`module`은 로어북, 정규식, Lua, 토글, 변수, HTML 아티팩트를 포함하는 표준 모듈 대상 명세입니다.

## 표준 워크스페이스 구조 (Canonical Layout)

```text
<모듈_루트>/
├── metadata.json (구조화 메타데이터)
├── lorebooks/
│   ├── _order.json (로어북 정렬 순서)
│   └── <폴더...>/<엔트리>.risulorebook
├── regex/
│   ├── _order.json (정규식 정렬 순서)
│   └── *.risuregex
├── lua/
│   └── <모듈명>.risulua (단일 파일)
├── toggle/
│   └── <모듈명>.risutoggle (단일 파일)
├── variables/
│   └── <모듈명>.risuvar (단일 파일)
├── html/
│   └── background.risuhtml (고정파일명)
└── assets/                  # 에셋 (assets/manifest.json 존재 시에만 유효)
    ├── manifest.json
    └── <추출된 에셋 파일들...>
```

패키징 시 병합(Merge) 우선순위는 다음과 같습니다.
`메타데이터 → 로어북 → 정규식 → Lua → 변수 → HTML → 토글 → 에셋`

## 아티팩트 소유권 및 매핑 명세

| 아티팩트 종류 | 매핑되는 상위(Upstream) 필드 |
|---|---|
| 로어북 | `_moduleLorebook` 필드 |
| 정규식 | `customscript[]` 배열 필드 |
| Lua | 모듈 내 트리거(Trigger) 및 Lua 페이로드 영역 |
| 토글 설정 | `customModuleToggle` 필드 |
| 변수 설정 | 모듈 수준의 변수 설정 영역 |
| HTML | `backgroundEmbedding` 필드 |
| 에셋 (Assets) | `assets` 튜플(Tuple) 페이로드 및 추출된 버퍼 데이터 |

## 메타데이터 관리 원칙

`applyMetadata` 로직이 현재 `metadata.json`에서 읽어들이는 필드는 다음과 같이 제한됩니다.

- **문자열(String)**: `name`, `description`, `id`, `namespace`, `cjs`
- **불리언(Boolean)**: `lowLevelAccess`, `hideIcon`
- **객체(Object)**: `mcp` (Model Context Protocol 설정)

위 필드들은 데이터 페이로드가 아닌 구조화된 메타데이터 인터페이스(`metadata.json`)의 책임 범위입니다.

## 토글 소유권 제약 사항

- **공식 소유자**: 모듈 토글의 표준 소유자는 오직 `toggle/*.risutoggle` 파일입니다.
- **메타데이터 위임 금지**: `metadata.json`은 `customModuleToggle` 필드에 대한 편집 권한을 가질 수 없습니다.
- **오류 처리**: 패키징 워크플로우는 메타데이터에 포함된 토글 폴백 문자열을 무시하며, `metadata.json cannot own customModuleToggle. Use toggle/*.risutoggle instead.` 오류를 발생시켜 명확한 소유권 분리를 강제합니다.

## 에셋 인터페이스 (Assets Surface)

- **선택적 구조**: `assets/` 디렉토리는 모든 모듈 워크스페이스에 필수적인 레이아웃이 아닙니다.
- **활성화 조건**: `assets/manifest.json` 파일이 존재할 때만 에셋 인터페이스가 구체화(Materialize)됩니다.
- **데이터 조립**: 매니페스트의 `assets[]` 항목들을 기반으로 정렬된 튜플 페이로드를 생성하며, `extracted_path`가 가리키는 실제 파일들을 읽어 바이너리 데이터로 포함시킵니다.
- **비활성 상태**: 매니페스트 파일이 없으면 최종 결과물에 `assets` 페이로드를 생성하지 않습니다.

## 루트 JSON 제거 방침

- **활성 소스**: 현재 유효한 편집 소스는 `module.json`이 아닙니다.
- **현행 명세**: 표준 어댑터를 워크스페이스 파일들에 직접 적용하여 모듈 엔벨로프(Envelope)를 재구성하는 흐름이 현재의 신뢰 기준입니다.
- **호환성**: 분석 또는 지연된 메모가 필요한 경우에도 `module.json`을 현재의 표준으로 설명하지 않습니다.
