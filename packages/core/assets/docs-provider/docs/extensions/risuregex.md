# `.risuregex` LLM authoring template

Use this guide when a workspace contains `regex/**/*.risuregex` files. A `.risuregex` file is one canonical regex rule shared by `charx`, `module`, and `preset` targets.

## Canonical location

- Directory: `regex/`
- Extension: `.risuregex`
- Targets: `charx`, `module`, `preset`
- Ordering: `regex/_order.json` is the source of truth for execution/display order.

## Frontmatter

The YAML block controls regex rule metadata. It is not CBS-bearing content.

| Field | Required | Meaning |
| --- | --- | --- |
| `comment` | yes | Human-facing rule name or description. |
| `type` | yes | Application stage: `editinput`, `editoutput`, `editdisplay`, `editprocess`, `edittrans`, or `disabled`. |
| `ableFlag` | optional | Enabled/disabled flag. Absence and an explicit empty value are different and should be preserved. |
| `flag` | optional | Regex flags plus RisuAI movement modifiers such as `g<move_top>`. Do not assume this is only JavaScript regex flags. |

## Body sections

- `@@@ IN`: input pattern/matcher. CBS analysis can inspect this section.
- `@@@ OUT`: replacement/output template. CBS macros may be used here.

Both `IN` and `OUT` are CBS-bearing sections; frontmatter is not.

## Copy-paste template

```text
---
comment: "New display rule"
type: editdisplay
ableFlag: true
flag: g
---
@@@ IN
<pattern>([\s\S]*?)</pattern>
@@@ OUT
{{#if {{? {{getglobalvar::toggle_example}}=1}}}}
$1
{{/if}}
```

## LLM editing rules

1. Preserve optional field absence: do not add `ableFlag` or `flag` just to normalize a file.
2. Keep `_order.json` synchronized when adding, deleting, or renaming regex files.
3. Do not rewrite regex flags into plain JS flags; RisuAI-specific markers may be valid.
4. Preserve structural section markers exactly: one `@@@ IN` and one `@@@ OUT` per rule.
