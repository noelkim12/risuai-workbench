# 개발과 CLI

이 문서는 maintainer가 `risuai-workbench-mcp`를 빌드, 테스트, 실행할 때 사용하는 명령과 CLI 경계를 정리합니다.

## 개발 명령

```bash
npm run build --workspace risuai-workbench-mcp
npm test --workspace risuai-workbench-mcp
npm run watch --workspace risuai-workbench-mcp
```

## CLI

```bash
risuai-workbench-mcp --stdio
risuai-workbench-mcp --help
risuai-workbench-mcp --version
```

| 옵션 | 설명 |
|---|---|
| `--stdio` | MCP stdio server를 시작합니다. stdout은 JSON-RPC 전용입니다. |
| `--help` | stdio 시작 없이 사용법을 출력합니다. |
| `--version` | package version을 출력합니다. |

stdio mode에서 stdout은 JSON-RPC 전용입니다. 일반 로그는 stderr로 출력해야 합니다.

## Facade visualization

facade 구조의 Mermaid diagram과 graph JSON을 갱신하려면 build 후 visualization script를 실행합니다.

```bash
npm run build --workspace risuai-workbench-mcp
npm run facade:visualize --workspace risuai-workbench-mcp
```

상세 protocol과 architecture 설명은 [`../README-reference.md`](../README-reference.md)를 확인합니다.
