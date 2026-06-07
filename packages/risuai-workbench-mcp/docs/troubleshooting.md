# Troubleshooting

이 문서는 `risuai-workbench-mcp`를 실행하거나 MCP client에 연결할 때 자주 발생하는 문제를 증상별로 정리합니다.

## Server가 시작하지 않아요

확인할 항목:

- Node.js 20 이상인지 확인합니다.
- 저장소 source에서 실행한다면 `npm run build --workspace risuai-workbench-mcp`를 먼저 실행합니다.
- MCP client config의 `command`와 `args`가 실제 파일 경로를 가리키는지 확인합니다.
- stdio mode에서 stdout에 일반 로그가 섞이지 않는지 확인합니다. stdout은 JSON-RPC 전용입니다.

## Tools가 적게 보여요

정상 동작일 가능성이 높습니다.

- 기본 tool surface는 facade 8개만 노출합니다.
- 세부 기능은 `workbench.catalog`와 `workbench.prepare_action`으로 action을 찾아 실행합니다.
- legacy direct MCP tools는 기본 mode에서 숨겨져 있습니다.

공개 facade tool 목록은 [`facade-tools.md`](facade-tools.md)를 확인합니다.

## Mutation이 거부돼요

확인할 항목:

- target path가 workspace boundary 안에 있는지 확인합니다.
- preview 이후 파일이 바뀌어 stale hash가 되었는지 확인합니다.
- 요청한 operation이 현재 patch engine에서 지원되는지 확인합니다.
- apply가 거부되거나 stale 상태가 의심되면 최신 파일 기준으로 preview를 다시 생성합니다.

파일 변경 안전 규칙은 [`mutation-safety.md`](mutation-safety.md)를 확인합니다.
