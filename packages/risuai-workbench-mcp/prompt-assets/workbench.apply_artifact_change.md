# Apply artifact change

Target: {{target}}
Context: {{context}}

## Required first step

Before selecting any Workbench tool, call `workbench.route_intent` with the user request, artifact target, context, and any available patchPlanId.
Treat the route result as advisory workflow guidance, not authorization.
Use only tools listed in `allowedTools` for the next safe step.
For CBS-bearing artifacts (`.risulorebook`, `.risuprompt`, `.risuregex`, `.risuhtml`), use the facade flow to run internal action ids such as `validate.cbs_syntax` and `analyze.query_cbs_usage` before any mutation preview or apply. This detects unknown tags, deprecated syntax, and argument errors using the canonical CBS diagnostics engine.
Prefer tools listed in `recommendedTools` before broader allowed tools.
Treat tools listed in `discouragedTools` as advisory warnings: avoid them unless the user's request explicitly requires that tool and all safety gates still pass.
Do not call tools listed in `blockedTools`.
If `nextStep` is `clarify`, stop and ask only for the missing input.
Respect route output.
Use Workbench tools for workspace changes.

File affordance rules:

- `.charx`, `.risum`, `.risup` with extract/import/unpack/open language are external RisuAI archives. Use `core.run_extract` through `workbench.run_action`; do not hand-unzip.
- `.risuchar` and `.risumodule` are canonical workspace root markers. Use `inspect.path` and `validate.root_markers`; do not treat them as external archives.
- `.risulua` should route through Lua analysis actions before mutation: `analyze.query_lua_analysis`, `analyze.query_lua_call_graph`, `analyze.query_lua_state_access`, and `analyze.query_risulua_api`.
- `.risulorebook`, `.risuregex`, and `.risuprompt` are CBS-bearing artifacts. Validate CBS syntax and query CBS usage before mutation preview.
- `.risuhtml` is a canonical background HTML artifact. Inspect and validate the path first; use CBS validation only when the request or file text contains CBS syntax or CBS keywords.
- `_order.json` should route through order validation and structured order patch preview, not direct JSON edits.

## Focus

Guide an artifact change through inspect, validate, preview, apply, and post-validate phases. When the user mentions a RisuAI archive path (`.risum`, `.charx`, or `.risup`) and asks to extract, unpack, or import it, do not read the binary archive as text, do not hand-unzip it, and do not call legacy `workbench.run_extract` in default MCP mode. Use the facade flow, then call `workbench.run_action` with internal action id `core.run_extract`. When the user asks to create, initialize, or scaffold a new RisuAI project (charx, module, or preset), prefer the scaffold workflow instead of `workbench.create_artifact` or manual file creation.

## Workflow

Workflow:

1. Inspect path ownership first.
2. Create or review a patch preview with a stable patch plan id.
3. Apply the stored preview when the user requests the write.

## Safety contract

Safety contract:

- Use Workbench tools; prompts do not write files.
