# Tool-Prompt 매핑 가이드

`packages/risuai-workbench-mcp`는 **Tool**(`tools/list`, `tools/call`)과 **Prompt**(`prompts/list`, `prompts/get`) 두 개의 독립적인 MCP surface를 노출합니다. 이 문서는 새 tool을 추가할 때 관련 prompt 정보도 함께 매핑하고 유지보수해야 하는 이유와 방법을 설명합니다.

## 1. Tool과 Prompt는 왜 함께 다뤄야 하는가

| Surface | 역할 | 사용자 호출 방식 |
| --- | --- | --- |
| **Tool** | 상태를 읽거나(workspace) 변형하고(mutation) 구조화된 결과를 반환 | `tools/call` — 코드가 직접 실행 |
| **Prompt** | 에이전트 워크플로우 템플릿을 제공. tool 호출 시퀀스, 검증 단계, 안전 가이드라인을 담음 | `prompts/get` — LLM이 템플릿을 받아 reasoning 후 tool을 호출 |

**핵심 원칙**: 하나의 "기능"은 종종 **1개 tool + 0~N개 prompt**로 구성됩니다.

- 예: `workbench.apply_patch_plan` tool은 단독으로 동작하지만, `workbench.apply_artifact_change` prompt는 "inspect → validate → preview → apply → post-validate"라는 **안전한 시퀀스**를 템플릿으로 제공합니다.
- 예: `workbench.creative.brainstorm_scamper` tool은 아이디어 후보를 생성하지만, `workbench.creative.brainstorm_from_context` prompt는 "context 수집 → SCAMPER 적용 → 결과 정리"라는 **창작 워크플로우**를 제공합니다.

따라서 **새 tool을 추가할 때** 다음을 반드시 검토해야 합니다:

1. 이 tool이 단독 호출만으로 안전한가, 아니면 prompt 가이드가 필요한가?
2. 기존 prompt가 이 tool을 참조하거나 호출하는가? → prompt body를 업데이트해야 하는가?
3. 새로운 workflow가 필요한가? → 새 prompt asset을 추가해야 하는가?

## 2. Prompt 추가/갱신 시 4파일 동시 수정 원칙

Prompt를 추가하거나 제거할 때는 다음 4개 파일을 **항상 함께** 갱신해야 합니다. 하나라도 누락되면 MCP 클라이언트가 prompt를 찾지 못하거나, 색인과 실제 내용이 불일치하게 됩니다.

| 파일 | 소유 정보 | 수정 내용 |
| --- | --- | --- |
| `src/registry/index.ts` | Prompt metadata (`name`, `title`, `description`) | `PROMPTS` 배열에 `[name, title, description]` 튜플 추가 |
| `prompt-assets/manifest.json` | Prompt name → Markdown 파일 매핑 | `prompts` 배열에 `{ "name": "...", "file": "..." }` 추가 |
| `prompt-assets/{name}.md` | Prompt body (실제 워크플로우 텍스트) | 새 Markdown 파일 작성. 짧은 workflow와 필요한 검증 단계만 포함 |
| `prompt-assets/README.md` | 인간-readable 색인 | 표에 Name / Purpose / Prompt asset 행 추가 |

### Prompt asset body 작성 규칙

- **Tool 호출 시퀀스를 명시**: "먼저 `workbench.inspect_artifact`로 검증한 후 `workbench.suggest_patch`를 호출하세요"처럼 구체적인 tool name을 언급
- **Mutation field 반복 금지**: prompt body에서 `confirmation`, `expectedHash`, `mode: 'commit'` 같은 low-level gate field를 반복하지 않음
- **Output schema 참조**: 결과가 `DiagnosticEnvelope`인지 `MutationResultEnvelope`인지 명시
- **자체 완결적 설명**: 저장소 외부 문서 경로 대신 필요한 계약과 검증 단계를 prompt body에 직접 작성

## 3. Tool 추가 시 Prompt 매핑 체크리스트

새 tool을 추가할 때 다음 질문에 답하고, 해당하는 항목을 실행하세요.

### 3.1 이 tool이 prompt가 필요한가?

| 시나리오 | 필요한 작업 |
| --- | --- |
| 단순 조회/검증 tool (예: `validate_path`, `query_variable`) | Prompt 불필요. Tool 단독 사용. |
| 복합 워크크로우의 일부 (예: `apply_patch_plan`, `edit_frontmatter`) | **Prompt 필요**. "검증 → preview → apply" 시퀀스를 가이드하는 prompt asset 추가 검토. |
| Creative tool (예: `brainstorm_scamper`, `turn_idea_into_plan`) | **Prompt 필요**. 창작 방법론(SCAMPER, Six Hats 등)과 연결되는 workflow prompt가 별도로 존재할 수 있음. |

### 3.2 기존 prompt가 이 tool을 참조하는가?

```bash
# prompt-assets/*.md에서 새 tool name을 검색
grep -r "workbench.new_tool_name" prompt-assets/
```

