# RisuAI Workbench MCP agent guideline

Use this guide when an MCP-compatible agent works with a RisuAI Workbench workspace created by `scaffold` or `extract`.

Workbench MCP is for workspace-aware work: archive extraction, root/path ownership, validation, RisuLua/CBS analysis, and large generated context. For simple prose edits, edit the canonical source file directly and validate only when structure, ordering, Lua, variables, prompts, buttons, regex, generated output, or cross-file references are affected.

---

## 1. Start with workspace shape

Identify the root marker first:

- `.risuchar`: character/card workspace
- `.risumodule`: module workspace
- both or neither: stop and ask

If the MCP server or workspace root is unclear, run `workbench.smoke` before choosing an action.

If ownership or canonical path is unclear, check:

```text
validate.root_markers
inspect.path
validate.path
validate.artifact
```

Generated `analysis/**`, `wiki/**`, and `dist/**` are evidence, not source of truth, unless the user asks to edit generated output.

---

## 2. Use facade tools by job

Facade tools are the MCP tools the agent calls. Action IDs are values passed into facade tools.

```text
MCP tool:  workbench.run_action
Action ID: inspect.path
```

Do not call an action ID as an MCP tool. To run an action ID, pass it as `actionId`:

```text
workbench.run_action({ actionId: "inspect.path", args: { path: "..." } })
```

Use this decision table:

| Job | Facade tool | Next step |
| --- | --- | --- |
| Check server/workspace state | `workbench.smoke` | Continue if the workspace root is expected. |
| Classify an unclear request | `workbench.route_intent` | Use the returned intent/capability with `catalog`. |
| Find candidate actions | `workbench.catalog` | Choose one action ID, then run `prepare_action`. |
| Check required inputs | `workbench.prepare_action` | Fill args, then use `run_action`. |
| Inspect, validate, analyze, or extract | `workbench.run_action` | Pass `actionId` and `args`. |
| Store/search/summarize large context | `workbench.context` | Pass `contextId` into later actions when supported. |

When the action is unclear, use the full flow:

```text
workbench.route_intent -> workbench.catalog -> workbench.prepare_action -> workbench.run_action
```

When the action ID is already known, use the short flow:

```text
workbench.prepare_action -> workbench.run_action
```

---

## 3. Extract archives through Workbench MCP

For `.risum`, `.charx`, or `.risup`, use Workbench MCP extraction. Do not read them as plain text or manually unzip them for canonical Workbench extraction.

Prepare the action if the required args are unclear:

```text
workbench.prepare_action({ actionId: "core.run_extract" })
```

Then run extraction through `workbench.run_action`:

```text
workbench.run_action({
  actionId: "core.run_extract",
  args: { sourcePath: "path/to/input.risum", outDir: "path/to/output", type: "module" }
})
```

| Archive | `type` |
| --- | --- |
| `.risum` | `module` |
| `.charx` | `character` |
| `.risup` | `preset` |

`.risuchar` and `.risumodule` are workspace markers, not archive inputs. If `outDir` is omitted, Workbench derives one from the source filename. Extract may create analysis/wiki output for orientation.

---

## 4. Common action map

Use `workbench.prepare_action` before running an unfamiliar action ID.

| Need | Action ID | Run through |
| --- | --- | --- |
| File/path ownership | `inspect.path`, `validate.path` | `workbench.run_action` |
| Root markers | `validate.root_markers` | `workbench.run_action` |
| Artifact structure | `validate.artifact` | `workbench.run_action` |
| `_order.json` validation | `validate.order` | `workbench.run_action` |
| CBS syntax | `validate.cbs_syntax` | `workbench.run_action` |
| Lua source/calls/state | `analyze.query_lua_analysis`, `analyze.query_lua_call_graph`, `analyze.query_lua_state_access` | `workbench.run_action` |
| Buttons/variables/prompts | `analyze.query_button_actions`, `analyze.query_variable_flow`, `analyze.query_prompt_chain` | `workbench.run_action` |
| Composition/token budget | `analyze.query_composition_conflicts`, `analyze.query_token_budget` | `workbench.run_action` |

If `catalog` returns multiple actions, prefer the narrowest action that answers the user's request. If none clearly match, ask instead of guessing.

---

## 5. Edit canonical files, then validate narrowly

1. Identify the canonical source file.
2. Make the smallest task-satisfying change.
3. Update `_order.json` only when ordered files are added, deleted, or renamed.
4. Cross-check shared names across variables, triggers, buttons, regex, lorebooks, prompts, and Lua.
5. Run the narrowest relevant validation or analysis.

Examples:

- `.risulua` behavior or public names changed -> Lua analysis or call graph
- CBS-bearing files changed -> CBS syntax validation
- ordered artifacts changed -> matching `_order.json` validation
- root metadata changed -> root marker or metadata validation

---

## 6. Use context handles for large inputs

For large reports, analysis payloads, wiki material, or multi-file context, use context records instead of pasting full content.

```text
workbench.context(create/search/summarize/read)
```

Pass `contextId` into later Workbench actions when supported. Release records when no longer needed.

---

## 7. Report what was checked

Finish with:

- changed canonical files
- Workbench MCP facade tool and action ID used
- warnings or unresolved ambiguity
- whether generated output was read as evidence or changed intentionally

Do not claim the workspace is valid unless the relevant validation, analysis, pack, build, or extract workflow actually ran.
