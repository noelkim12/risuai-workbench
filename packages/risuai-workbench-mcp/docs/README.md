# MCP package 문서 인덱스

이 폴더는 `risuai-workbench-mcp`의 운영 문서를 주제별로 나눈 문서 묶음입니다. 루트 [`../README.md`](../README.md)는 진입점이고, 이 폴더는 설치·workflow·tool surface·mutation safety·troubleshooting·개발 명령을 필요한 만큼만 읽기 위한 세부 인덱스입니다.

## 페이지 구성

| 페이지 | 역할 |
|---|---|
| [`INSTALLATION.md`](INSTALLATION.md) | npm / npx / global / source 설치와 실행 확인 |
| [`HARNESS_SETUP.md`](HARNESS_SETUP.md) | Codex / OpenCode / Claude Code / Pi / Hermes MCP 설정 |
| [`setup.md`](setup.md) | 기존 통합 설치·client 설정 요약 |
| [`workflows.md`](workflows.md) | 읽기/분석 workflow, 파일 변경 workflow, archive 추출 |
| [`facade-tools.md`](facade-tools.md) | 기본 공개 facade tool 8개의 역할과 내부 actionId 구분 |
| [`risulua-runtime.md`](risulua-runtime.md) | Fengari runtime action, source/context, trace와 제한 |
| [`mutation-safety.md`](mutation-safety.md) | patch preview/apply, path safety, stale state 처리 |
| [`troubleshooting.md`](troubleshooting.md) | startup, tool surface, mutation 거부 문제 해결 |
| [`development.md`](development.md) | CLI 옵션, 개발 명령, facade visualization |

## 읽는 순서

1. 처음 설치한다면 [`INSTALLATION.md`](INSTALLATION.md)를 읽습니다.
2. client에 연결하려면 [`HARNESS_SETUP.md`](HARNESS_SETUP.md)에서 사용하는 harness를 고릅니다.
3. agent prompt나 사용 가이드를 작성하려면 [`workflows.md`](workflows.md)를 읽습니다.
4. tool 이름을 정확히 써야 하면 [`facade-tools.md`](facade-tools.md)를 읽습니다.
5. RisuLua 실행이나 split runtime 회귀를 다루면 [`risulua-runtime.md`](risulua-runtime.md)를 읽습니다.
6. 파일 변경을 다루면 [`mutation-safety.md`](mutation-safety.md)를 반드시 함께 읽습니다.
7. 문제가 발생하면 [`troubleshooting.md`](troubleshooting.md)에서 증상별 점검 순서를 확인합니다.
8. maintainer 작업이면 [`development.md`](development.md)와 [`../README-reference.md`](../README-reference.md)를 같이 봅니다.

## 문서 작성 규칙

- leaf 문서는 한 주제만 설명합니다.
- 같은 명령이나 표를 여러 페이지에 길게 복사하지 않습니다. 필요한 경우 원래 페이지로 링크합니다.
- MCP tool 이름(`workbench.*`)과 내부 Action Registry ID(`inspect.*`, `core.*`, `patch.*`)를 섞어 쓰지 않습니다.
- 구현 보장을 설명할 때는 package source나 테스트를 확인한 뒤 표현합니다.