- 결과가 있으면: 해당 prompt body를 읽어 새 tool의 input schema, mutates 여부, 안전 가이드라인이 맞는지 확인 후 업데이트
- 결과가 없으면: 새 prompt가 필요한지 3.1에서 판단

### 3.3 새 prompt가 필요한가?

필요하다면 4파일 동시 수정:

1. `src/registry/index.ts` — `PROMPTS` 배열에 추가
2. `prompt-assets/manifest.json` — 매핑 추가
3. `prompt-assets/{name}.md` — body 작성
4. `prompt-assets/README.md` — 색인 행 추가

## 4. Tool-Prompt 매핑 검증 방법

### 4.1 Registry ↔ Server 등록 일치 검사

```bash
# registry에 정의된 tool name 추출
grep "name: 'workbench\." src/registry/index.ts | sed "s/.*name: '//;s/',//" | sort > /tmp/registry_tools.txt

# server.ts에 registerTool된 이름 추출
grep -oP "registerTool\(\s*'\Kworkbench\.[^']+" src/server.ts | sort > /tmp/server_tools.txt

# creative/index.ts에 등록된 이름 추출
grep -oP "name: '\Kworkbench\.creative\.[^']+" src/tools/creative/index.ts | sort > /tmp/creative_tools.txt

# 비교
cat /tmp/server_tools.txt /tmp/creative_tools.txt | sort | diff - /tmp/registry_tools.txt
```

### 4.2 Prompt 4파일 일치 검사

```bash
# registry의 prompt name
grep -oP "'workbench\.[^']+'" src/registry/index.ts | grep -v "resource" | grep -v "smoke" | sort -u > /tmp/registry_prompts.txt

# manifest의 prompt name
jq -r '.prompts[].name' prompt-assets/manifest.json | sort > /tmp/manifest_prompts.txt

# README index의 prompt name
grep "^| \`workbench\." prompt-assets/README.md | awk -F'`' '{print $2}' | sort > /tmp/readme_prompts.txt

# 실제 .md 파일 수
ls prompt-assets/workbench.*.md | wc -l

# 비교
diff /tmp/registry_prompts.txt /tmp/manifest_prompts.txt
diff /tmp/manifest_prompts.txt /tmp/readme_prompts.txt
```

### 4.3 Prompt body에서 tool 참조 검사

```bash
# 각 prompt asset이 어떤 tool을 참조하는지 확인
grep -h "workbench\.[a-z_]*" prompt-assets/workbench.*.md | grep -oP "workbench\.[a-z_]+" | sort | uniq -c | sort -rn
```

## 5. 예시: `workbench.apply_artifact_change` prompt와 관련 tool

| Prompt | 참조 Tool | 관계 |
| --- | --- | --- |
| `workbench.apply_artifact_change` | `workbench.inspect_artifact` | 1단계: 대상 검증 |
| | `workbench.validate_artifact` | 2단계: 구조 검증 |
| | `workbench.suggest_patch` | 3단계: patch preview 생성 |
| | `workbench.apply_patch_plan` | 4단계: 승인 후 적용 |
| | `workbench.validate_artifact` | 5단계: post-validate |

이 prompt body에는 facade workflow와 필요한 action만 짧게 언급하고, schema 세부사항은 tool output과 implementation docs에 둡니다.

## 6. 종합 체크리스트 요약

### Tool 추가 시

- [ ] 도메인 폴더에 handler 파일 추가 (`{verb}-{noun}.ts`)
- [ ] `handle{Verb}{Noun}` 형식으로 작성
- [ ] 도메인 `index.ts`와 루트 barrel export 확인
- [ ] `src/server.ts`의 적절한 `register*Tools()`에 `server.registerTool()` 추가
- [ ] `src/registry/index.ts`에 tool metadata 추가 (`ROADMAP_TOOLS` 또는 `CREATIVE_ROADMAP_TOOLS`)
- [ ] Mutation tool이면 safety gate 정책 확인
- [ ] **Prompt 매핑 검토**: 이 tool이 단독 사용인가, workflow의 일부인가?
- [ ] **기존 prompt 업데이트**: 이 tool을 참조하는 기존 prompt body가 있는가?
- [ ] **새 prompt 추가**: workflow 가이드가 필요하면 4파일 동시 갱신

### Prompt 추가 시

- [ ] `src/registry/index.ts` — `PROMPTS` 배열에 `[name, title, description]` 추가
- [ ] `prompt-assets/manifest.json` — `{ name, file }` 매핑 추가
- [ ] `prompt-assets/{name}.md` — prompt body 작성 (짧은 workflow와 참조 문서 포함)
- [ ] `prompt-assets/README.md` — 색인 표에 행 추가
- [ ] prompt body에서 참조하는 tool name이 실제 registry/server에 존재하는지 확인

---

**Source of truth 경계**

- Tool metadata: `src/registry/index.ts`
- Tool 등록/스키마: `src/server.ts`
- Prompt metadata: `src/registry/index.ts` (`PROMPTS`)
- Prompt 매핑: `prompt-assets/manifest.json`
- Prompt body: `prompt-assets/*.md`
- Prompt 색인: `prompt-assets/README.md`
