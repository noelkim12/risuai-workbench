# MCP prompt asset index

이 문서는 `prompt-assets/manifest.json`에 노출된 MCP prompt workflow 이름과 Markdown prompt asset 파일을 한눈에 보기 위한 색인입니다. 사용자가 말하는 “tool 이름”은 여기서는 MCP tool이 아니라 MCP prompt/workflow name으로 봅니다.

Source of truth 경계는 다음과 같습니다.

- Registry, `src/registry/index.ts`가 prompt `name`, `title`, `description`을 관리합니다.
- Manifest, `prompt-assets/manifest.json`이 prompt name과 Markdown asset 파일 매핑을 관리합니다.
- Markdown asset, `prompt-assets/*.md`가 실제 prompt body를 관리합니다.

| Name | Purpose | Prompt asset |
| --- | --- | --- |
| `workbench.review_artifact_change` | Review a proposed artifact mutation with relevant rules. | `workbench.review_artifact_change.md` |
| `workbench.apply_artifact_change` | Guide inspect, validate, preview, apply, and post-validate workflow. | `workbench.apply_artifact_change.md` |
| `workbench.plan_structure_migration` | Plan a canonical artifact structure migration. | `workbench.plan_structure_migration.md` |
| `workbench.explain_diagnostic` | Explain one diagnostic and likely fixes. | `workbench.explain_diagnostic.md` |
| `workbench.audit_workspace_structure` | Audit artifact roots, marker files, and ordering policy. | `workbench.audit_workspace_structure.md` |
| `workbench.prepare_tests_for_change` | Select focused tests for an artifact change. | `workbench.prepare_tests_for_change.md` |
| `workbench.explore_wiki` | Use wiki and rule resources for task context. | `workbench.explore_wiki.md` |
| `workbench.refresh_wiki_from_analyze` | Plan generated wiki refresh from analyze outputs. | `workbench.refresh_wiki_from_analyze.md` |
| `workbench.trace_variable_flow` | Trace variable readers, writers, and diagnostics. | `workbench.trace_variable_flow.md` |
| `workbench.explain_button_action` | Explain button action declaration and usage. | `workbench.explain_button_action.md` |
| `workbench.trace_lua_handler` | Trace Lua handler and call graph context. | `workbench.trace_lua_handler.md` |
| `workbench.review_relationship_network` | Review relationship graph communities and edges. | `workbench.review_relationship_network.md` |
| `workbench.review_prompt_chain` | Review prompt dependency chain and conflicts. | `workbench.review_prompt_chain.md` |
| `workbench.explain_analyze_diagnostic` | Explain analyze output diagnostic and evidence. | `workbench.explain_analyze_diagnostic.md` |
| `workbench.create_project` | Guide scaffold workflow for creating new RisuAI charx/module/preset projects. | `workbench.create_project.md` |
| `workbench.creative.brainstorm_from_context` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.brainstorm_from_context.md` |
| `workbench.creative.scamper_lorebook_entries` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.scamper_lorebook_entries.md` |
| `workbench.creative.scamper_prompt_chain_variants` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.scamper_prompt_chain_variants.md` |
| `workbench.creative.six_hats_idea_review` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.six_hats_idea_review.md` |
| `workbench.creative.morphological_explore` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.morphological_explore.md` |
| `workbench.creative.triz_resolve_contradiction` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.triz_resolve_contradiction.md` |
| `workbench.creative.reverse_brainstorm_failure_modes` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.reverse_brainstorm_failure_modes.md` |
| `workbench.creative.combine_concepts` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.combine_concepts.md` |
| `workbench.creative.find_distant_analogies` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.find_distant_analogies.md` |
| `workbench.creative.turn_idea_into_patch` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.turn_idea_into_patch.md` |
| `workbench.creative.apply_selected_idea` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.apply_selected_idea.md` |
| `workbench.creative.red_team_concept` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.red_team_concept.md` |
| `workbench.creative.synthesize_idea_session` | Creative workflow prompt; see docs/mcp/risuai-workbench-mcp-for-creative-thinking.mutation-enabled.md §Prompt 목록. | `workbench.creative.synthesize_idea_session.md` |

## Maintenance note

Prompt를 추가하거나 제거할 때는 registry entry, manifest mapping, Markdown asset file, 이 색인을 함께 갱신하세요. Registry는 metadata, manifest는 파일 매핑, Markdown asset은 prompt body를 각각 소유합니다.

## Authoring skill assets

Authoring skills are packaged read-only Markdown assets under `skills/en/` and indexed by `skills/skills-catalog.json`.

Ownership boundaries:

- `skills/en/*.md` owns the human-readable authoring guidance body.
- `skills/skills-catalog.json` owns machine-readable recommendation metadata: `id`, `title`, `kind`, `summary`, `useWhen`, `doNotUseWhen`, `primaryArtifacts`, `families`, `signals`, `resourceUri`, and `source`.
- `src/skills/catalog.ts` owns runtime validation and safe loading.
- `workbench.select_authoring_skill` owns the LLM-assisted matching workflow.
- `workbench.recommend_skills` validates the LLM-selected skill and returns approval-required user guidance.
- `workbench.apply_skill` requires explicit confirmation and returns a plan preview bundle without writing files.

Safety rules:

- Do not add skill Markdown files to the `prompts[]` manifest.
- Do not auto-apply skills from `route_intent`.
- Do not write plan files from `workbench.apply_skill`; saving plans must use the existing preview/confirmation mutation workflow.
