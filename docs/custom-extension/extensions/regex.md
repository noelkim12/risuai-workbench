# 정규식 표준 (.risuregex)

`.risuregex`는 캐릭터 카드(charx), 모듈(module), 프리셋(preset)이 공통으로 사용하는 표준 아티팩트 명세입니다. 각 파일은 하나의 정규식 규칙을 정의하며, 전체 실행 순서는 `regex/_order.json` 파일에서 관리합니다.

## 지원 범위 및 위치

- **지원 대상**: 캐릭터 카드(`charx`), 모듈(`module`), 프리셋(`preset`)
- **파일 위치**: `regex/` 디렉토리
- **확장자**: `.risuregex`
- **정렬 기준**: `regex/_order.json`

## 표준 파일 형식 (Format)

정규식 파일은 설정 섹션(YAML)과 데이터 섹션(`@@@` 마커)으로 구성됩니다.

```text
---
comment: 규칙에 대한 설명
type: editdisplay
ableFlag: true (활성화 여부)
flag: g<move_top> (정규식 플래그)
---
@@@ IN
입력 매칭 패턴 (정규식)
@@@ OUT
치환될 결과 패턴 (CBS 매크로 사용 가능 영역)
```

## 주요 필드 명세

- **`comment`**: 규칙의 용도를 설명하는 이름입니다.
- **`type`**: 정규식이 적용될 단계를 정의합니다.
  - `editinput` | `editoutput` | `editdisplay` | `editprocess` | `edittrans` | `disabled`
- **`ableFlag`** (선택 사항): 활성화 여부를 결정합니다.
- **`flag`** (선택 사항): 정규식 엔진에 전달할 플래그를 설정합니다.

## CBS 분석 영역

- **`@@@ IN`** 및 **`@@@ OUT`**: 두 섹션 모두 CBS 분석 및 언어 서비스(LSP)의 대상입니다.
- **프론트매터**: YAML 설정 섹션은 CBS 분석 대상에서 제외됩니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 캐릭터 카드 | `extensions.risuai.customScripts` 필드 |
| 모듈 | `customscript[]` 배열 필드 |
| 프리셋 | 추출 시 `presetRegex`를 읽고, 저장 시 `regex` 필드에 내용을 기록합니다. |

## 왕복 변환(Round-trip) 주의 사항

- **옵션 필드 처리**: `ableFlag`와 `flag`는 선택 사항입니다. 필드가 아예 없는 경우와 빈 값(`""`)이 있는 경우는 서로 다르게 취급하여 보존합니다.
- **구문 보존**: 데이터 마커 바로 앞의 구조적인 줄바꿈(Trailing newline)은 실제 데이터가 아닌 구문(Syntax)으로 처리하여 안정적인 변환을 보장합니다.
- **프리셋 브리지**: 프리셋의 경우 읽기(`presetRegex`)와 쓰기(`regex`) 필드명이 다르므로, 이를 단일한 표준 편집 인터페이스로 통합하여 관리합니다.

## 작성 예시

```text
---
comment: 생각보기
type: editdisplay
ableFlag: false
---
@@@ IN
<Thoughts>([\s\S]*?)<\/Thoughts>
@@@ OUT
{{#if {{? {{getglobalvar::toggle_thinkkniht}}=1}}}}
<Thoughts>
$1
</Thoughts>
{{/if}}
```


## 필드

- `comment`
- `type`: `editinput` | `editoutput` | `editdisplay` | `editprocess` | `edittrans` | `disabled`
- `ableFlag` (optional)
- `flag` (optional)

## CBS-bearing 영역

- `@@@ IN`
- `@@@ OUT`

frontmatter는 CBS-bearing이 아니다.

## upstream 매핑

| target | upstream surface |
|---|---|
| charx | `extensions.risuai.customScripts` |
| module | `customscript[]` |
| preset | extract는 `presetRegex`에서 canonical regex를 읽고, preset pack 저장은 canonical regex 내용을 `regex` 필드로 쓴다 |

## round-trip 메모

- `ableFlag`, `flag`는 truly optional이다. 없음과 빈 값은 다르게 취급한다.
- marker 바로 앞의 구조적 trailing newline 1개는 content가 아니라 syntax로 취급한다.
- multiple file surface이며, duplicate source는 `_order.json`과 실제 파일 집합이 함께 일치해야 한다.
- preset bridge 방향은 read 시 `presetRegex`, write 시 `regex`다. 두 이름을 같은 canonical surface로 문서화하면 안 된다.

## 예시

```text
---
comment: 생각보기
type: editdisplay
ableFlag: false
---
@@@ IN
<Thoughts>([\s\S]*?)<\/Thoughts>
@@@ OUT
{{#if {{? {{getglobalvar::toggle_thinkkniht}}=1}}}}<Thoughts>
$1
</Thoughts>
{{/if}}
```
