# Explain diagnostic

Target: {{target}}
Context: {{context}}

## Focus

Explain one diagnostic and likely remediation paths.

## Workflow

Workflow:

1. Read the diagnostic resource or diagnostic id context.
2. Map the diagnostic to rule/schema context.
3. Recommend validation and preview steps without applying changes.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
