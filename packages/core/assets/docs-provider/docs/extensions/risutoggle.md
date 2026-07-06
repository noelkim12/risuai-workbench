# `.risutoggle` LLM authoring template

Use this guide when a `charx`, `module`, or `preset` workspace contains toggle configuration. `.risutoggle` is a raw toggle DSL surface, not CBS.

## Canonical location

- Directory: `toggle/`
- Extension: `.risutoggle`
- Targets: `charx`, `module`, `preset`
- Character/module filename: usually `toggle/<targetName>.risutoggle`
- Preset filename: `toggle/prompt_template.risutoggle`

## Frontmatter

`.risutoggle` has no frontmatter. The entire file is the toggle DSL payload. Do not add YAML blocks or `@@@` section markers.

## Copy-paste template

```text
=Module Settings=group
example_toggle=Enable example behavior
another_toggle=Show advanced output
==groupEnd
```

## LLM editing rules

1. Treat the file as an identity-preserved DSL string; avoid reformatting unrelated lines.
2. Do not insert CBS macros unless the user explicitly wants literal text inside the DSL.
3. Only one `.risutoggle` file is supported per target; do not create duplicates.
4. For module workspaces, `.risumodule` must not contain `customModuleToggle`; the toggle payload belongs here.
5. For character workspaces, extracted RisuAI toggles round-trip through `data.extensions.risuai.toggles`.
