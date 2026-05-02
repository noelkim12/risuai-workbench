# 프롬프트 템플릿 표준 (.risuprompt)

`.risuprompt`는 프리셋(preset) 대상에서만 사용하는 전용 표준 아티팩트 명세입니다. 파일 하나가 하나의 프롬프트 항목(Prompt Item)을 나타내며, 전체 항목의 배열 순서는 `prompt_template/_order.json` 파일에서 엄격하게 관리합니다.

## 지원 범위 및 위치

- **지원 대상**: 프리셋(`preset`)
- **파일 위치**: `prompt_template/` 디렉토리
- **확장자**: `.risuprompt`
- **정렬 신뢰 기준**: `prompt_template/_order.json`

## 표준 파일 형식 (Format)

모든 `.risuprompt` 파일은 설정 섹션(YAML)으로 시작하며, 본문에는 `@@@ <SECTION>` 마커를 사용한 데이터 섹션이 올 수 있습니다.

```text
---
type: plain
type2: main
role: system
name: AI 핵심 지침 및 제약 사항
---
@@@ TEXT
프롬프트 내용...
```

> **주의**: 프롬프트의 종류(`type`)에 따라 사용할 수 있는 설정 필드와 데이터 섹션이 달라집니다. 모든 타입이 동일한 형식을 공유하지 않으므로 주의하십시오.

## 지원되는 프롬프트 타입 (12종)

현재 워크벤치가 지원하는 `type` 값은 다음과 같습니다.

1. **일반 텍스트 계열**: `plain`, `jailbreak`, `cot` (Chain of Thought)
2. **채팅 포맷 계열**: `chatML`
3. **내부 형식(Inner-format) 계열**: `persona`, `description`, `lorebook`, `postEverything`, `memory`
4. **특수 목적 계열**: `authornote` (작가 노트)
5. **범위 지정 계열**: `chat` (채팅 로그 범위)
6. **캐시 제어 계열**: `cache` (Context Caching)

## 타입별 상세 명세

### 1. 일반 텍스트 계열 (`plain`, `jailbreak`, `cot`)

- **필수 설정**:
  - `type`: `plain | jailbreak | cot`
  - `type2`: `normal | globalNote | main`
  - `role`: `user | bot | system`
- **선택 설정**: `name` (항목 이름)
- **허용 섹션**: `@@@ TEXT`
- **특이 사항**: `type2`와 `role` 필드는 이 계열에서만 필수이며, 다른 프롬프트 타입에서는 사용되지 않습니다.

### 2. 채팅 포맷 계열 (`chatML`)

- **필수 설정**: `type: chatML`
- **선택 설정**: `name`
- **허용 섹션**: `@@@ TEXT`
- **특이 사항**: `role`이나 `type2` 필드를 설정하지 않습니다.

### 3. 내부 형식 계열 (`persona`, `description`, `lorebook`, `postEverything`, `memory`)

- **필수 설정**: `type` (해당하는 5가지 값 중 하나)
- **선택 설정**: `name`
- **허용 섹션**: `@@@ INNER_FORMAT`
- **특이 사항**: `INNER_FORMAT` 섹션만을 가질 수 있으며, `TEXT`나 `DEFAULT_TEXT` 섹션은 허용되지 않습니다.

### 4. 작가 노트 (`authornote`)

- **필수 설정**: `type: authornote`
- **선택 설정**: `name`
- **허용 섹션**: `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT`
- **특이 사항**: 일반 텍스트가 아닌 내부 형식과 기본 텍스트의 조합을 사용합니다.

### 5. 채팅 로그 범위 지정 (`chat`)

- **필수 설정**:
  - `type: chat`
  - `range_start`: 시작 위치 (정수)
  - `range_end`: 종료 위치 (정수 또는 `end` 문자열)
- **선택 설정**: `name`, `chat_as_original_on_system` (Boolean)
- **허용 섹션**: 없음 (본문 데이터를 가지지 않음)
- **표기 규칙**: 워크벤치 내부에서는 CamelCase를 쓰지만, 파일 내 설정 섹션(YAML)에서는 반드시 snake_case를 사용해야 합니다 (예: `rangeStart` → `range_start`).

### 6. 컨텍스트 캐싱 (`cache`)

- **필수 설정**:
  - `type: cache`
  - `name`: 캐시 이름
  - `depth`: 캐시 깊이 (정수)
  - `cache_role`: 캐시 역할 (`user | assistant | system | all`)
- **허용 섹션**: 없음
- **특이 사항**: 일반 `role`이 아닌 `cache_role` 필드를 사용하며, `assistant`나 `all` 같은 값은 이 타입에서만 유효합니다.

## CBS 분석 섹션 매핑

워크벤치가 인식하는 데이터 섹션 마커는 다음과 같습니다. 각 타입에 허용되지 않은 섹션을 사용하면 파싱 오류가 발생합니다.

- **`@@@ TEXT`**: 일반 텍스트 및 채팅 포맷 계열에서 사용
- **`@@@ INNER_FORMAT`**: 내부 형식 계열 및 작가 노트에서 사용
- **`@@@ DEFAULT_TEXT`**: 작가 노트에서만 사용
- **섹션 없음**: 채팅 범위 및 캐시 제어 타입

## `_order.json` 관리 규칙

`prompt_template/_order.json` 파일은 프롬프트 항목 배열의 전체 순서를 결정하는 엄격한 신뢰 기준입니다.

- **값 구성**: 반드시 `.risuprompt` 파일의 순수한 파일명(확장자 제외) 배열이어야 합니다.
- **중복 금지**: 중복된 파일명 엔트리는 허용되지 않습니다.
- **완결성 유지**: `_order.json`에 명시된 파일 목록은 실제 디렉토리 내의 파일 집합과 정확히 일치해야 합니다. 누락된 파일이 있거나 존재하지 않는 파일을 참조할 경우 오류로 처리합니다.

## 상위(Upstream) 필드 매핑

| 대상 | 매핑되는 상위 인터페이스 |
|---|---|
| 프리셋 | `botPreset.promptTemplate` 배열 필드 |

## 왕복 변환(Round-trip) 주의 사항

- **엄격한 검증**: 파싱 시 각 타입(Variant)별로 허용된 필드와 섹션만을 엄격히 검증합니다.
- **필드 정제**: 상위 포맷에서 임포트할 때 화이트리스트에 없는 필드는 제거하고 표준 명세에 맞는 데이터만 남깁니다.
- **직렬화 규칙**: 내보내기 시 각 타입에 맞는 실제 필드명으로 변환합니다 (예: `cache` 타입의 `cache_role` 필드 등).
