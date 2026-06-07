# Facade tool surface

기본 실행에서 외부 MCP `tools/list`에 노출되는 tool은 facade 중심으로 제한됩니다. domain별 세부 기능은 내부 Action Registry action으로 실행합니다.

## 기본 공개 tool

| MCP tool | 사용 목적 |
|---|---|
| `workbench.smoke` | server와 workspace 상태 확인 |
| `workbench.route_intent` | 요청에 맞는 capability와 다음 tool 추천 |
| `workbench.catalog` | 실행 가능한 내부 action 후보 검색 |
| `workbench.prepare_action` | 선택한 action의 입력값과 예시 확인 |
| `workbench.run_action` | 읽기/분석/추출 등 내부 action 실행 |
| `workbench.context` | 큰 payload를 handle로 저장하고 재사용 |
| `workbench.patch_preview` | 파일 변경 plan과 diff 생성 |
| `workbench.patch_apply` | 저장된 patch plan 적용 |

## 이름 구분

- `workbench.*`는 MCP client가 직접 호출하는 공개 tool 이름입니다.
- `inspect.*`, `validate.*`, `analyze.*`, `wiki.*`, `skills.*`, `creative.*`, `patch.*`, `core.*`는 Action Registry 내부 ID입니다.
- `catalog`와 `prepare_action`은 내부 action 후보와 입력 schema를 찾기 위한 facade입니다.

예를 들어 archive 추출은 공개 tool `workbench.run_action`을 호출하면서 내부 `actionId`로 `core.run_extract`를 전달합니다.

## Legacy direct tools

legacy direct MCP tools는 기본 mode에서 숨겨져 있습니다. 기본 surface가 적게 보이는 것은 정상입니다. migration test나 backward compatibility 확인이 필요한 경우에는 상세 reference의 legacy 노출 설정을 확인합니다.
