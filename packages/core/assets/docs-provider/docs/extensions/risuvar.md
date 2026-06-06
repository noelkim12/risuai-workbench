# `.risuvar` LLM authoring template

Use this guide when a `charx` or `module` workspace contains default variable settings. `.risuvar` is a strict line-based key/value file, not CBS.

## Canonical location

- Directory: `variables/`
- Extension: `.risuvar`
- Targets: `charx`, `module`
- Unsupported target: `preset`
- Filename: usually `variables/<targetName>.risuvar`

## Frontmatter

`.risuvar` has no frontmatter. The entire file is parsed line by line as variable entries. Do not add YAML blocks or `@@@` section markers.

## Parse rules

1. Split each non-blank line on the first `=` only.
2. Lines without `=` become keys with an empty string value.
3. Whitespace-only lines are ignored.
4. Internal whitespace in keys and values is preserved.
5. Both `\n` and `\r\n` line endings are accepted.

## Copy-paste template

```text
hp=100
display_name=Example Character
description=may contain = signs
empty_value=
flag_without_equals
```

## LLM editing rules

1. Do not trim or normalize existing key/value whitespace unless explicitly requested.
2. Do not create a second `.risuvar` file for the same target.
3. Do not treat this as a place for runtime preview overrides; it is the canonical default variable surface.
4. Preserve keys even when values are empty.
