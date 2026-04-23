# cbs domain

이 문서는 `packages/core/src/domain/cbs/`가 맡는 순수 CBS parsing, AST, builtin metadata 범위만 다룬다.

## 이 페이지가 맡는 범위

- root browser entry를 통해 노출되는 CBS 순수 도메인 surface
- CBS text를 token, AST, diagnostic으로 읽는 parser 계층
- builtin registry와 hover용 문서화 helper
- CBS 변수 read/write occurrence 추출

## current truth

- `packages/core/src/domain/cbs/index.ts`는 `cbs.ts`, parser 하위 모듈, builtin registry, documentation helper를 한 번에 다시 export한다.
- `cbs.ts`의 현재 public 핵심은 `extractCBSVariableOccurrences`, `extractCBSVarOps`, `CBSVariableOccurrence`, `CBSVarOps`다.
- parser surface의 중심은 `CBSParser`와 AST/token/visitor 타입이다.
- builtin surface는 `CBSBuiltinRegistry`와 builtin metadata source of truth다. `docOnly`, alias, deprecated replacement, category, argument metadata까지 registry가 들고 있다.
- `documentation.ts`는 registry metadata에서 signature와 hover markdown을 만든다. 예시 본문은 아직 TODO 상태다.

## notable exported surface

| 축 | 현재 public 예시 |
|---|---|
| 변수 occurrence | `extractCBSVariableOccurrences`, `extractCBSVarOps` |
| parser | `CBSParser`, token/AST/parser/visitor export |
| builtin registry | `CBSBuiltinRegistry`, builtin metadata helper |
| documentation helper | `generateDocumentation`, `formatHoverContent` |

## 현재 코드가 고정하는 것

- `extractCBSVariableOccurrences`는 `getvar`, `setvar`, `addvar`, `setdefaultvar`만 추적한다.
- 정적 plain text key만 occurrence로 인정한다. 동적 key는 건너뛴다.
- parser가 실패하면 regex fallback으로 valid occurrence recovery를 시도한다.
- `CBSParser`는 nested macro, `#when`, `#each`, `#func`, pure-mode block, deprecated block spelling을 AST에서 보존한다.
- builtin registry는 case-insensitive lookup, alias lookup, printable-name normalization, `docOnly` 분류를 같이 제공한다.

## scope boundary

- 이 페이지는 CBS를 어디서 읽는지, 즉 lorebook/regex/prompt/html/lua 파일별 fragment routing은 자세히 다루지 않는다. 그 경계는 [`./custom-extension.md`](./custom-extension.md)와 각 artifact 문서로 보낸다.
- LSP provider, completion, hover payload shape는 `packages/core` 범위가 아니다.
- analyze 상관관계 그래프에서 CBS를 어떻게 소비하는지는 [`./analyze/README.md`](./analyze/README.md) 이후 문서가 맡는다.

## evidence anchors

- `../../../packages/core/src/domain/cbs/index.ts`
- `../../../packages/core/src/domain/cbs/cbs.ts`
- `../../../packages/core/src/domain/cbs/registry/builtins.ts`
- `../../../packages/core/src/domain/cbs/registry/documentation.ts`
- `../../../packages/core/tests/domain/cbs/parser.test.ts`
- `../../../packages/core/tests/domain/cbs/builtins.test.ts`
- `../../../packages/core/tests/domain/cbs/cbs-extract.test.ts`
- `../../../packages/core/tests/domain-phase1-extraction.test.ts`
- `../../../packages/core/tests/export-surface.test.ts`

## 같이 읽을 문서

- [`../targets/root-browser.md`](../targets/root-browser.md)
- [`./custom-extension.md`](./custom-extension.md)
- [`./lorebook.md`](./lorebook.md)
- [`./regex.md`](./regex.md)
