# 기본 사용 workflow

이 문서는 `risuai-workbench-mcp`를 agent workflow에서 어떤 순서로 호출할지 설명합니다. 공개 tool 목록은 [`facade-tools.md`](facade-tools.md), 파일 변경 안전 경계는 [`mutation-safety.md`](mutation-safety.md)를 함께 읽습니다.

## Facade 우선 원칙

기본 `tools/list`에는 facade tool 8개만 보입니다. 세부 기능은 내부 Action Registry에 있으며, 사용자는 다음 순서로 필요한 action을 찾습니다.

```text
workbench.route_intent -> workbench.catalog -> workbench.prepare_action
```

`catalog`와 `prepare_action`이 반환하는 `actionId`는 MCP tool 이름이 아니라 내부 action ID입니다. 예: `inspect.path`, `analyze.query_lua_analysis`, `patch.suggest_order`, `core.run_extract`.

## 읽기/분석 작업

읽기, 검증, 분석, wiki/resource 조회처럼 파일을 직접 변경하지 않는 작업은 다음 흐름을 사용합니다.

```text
workbench.route_intent
  -> workbench.catalog
  -> workbench.prepare_action
  -> workbench.run_action
```

대표 작업:

- workspace path 또는 artifact 구조 검사
- root marker, `_order.json`, frontmatter 검증
- RisuLua/CBS/prompt/lorebook 관련 분석 조회
- wiki/resource 기반 설명 생성

## 파일 변경 작업

파일 변경은 바로 `run_action`으로 쓰기보다 preview와 저장된 plan을 거칩니다.

```text
workbench.route_intent
  -> workbench.catalog
  -> workbench.prepare_action
  -> workbench.patch_preview
  -> workbench.patch_apply
```

`patch_preview`는 diff와 diagnostic이 포함된 patch plan을 만들고 저장합니다. `patch_apply`는 저장된 plan만 적용합니다. 자세한 안전 규칙은 [`mutation-safety.md`](mutation-safety.md)를 봅니다.

## Archive 추출

`.risum`, `.charx`, `.risup` 추출/임포트 요청은 내부 action `core.run_extract`로 실행합니다. archive를 text로 읽거나 수동 unzip하지 않습니다. `.risuchar`는 외부 archive input이 아니라 canonical workspace root marker입니다.

```text
workbench.run_action({
  actionId: "core.run_extract",
  args: {
    sourcePath: "test_suites/example.risum",
    outDir: "test_suites/extraction_targets",
    type: "module"
  }
})
```

`workbench.run_extract`는 legacy direct MCP tool 이름이며 기본 mode에서는 보이지 않습니다.
