# Find distant analogies

Target: {{target}}
Context: {{context}}

## Focus

Find distant analogies that can inspire RisuAI artifact ideas.

## Workflow

Workflow:

1. Extract the core problem shape from context.
2. Map distant analogy patterns back to concrete artifact ideas.
3. Keep output as proposals; mutation requires preview, confirmation, and existing gated mutation tools.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
