# 로어북 표준 (.risulorebook)

`.risulorebook`은 캐릭터 카드(charx)와 모듈(module)에서 공통으로 사용하는 표준 아티팩트 명세입니다. 현재 구현의 신뢰 기준(Source of Truth)은 개별 `.risulorebook` 파일 집합과 `lorebooks/_order.json` 파일입니다. 

> **참고**: 과거에 사용되던 `_folders.json`은 호환성 유지를 위해서만 지원되며, 표준 편집 인터페이스는 아닙니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`)
- **파일 위치**: `lorebooks/` 디렉토리
- **확장자**: `.risulorebook`
- **정렬 기준**: `lorebooks/_order.json`

## 표준 파일 형식 (Format)

로어북 파일은 설정 섹션(YAML)과 데이터 섹션(`@@@` 마커)으로 구성됩니다.

```text
---
name: 로어북 이름
comment: 설명 주석
mode: normal|folder|constant|multiple|child (활성화 모드)
constant: false (상시 활성화 여부)
selective: false (선택적 활성화 여부)
insertion_order: 100 (삽입 순서)
case_sensitive: false (대소문자 구분)
use_regex: false (정규식 사용 여부)
folder: null (상위 폴더 이름)
book_version: 2 (북 버전)
activation_percent: 15 (활성화 확률)
id: lore-1 (엔트리 식별자)
---
@@@ KEYS
키워드 목록 (한 줄에 하나씩)
@@@ SECONDARY_KEYS
보조 키워드 목록
@@@ CONTENT
로어북 실제 내용 (CBS 매크로 사용 가능 영역)
```

## CBS 분석 영역

- **`@@@ CONTENT`**: 이 영역만이 CBS 분석 및 언어 서비스(LSP)의 대상입니다.
- **기타 영역**: 프론트매터(YAML), `@@@ KEYS`, `@@@ SECONDARY_KEYS` 영역은 CBS 조각 매핑에서 제외됩니다.

## 경로 기반 폴더 식별 (Path-based Identity)

- **디렉토리 정체성**: 현재 구현은 `lorebooks/<폴더...>/<엔트리>.risulorebook`과 같이 물리적 파일 경로를 정체성의 기준으로 삼습니다.
- **정렬 마커**: `_order.json`은 실제 디렉토리 구조와 파일의 상대 경로를 보존하는 정렬 정보의 신뢰 기준입니다.
- **호환성 지원**: `_folders.json`이 존재할 경우 입력을 수용하고 변환을 보조하지만, 워크스페이스 생성 시에는 실제 물리 경로와 `_order.json` 명시를 최우선 순위로 둡니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 캐릭터 카드 | `char_book` 및 `extensions.risu_bookVersion` 등 로어북 확장 필드 |
| 모듈 | `_moduleLorebook` 필드 (`loreBook[]` 배열) |

## 왕복 변환(Round-trip) 주의 사항

- **버전 관리**: 캐릭터 카드의 `book_version` 필드는 `extensions.risu_bookVersion` 경계를 통해 상호 변환됩니다.
- **이름 보존**: 캐릭터 카드 내보내기 시 표준 파일의 `name` 값이 `comment` 필드에 의해 덮어씌워지지 않도록 정합성을 유지해야 합니다.
- **폴더 및 순서**: 로어북의 폴더 계층 구조와 표시 순서는 실제 물리 경로와 `_order.json`을 기준으로 보존됩니다.

## 작성 예시

```text
---
name: "🌟 이벤트 - 반전"
comment: "특정 확률로 발생하는 반전 이벤트"
mode: normal
constant: true
selective: false
insertion_order: 500
case_sensitive: false
use_regex: false
---
@@@ KEYS
Yagyu Maki
@@@ CONTENT
@@depth 0
{{#if {{? {{roll::500}}<=3}} }}
반전 효과가 적용됩니다.
{{/if}}
```
