# `.risuprompt`

`prompt-template`는 preset 전용 canonical artifact다. `.risuprompt` 파일 1개가 prompt item 1개를 나타내고, 전체 배열 순서는 `prompt_template/_order.json`이 엄격하게 소유한다.

## 지원 대상 / 위치

- 지원 대상: `preset`
- 디렉토리: `prompt_template/`
- suffix: `.risuprompt`
- ordering source: `prompt_template/_order.json`

## 형식 개요

모든 `.risuprompt` 파일은 YAML frontmatter로 시작한다. 그 뒤 body에는 `@@@ <SECTION>` 블록이 올 수 있다.

```text
---
type: plain
type2: main
role: system
name: AI Mandate & Core Constraints
---
@@@ TEXT
...
```

중요한 점은, frontmatter 필드와 body section이 `type`마다 다르다는 것이다. 모든 prompt type이 같은 필드나 section을 공유하지 않는다.

## 지원되는 prompt family

현재 구현이 허용하는 `type` 값은 아래 12개다.

- plain family: `plain`, `jailbreak`, `cot`
- text-only typed prompt: `chatML`
- inner-format typed prompt: `persona`, `description`, `lorebook`, `postEverything`, `memory`
- special typed prompt: `authornote`
- range prompt: `chat`
- cache prompt: `cache`

지원되지 않는 `type`은 canonical parsing 단계에서 에러다.

## type별 canonical surface

### 1. Plain family, `plain`, `jailbreak`, `cot`

이 세 타입은 같은 shape를 공유한다.

필수 frontmatter:

- `type`: `plain | jailbreak | cot`
- `type2`: `normal | globalNote | main`
- `role`: `user | bot | system`

선택 frontmatter:

- `name`

허용 body section:

- `@@@ TEXT`

canonical object surface:

```text
type
type2
role
text
name?
```

`type2`와 `role`은 plain family에서만 요구된다. `globalNote`, `main` 같은 값은 다른 prompt family에 일반화되지 않는다.

### 2. `chatML`

필수 frontmatter:

- `type: chatML`

선택 frontmatter:

- `name`

허용 body section:

- `@@@ TEXT`

canonical object surface:

```text
type
text
name?
```

`chatML`은 `role`이나 `type2`를 받지 않는다.

### 3. Inner-format typed prompt, `persona`, `description`, `lorebook`, `postEverything`, `memory`

필수 frontmatter:

- `type`: 위 다섯 값 중 하나

선택 frontmatter:

- `name`

허용 body section:

- `@@@ INNER_FORMAT`

canonical object surface:

```text
type
innerFormat?
name?
```

이 group은 `INNER_FORMAT`만 조건부로 가진다. `TEXT`, `DEFAULT_TEXT`, `role`, `type2`는 허용되지 않는다.

### 4. `authornote`

필수 frontmatter:

- `type: authornote`

선택 frontmatter:

- `name`

허용 body section:

- `@@@ INNER_FORMAT`
- `@@@ DEFAULT_TEXT`

canonical object surface:

```text
type
innerFormat?
defaultText?
name?
```

`authornote`는 `TEXT`가 아니라 `INNER_FORMAT`, `DEFAULT_TEXT` 조합을 가진다.

### 5. `chat`

필수 frontmatter:

- `type: chat`
- `range_start`
- `range_end`

선택 frontmatter:

- `name`
- `chat_as_original_on_system`

허용 body section:

- 없음

canonical object surface:

```text
type
rangeStart
rangeEnd
chatAsOriginalOnSystem?
name?
```

세부 규칙:

- `rangeStart`는 정수다.
- `rangeEnd`는 정수 또는 literal `end`다.
- `chatAsOriginalOnSystem`은 선택 boolean이다.

문서에서 camelCase로 설명한 canonical field는 파일 안에서는 snake_case frontmatter로 직렬화된다. 즉 `rangeStart` → `range_start`, `rangeEnd` → `range_end`, `chatAsOriginalOnSystem` → `chat_as_original_on_system`이다.

### 6. `cache`

필수 frontmatter:

- `type: cache`
- `name`
- `depth`
- `cache_role`

허용 body section:

- 없음

canonical object surface:

```text
type
name
depth
role
```

세부 규칙:

- `depth`는 정수다.
- canonical object의 `role` 값은 `user | assistant | system | all`이다.
- 파일 frontmatter에서는 일반 `role`이 아니라 `cache_role`을 쓴다.

cache role 값은 plain family role 값과 별도 집합이다. 예를 들어 `assistant`, `all`은 cache에서만 허용된다.

## CBS-bearing section

구현이 인식하는 section 이름은 아래 셋뿐이다.

- `@@@ TEXT`
- `@@@ INNER_FORMAT`
- `@@@ DEFAULT_TEXT`

하지만 이 세 section이 모든 prompt type에 열려 있는 것은 아니다.

- `TEXT`: `plain`, `jailbreak`, `cot`, `chatML`
- `INNER_FORMAT`: `persona`, `description`, `lorebook`, `postEverything`, `memory`, `authornote`
- `DEFAULT_TEXT`: `authornote`
- section 없음: `chat`, `cache`

지원되지 않는 section, 또는 해당 type에 허용되지 않은 section은 canonical parsing 에러다.

## `_order.json` strictness

`prompt_template/_order.json`은 prompt item 배열의 전체 순서를 정의하는 strict source다.

- 값은 `.risuprompt` basename 배열이어야 한다.
- 각 entry는 path가 아닌 basename이어야 한다.
- 중복 entry는 허용되지 않는다.
- `_order.json`이 존재한다면 실제 파일 집합을 완전히 덮어야 한다.
- `_order.json`이 참조하지 않는 파일이 있거나, 반대로 없는 파일을 참조하면 에러다.

즉 일부 파일만 나열해서 fallback 정렬을 기대하는 방식은 허용되지 않는다.

## upstream 매핑

| target | upstream surface |
|---|---|
| preset | `botPreset.promptTemplate` |

## round-trip 메모

- canonical parsing은 variant별 허용 필드와 허용 section을 엄격하게 검증한다.
- upstream import normalization은 variant whitelist 바깥의 orphan field를 버리고 canonical surface만 남긴다.
- canonical export는 각 variant의 실제 field 이름으로 직렬화한다. 예를 들어 `cache`는 `cache_role`, `chat`는 snake_case range field를 사용한다.
