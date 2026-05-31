# Structured Output to UI Loop

> An authoring skill for turning compact model output into Regex-rendered UI, HTML buttons, Lua state changes, and next-turn variable feedback.

## Skill Card

| Field | Value |
|---|---|
| `name` | `structured-output-to-ui-loop` |
| `kind` | `authoring-guidance` |
| `use_when` | Use when model-generated tags must become UI cards, choices, buttons, or state changes. |
| `do_not_use_when` | Do not use for simple prose Lorebook writing or read-only tracing only. |
| `primary_artifacts` | Lorebook/prompt, Regex, Lua, HTML |

## Design Shape

This skill creates this loop:

```text
Lorebook or prompt contract
  -> model emits structured tag
  -> Lua detects or stores tag
  -> Regex renders tag as HTML
  -> button payload calls Lua
  -> Lua updates variables
  -> variables influence the next Lorebook/prompt
```

## Recommended Contract Rules

- Use one canonical tag name, such as `[Challenge|...]` or `<Choice>...</Choice>`.
- Do not translate parser-facing keys such as `DC`, `Success`, or `Difficulty Modifier`.
- Choose delimiters that both Lua and Regex can parse safely.
- Tell the model not to place delimiters inside free-form fields.
- Do not allow multiple shapes for the same semantic meaning.

## Build Recipe

1. Write three positive output examples and three negative examples.
2. Put the exact output format in a Lorebook entry or auxiliary prompt.
3. Let Lua detect the trigger with a narrow pattern.
4. Let Regex own display transformation only; keep gameplay logic in Lua.
5. Use stable ASCII action IDs for buttons.
6. Define whether generated blocks are kept in or removed from future requests.
7. Verify variable feedback one turn later.

## Starter Skeleton

```text
[Challenge|Short situation description|DC: Easy/Normal/Hard/Very Hard]

<Choice>
[Skill|Action|Risk|Success: Result|Difficulty Modifier:Easy/Normal/Hard/Very Hard]
</Choice>
```

Lua detection:

```lua
local challenge = response:match("%[Challenge%|.-%|DC:%s*.-%]")
if challenge then
  local dcLabel = challenge:match("DC:%s*([^%]]+)%]")
  setChatVar(id, "cv_current_dc_label", dcLabel)
end
```

## Common Pitfalls

- Asking the model to output free-form JSON, HTML, or text interchangeably.
- Using greedy Regex patterns that swallow multiple blocks.
- Changing a button payload schema without updating the Lua parser.
- Rerolling choices without removing the previous `<Choice>` block.
- Writing cleanup patterns that remove important narrative context.

## Acceptance Gate

- [ ] The structured tag grammar is documented.
- [ ] Positive and negative prompt examples exist.
- [ ] Lua parser, Regex pattern, HTML class, and button action ID share the same contract.
- [ ] Generated-block request inclusion/exclusion policy is defined.
- [ ] Reroll or regeneration flows define old-block cleanup.

## Evidence Paths

- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lorebooks/✨스킬_체크_시스템과_레벨_Skill_Check_System_and_Level.risulorebook`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lua/prompts/instruction_store.risulua`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lua/domain/main_rpg.risulua`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lua/runtime/listen_edit.risulua`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/regex/선택지_선택_Choice_Select.risuregex`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/regex/주사위_결과_Dice_Result.risuregex`

## Fixture Caveat

Producer and renderer evidence must both exist before claiming a full loop. A Lorebook contract alone proves intended output shape, not runtime handling. A Regex file alone proves display transformation, not model production.
