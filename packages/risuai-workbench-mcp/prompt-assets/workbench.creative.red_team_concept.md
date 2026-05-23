# Red-team concept

Target: {{target}}
Context: {{context}}

## Focus

Red-team a creative concept for safety, evidence gaps, and artifact risk.

## Workflow

Workflow:

1. Identify source artifact, ordering, frontmatter, token, and validation risks.
2. Classify risks as evidence-backed or assumption-backed.
3. Recommend reject, revise, validate, or preview; never apply changes from the prompt.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
