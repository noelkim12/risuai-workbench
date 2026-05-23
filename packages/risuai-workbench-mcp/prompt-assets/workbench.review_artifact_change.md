# Review artifact change

Target: {{target}}
Context: {{context}}

## Focus

Review a proposed artifact change against canonical structure rules.

## Workflow

Workflow:

1. Inspect the target path or artifact root.
2. Read wiki/rule/schema resources relevant to the change.
3. Run validators and summarize risks before any preview step.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
