# custom extension 공통 원칙

이 문서는 현재 `risuai-workbench`가 채택한 canonical custom-extension 구조의 공통 규칙을 정리한다. 구현·테스트·LSP 문서는 이 파일과 각 artifact/target 문서를 함께 읽되, active workspace behavior는 canonical authoring surface를 먼저 기준으로 잡는다.

## source of truth

- source of truth는 root JSON이 아니라 canonical `.risu*` 파일 집합, marker file, `metadata.json` 같은 emitted workspace surface다.
- archive 성격의 `../custom-extension-design.md`는 과거 설계 스냅샷이며, 활성 규칙은 이 문서와 `../extensions/*.md`, `../targets/*.md`에 둔다.
- 구현 truth는 문서보다 코드가 앞선다. 문서는 현재 shipped behavior를 설명해야 하며, 미래 ideal state는 별도 note로만 남긴다.

## terminology guardrail

- **canonical emitted or authoring workspace surface**는 사용자가 현재 workspace에서 직접 보고 수정하는 `.risu*`, marker, `metadata.json` 계층을 뜻한다.
- **legacy or deferred fallback surface**는 analyze, archive, 옛 링크 호환, 미이관 설명처럼 아직 남아 있는 비주도 입력 경로를 뜻한다. 수용은 가능해도 현재 workspace 표준은 아니다.
- **binary or internal compatibility behavior**는 `.charx`, `.risum`, 내부 serializer entry name처럼 pack 이후 또는 런타임 내부에서만 보이는 비-workspace 동작을 뜻한다.
- 문서가 root JSON, structured JSON, fallback을 언급할 때는 세 범주 중 어디에 속하는지 같이 적는다.

## target × artifact ownership

| artifact | suffix | charx | module | preset | 비고 |
|---|---|:---:|:---:|:---:|---|
| lorebook | `.risulorebook` | ✓ | ✓ |   | 다중 파일 + `_order.json` |
| regex | `.risuregex` | ✓ | ✓ | ✓ | 다중 파일 + `_order.json` |
| lua | `.risulua` | ✓ | ✓ |   | target당 단일 파일 |
| prompt-template | `.risuprompt` |   |   | ✓ | 다중 파일 + `_order.json` |
| toggle | `.risutoggle` |   | ✓ | ✓ | target당 단일 파일 |
| variable | `.risuvar` | ✓ | ✓ |   | target당 단일 파일 |
| html | `.risuhtml` | ✓ | ✓ |   | `background.risuhtml` 고정 |

## naming / ordering / singleton 규칙

- lorebook/regex/prompt-template처럼 다중 파일이 가능한 artifact는 `_order.json`을 ordering source of truth로 사용한다.
- lorebook는 현재 path-based identity가 기본이다. 활성 canonical layout은 `lorebooks/<folder...>/<entry>.risulorebook` + `_order.json`이며, 과거 `_folders.json` 문서는 archive 참고용으로만 본다.
- lua / toggle / variable / html는 singleton surface다. target당 1개만 허용되며, duplicate source는 자동 병합하지 않고 오류로 본다.
- html는 항상 `html/background.risuhtml`을 사용한다.
- preset toggle는 `toggle/prompt_template.risutoggle`를 기본 singleton surface로 본다.

<a id="authoring-scope-원칙"></a>
## authoring scope 원칙

- workbench는 upstream 전체 필드를 무조건 canonical workspace surface로 풀어내지 않는다.
- canonical surface는 **실제로 편집·검증·round-trip 계약을 유지할 가치가 있는 필드**만 소유한다.
- authoring scope 밖 필드는 extract 시 canonical workspace로 내리지 않을 수 있으며, pack 시 upstream default/template overlay 또는 보존된 metadata를 통해 재구성한다.
- 이 원칙 때문에 "canonical에 없는 필드"가 곧 데이터 손실을 의미하지는 않는다. 의도적으로 미편집 영역으로 분류된 경우, 그 차이는 allowed loss로 문서화한다.

### 대표 예시

- charx / module / preset의 구조화 메타데이터는 canonical workspace의 `metadata.json`이 소유하고, artifact payload는 `.risu*` 파일이 소유한다.
- lorebook의 실제 폴더 정체성은 frontmatter `folder` 문자열보다 현재는 경로와 `_order.json`이 우선한다.
- `.risulua`는 현재 function-splitting이 아니라 upstream `triggerscript` blob을 그대로 보존한다.

<a id="diff-분류"></a>
## diff 분류

round-trip diff는 아래 셋으로 나눈다.

| 분류 | 의미 | 예시 |
|---|---|---|
| `intentional_unedited` | authoring scope 밖이라 canonical이 직접 소유하지 않는 차이 | default overlay, 미편집 필드 복원 |
| `upstream_limit` | upstream runtime / 저장 포맷의 한계 때문에 생기는 차이 | runtime-only injection, case sensitivity collapse |
| `design_bug` | 현재 canonical 계약이나 구현이 잘못돼 생긴 차이 | 문서/코드 불일치, 잘못된 pack 로직 |

원칙은 간단하다.

- `intentional_unedited`와 `upstream_limit`는 allowlist 근거가 있어야 한다.
- 근거를 설명하지 못하는 차이는 `design_bug`로 본다.
- 문서는 allowlisted diff가 왜 허용되는지, 어디까지가 현재 계약인지 먼저 설명해야 한다.

## CBS-bearing source type 매핑

현재 CBS LSP와 fragment mapping의 기준은 아래 표다.

| artifact | CBS-bearing 영역 | 비고 |
|---|---|---|
| `.risulorebook` | `@@@ CONTENT` | frontmatter / KEYS / SECONDARY_KEYS는 비-CBS |
| `.risuregex` | `@@@ IN`, `@@@ OUT` | 두 section 모두 CBS-bearing |
| `.risuprompt` | `@@@ TEXT`, `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT` | section 존재 여부는 prompt type에 따라 달라짐 |
| `.risuhtml` | 파일 전체 | full-file CBS-bearing |
| `.risulua` | 파일 전체 | 현재 first-cut 구현은 full-file fragment. future literal-only AST mapping은 아직 아님 |
| `.risutoggle` | 없음 | non-CBS DSL |
| `.risuvar` | 없음 | plain key=value |

### 현재 구현 상태 메모

- `.risutoggle`, `.risuvar`는 LSP document routing 대상이 아니다.
- `.risulua`는 현재 `full` section 1개만 반환하는 first-cut 매핑이 truth다.
- 문서가 더 이상 미래 설계를 현재처럼 광고하면 안 된다. future note는 분리해서 쓴다.

## 검증 워크플로우

문서를 고칠 때도 아래 순서를 지킨다.

1. 관련 artifact/target 문서를 읽는다.
2. 구현 파일과 테스트를 대조한다.
3. 현재 shipped behavior와 미래 ideal state를 분리한다.
4. root JSON, structured JSON, legacy fallback, Lua AST 같은 deferred 범위는 canonical workspace와 분리해서 명시적으로 표시한다.
5. round-trip과 LSP 설명이 서로 모순되지 않는지 확인한다.

## 같이 읽을 문서

- `root-json-removal.md`
- `../extensions/*.md`
- `../targets/*.md`
- `../../packages/cbs-lsp/README.md`
- `../../packages/core/src/domain/custom-extension/cbs-fragments.ts`
