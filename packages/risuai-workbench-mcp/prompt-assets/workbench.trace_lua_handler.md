# Trace Lua handler

Target: {{target}}
Context: {{context}}

## Focus

Trace Lua handler and call graph context.

## Workflow

Workflow:

1. Read analyze graph or Lua call graph resources.
2. Summarize handler callers/callees and state access.
3. Recommend tests without applying code edits.

## Safety contract

Safety contract:

- Use Workbench tools; prompts do not write files.
