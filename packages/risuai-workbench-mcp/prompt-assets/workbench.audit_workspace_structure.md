# Audit workspace structure

Target: {{target}}
Context: {{context}}

## Focus

Audit workspace artifact roots, marker files, metadata, frontmatter, and ordering policy.

## Workflow

Workflow:

1. Inspect representative artifact roots.
2. Run structure validators in read-only mode.
3. Report grouped findings and next tests.

## Safety contract

Safety contract:

- Use Workbench tools; prompts do not write files.
