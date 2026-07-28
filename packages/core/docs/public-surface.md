# Public surface

이 문서는 `packages/core`가 현재 노출하는 공개 경계를 package-local source 기준으로 요약합니다.

## 현재 surface

| surface | 근거 | 현재 역할 |
|---|---|---|
| root import `@risuai-workbench/core` | [`../package.json`](../package.json), [`../src/index.ts`](../src/index.ts) | Node.js I/O 없는 domain 중심 export |
| browser CBS import `@risuai-workbench/core/cbs-browser` | [`../package.json`](../package.json), [`../src/cbs-browser.ts`](../src/cbs-browser.ts) | browser/webview에서 쓰는 CBS registry, lorebook decorator, protocol guard export |
| Node import `@risuai-workbench/core/node` | [`../package.json`](../package.json), [`../src/node/index.ts`](../src/node/index.ts) | filesystem, PNG/card I/O, JSON listing, rpack, custom-extension discovery 등 Node runtime helper export |
| CLI `risu-core` | [`../package.json`](../package.json), [`../bin/risu-core.js`](../bin/risu-core.js), [`../src/cli/main.ts`](../src/cli/main.ts) | executable command dispatcher |

## Root import

[`../src/index.ts`](../src/index.ts)는 현재 `./domain`, `shared/protocol-envelope`, `shared/string-patterns`를 export합니다. 이 경로는 browser-safe surface로 다룹니다. Node.js filesystem helper는 root import 계약에 포함하지 않습니다.

## Browser CBS import

[`../src/cbs-browser.ts`](../src/cbs-browser.ts)는 browser-safe CBS 관련 helper만 별도 export합니다. 현재 코드 기준으로 CBS builtin registry, lorebook decorator helper, protocol envelope guard를 포함합니다.

## Node import

[`../src/node/index.ts`](../src/node/index.ts)는 Node.js runtime에 의존하는 helper를 export합니다. 현재 코드 기준으로 fs helper, PNG helper, CharX/card parser, lorebook I/O, JSON listing, rpack, custom-extension workspace discovery, `.risumodule` manifest helper, RisuLua module graph helper가 이 경계에 있습니다.

## CLI executable

[`../bin/risu-core.js`](../bin/risu-core.js)는 빌드된 CLI main을 로드하는 shim입니다. [`../src/cli/main.ts`](../src/cli/main.ts)는 `extract`, `pack`, `analyze`, `build`, `scaffold`를 최상위 명령어로 등록합니다.

CLI는 root import나 Node subpath의 대체 표현이 아닙니다.

## 검증 anchor

- [`../tests/root-entry-contract.test.ts`](../tests/root-entry-contract.test.ts)
- [`../tests/node-entry.test.ts`](../tests/node-entry.test.ts)
- [`../tests/domain-node-structure.test.ts`](../tests/domain-node-structure.test.ts)
- [`../tests/cli-main-dispatch.test.ts`](../tests/cli-main-dispatch.test.ts)
- [`../tests/cli-smoke.test.ts`](../tests/cli-smoke.test.ts)

## 이 문서가 보장하지 않는 것

- 개별 domain helper의 전체 의미론
- 각 CLI command의 모든 옵션과 단계
- 저장소 루트 `docs/core/` 문서의 현행화 상태

상세 기능 지도는 [`features.md`](features.md), CLI 지도는 [`cli.md`](cli.md)를 봅니다.
