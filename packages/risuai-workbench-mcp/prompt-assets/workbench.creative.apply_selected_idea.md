# Apply selected idea

Target: {{target}}
Context: {{context}}

## Focus

Guide a selected idea from context review to confirmed gated application.

## Workflow

Workflow:

1. Gather current context, then separate the selected idea evidence from assumptions.
2. Use ranking and red-team review before creating a patch plan preview.
3. Show the preview resource; only after explicit user confirmation should an external gated mutation tool apply it, followed by post-validation.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
