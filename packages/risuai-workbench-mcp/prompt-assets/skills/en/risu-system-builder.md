# Risu System Builder

> An authoring skill for designing a new RisuAI `charx` or `module` as one coordinated Lua, Regex, Lorebook, HTML, and variable system.

## Skill Card

| Field | Value |
|---|---|
| `name` | `risu-system-builder` |
| `kind` | `authoring-guidance` |
| `use_when` | Use when designing feature boundaries, artifact roles, and state flow for a new RisuAI system. |
| `do_not_use_when` | Do not use for auditing an existing workspace or tracing one variable flow only. |
| `primary_artifacts` | `.risulorebook`, `.risulua`, `.risuregex`, `.risuhtml`, variables |

## Creation Contract

This skill should produce an authoring blueprint, not implementation code by default. The blueprint must answer these questions:

1. What structured output should the model emit?
2. What state and side effects does Lua own?
3. What markers does Regex transform into display HTML?
4. What visual surface does HTML/CSS provide?
5. Which variables feed back into the next Lorebook or prompt activation?

## Artifact Role Split

| Layer | Owns | Must not own |
|---|---|---|
| Lorebook | World rules, system rules, structured output contracts | Button handling or state mutation |
| Lua | State, auxiliary LLM calls, button actions, save/load | Large amounts of decorative HTML without a contract |
| Regex | Compact tag to display/request transformation | Gameplay state source of truth |
| HTML/CSS | Visual panels, cards, buttons, layout | Prompt-shaping rules |
| Variables | Cross-artifact contracts and feedback loops | Overlapping temporary names with unclear ownership |

## Build Recipe

1. Name the feature domain and namespace, such as `rpg`, `quest`, or `relationship`.
2. Define one model output contract first, such as `[Challenge|...|DC: Hard]`.
3. Write the state schema. Separate persistent state from `cv_` UI mirrors.
4. Choose the Lua runtime hook: `onOutput` for post-generation processing, `onButtonClick` for UI actions.
5. Define Regex transformations from model-friendly text to user-friendly HTML.
6. Define HTML/CSS classes, panels, buttons, and latest-message gating.
7. Define cleanup boundaries: what stays in future prompts and what must be hidden.
8. Write one end-to-end turn example.

## Starter Skeleton

```text
Lorebook contract
  -> [FeatureTag|field|field]
Lua onOutput
  -> parse FeatureTag
  -> update state
  -> optionally call auxiliary LLM
Regex display
  -> transform FeatureTag or generated block to HTML
HTML/CSS
  -> panel/card/button classes
Lua onButtonClick
  -> handle stable action id
Variable feedback
  -> cv_ mirror and lorebook activation variable
Cleanup
  -> remove hidden markers from future requests
```

## Common Pitfalls

- Asking the model to generate raw HTML and skipping the Regex/Lua contract.
- Treating button display text and action ID as the same thing.
- Mixing `cv_` UI mirrors with gameplay source state.
- Treating `dist/*.risulua` as the source authoring surface.
- Placing display-only CBS in prompt-shaping Lorebook content.

## Acceptance Gate

- [ ] Each artifact role is described in one sentence.
- [ ] At least one full-turn example exists.
- [ ] Lua state keys, chat vars, Regex markers, and button IDs follow one namespace rule.
- [ ] Hidden markers and next-prompt markers are separated.
- [ ] Source-first boundaries are explicit: `lua/**/*.risulua` is source, `dist/*.risulua` is generated/export output.

## Evidence Paths

- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lua/domain/main_rpg.risulua`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/lua/state/variable_store.risulua`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/regex/패널_Panel.risuregex`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/html/background.risuhtml`
- `test_suites/extraction_targets/⚔️ Merry RPG 모듈 V1.3/docs/risulua-split-report.md`
- `docs/reference/LUA_FOR_LLM.md`
- `docs/reference/CBS_FOR_LLM.md`

## Fixture Caveat

Extraction target files are implementation evidence, not automatically canonical clean patterns. Prefer split source paths for authoring claims. Treat `dist/*.risulua`, `legacy/original.risulua`, generated wiki, and analysis output as secondary evidence unless the skill explicitly discusses packaging or recovery.
