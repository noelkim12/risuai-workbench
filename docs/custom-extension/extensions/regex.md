# `.risuregex`

`regex`는 charx / module / preset이 공유하는 canonical artifact다. 각 파일은 하나의 regex rule을 표현하고, ordering은 `regex/_order.json`이 소유한다.

## 지원 대상 / 위치

- 지원 대상: `charx`, `module`, `preset`
- 디렉토리: `regex/`
- suffix: `.risuregex`
- ordering: `regex/_order.json`

## 형식

```text
---
comment: 상태창
type: editdisplay
ableFlag: true
flag: g<move_top>
---
@@@ IN
...
@@@ OUT
...
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
