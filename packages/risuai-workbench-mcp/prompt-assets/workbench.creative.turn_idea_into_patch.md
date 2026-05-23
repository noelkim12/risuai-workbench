# Turn idea into patch

Target: {{target}}
Context: {{context}}

## Focus

Turn a selected idea into a patch-plan request without applying it.

## Workflow

Workflow:

1. Verify selected idea evidence, assumptions, and affected files.
2. Draft expected operations, diagnostics, validation, and resource links for a patch preview.
3. Stop at preview; applying requires explicit confirmation and a gated mutation tool.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
