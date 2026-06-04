# `.risuhtml` LLM authoring template

Use this guide when a `charx` or `module` workspace contains background HTML. `.risuhtml` is raw HTML/CSS/JS text, and the whole file may contain CBS macros.

## Canonical location

- Directory: `html/`
- Filename: `html/background.risuhtml`
- Extension: `.risuhtml`
- Targets: `charx`, `module`
- Unsupported target: `preset`

## Frontmatter

`.risuhtml` has no frontmatter. The whole file is HTML source. Do not add YAML blocks or `@@@` section markers.

## Copy-paste template

```html
<style>
  .risu-background {
    min-height: 100%;
    {{#if {{? {{screen_width}} > 768}}}}
    padding: 24px;
    {{/if}}
  }
</style>

<div class="risu-background">
  Background HTML content
</div>
```

## LLM editing rules

1. Keep the filename fixed as `html/background.risuhtml`.
2. Treat the file as an identity-preserved raw HTML payload; avoid unrelated formatting churn.
3. CBS macros can appear anywhere in the file and are analyzed as part of the full-file surface.
4. Do not create multiple `.risuhtml` files for one target.
