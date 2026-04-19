# Risu Workbench Identity Design

## Problem

We need a sharper, evidence-backed identity for `risu-workbench` that can be stated in project docs and agent guidance.

The identity must reflect two realities at once:

- `risu-workbench` is centered on a VSCode extension, not a generic CLI or future concept.
- The extension exists to work with RisuAI-native authoring artifacts such as bot settings, modules, character cards, lorebook data, CBS/Lua-adjacent scripting concerns, and related export flows.

The wording must also avoid a misleading claim that this project replaces RisuAI itself. It should instead describe a creator-focused IDE/workbench for essential RisuAI authoring workflows.

## Findings

### Headline And Role Definition

- The strongest top-level framing is a Creator IDE for RisuAI: an end-to-end, RisuAI-specific authoring environment inside VSCode.
- This is stronger than calling it only an importer, scaffolder, or viewer, because the existing codebase already includes extension commands, a tree view, a webview host, and a core engine for active processing workflows.

### Canonical Workflow

- The identity should foreground `edit + analyze` first.
- It should then describe `import/extract` from existing RisuAI artifacts and `export back` to valid RisuAI formats.
- Runtime simulation should be presented as a secondary capability.
- Zero-base scaffold generation should be present, but as an optional starting mode rather than the whole product definition.

### First-Class Artifact Coverage

- The identity should explicitly name these domains:
  - bot settings
  - modules
  - character cards
  - analysis outputs
  - project scaffold
- Leaving these implied makes the workbench sound too vague and undersells its actual scope.

### RisuAI-Specific Differentiators

- The product should explicitly call out the parts that make it uniquely RisuAI:
  - CBS tooling
  - Lua analysis/tooling
  - lorebook domain logic and structure management
  - strict export contract fidelity
  - runtime simulation without live model invocation

### Misread To Prevent

- The identity must actively prevent the misunderstanding that `risu-workbench` is a full replacement for RisuAI.
- The better framing is: it covers the essential authoring and maintenance layer for RisuAI projects, while staying focused on development-time workflows.

### Recognition Test

- After reading the identity statement, a new reader should understand that `risu-workbench` is the VSCode-based creator IDE for unpacking, editing, analyzing, scaffolding, and exporting core RisuAI artifacts.
- They should also understand that it focuses on essential authoring elements rather than reproducing the entire RisuAI application.

## Recommendation

Use an extension-first identity with explicit RisuAI scope.

Recommended positioning:

`risu-workbench` is the VSCode creator IDE for RisuAI projects. It imports or scaffolds bot settings, modules, character cards, and analysis-ready project structure, then gives creators dedicated tooling for CBS, Lua, lorebook, and other RisuAI-specific authoring elements before exporting back to valid RisuAI formats.

Recommended guardrail sentence:

It is not a replacement for the full RisuAI app; it is the developer-focused workbench for the essential artifacts and workflows that are painful to manage in raw files or ad-hoc web flows.

Recommended emphasis order in future docs:

1. VSCode creator IDE for RisuAI
2. Edit and analyze RisuAI-native artifacts
3. Import/extract and zero-base scaffold support
4. Export contract fidelity back to RisuAI
5. Runtime simulation without live LLM execution
