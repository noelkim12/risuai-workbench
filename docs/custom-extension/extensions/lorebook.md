# `.risulorebook`

`lorebook`는 charx / module이 공유하는 canonical artifact다. 현재 구현의 source of truth는 개별 `.risulorebook` 파일과 `lorebooks/_order.json`이며, `_folders.json`은 canonical authoring contract를 대신하는 주 surface가 아니라 compatibility marker support로 남아 있다.

## 지원 대상 / 위치

- 지원 대상: `charx`, `module`
- 디렉토리: `lorebooks/`
- suffix: `.risulorebook`
- ordering: `lorebooks/_order.json`

## 현재 canonical 형식

```text
---
name: ...
comment: ...
mode: normal|folder|constant|multiple|child
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
folder: null
book_version: 2
activation_percent: 15
id: lore-1
---
@@@ KEYS
...
@@@ SECONDARY_KEYS
...
@@@ CONTENT
...
```

## CBS-bearing 영역

- `@@@ CONTENT`만 CBS-bearing이다.
- frontmatter, `@@@ KEYS`, `@@@ SECONDARY_KEYS`는 fragment mapping 대상이 아니다.

## path-based folder identity

- 현재 구현은 `lorebooks/<folder...>/<entry>.risulorebook` 경로를 정체성의 기준으로 본다.
- `_order.json`은 폴더 경로와 파일 상대 경로를 함께 보존하는 path-based ordering marker다.
- canonical workspace contract는 path-based `.risulorebook` 파일 집합 + `_order.json`이다.
- `_folders.json`은 folder marker compatibility input, marker terminology 유지, round-trip aid를 위한 지원 surface다. path-based 정보가 있으면 assembly precedence는 경로와 `_order.json` 쪽이 먼저다.
- 따라서 `_folders.json`은 여전히 parse, serialize, build 대상이지만, canonical emitted workspace에서 우선적으로 설명할 출력물은 아니다.

## upstream 매핑

| target | upstream surface |
|---|---|
| charx | `char_book` + `extensions.risu_bookVersion` 등 lorebook 관련 확장 필드 |
| module | `_moduleLorebook` (`loreBook[]`) |

## round-trip 메모

- charx는 `book_version`를 `extensions.risu_bookVersion` 경계로 왕복시킨다.
- charx export는 canonical `name`을 `comment`로 덮어쓰지 않고 보존해야 한다.
- folder lorebook ordering과 folder identity는 path-based 상대 경로와 `_order.json`을 기준으로 유지한다.
- `_folders.json`이 있으면 compatibility marker input으로 받아들이되, folder assembly와 emitted ordering 판단은 canonical path surface를 우선한다.

## 예시

```text
---
name: "🌟 이벤트 - 반전"
comment: "🌟 이벤트 - 반전"
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
Twist.
{{/if}}
```
