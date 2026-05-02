# lua-analyzer-wasm

Rust WASM 실험 패키지입니다. 거대 `.risulua` 파일을 TypeScript CBS parser에 그대로 넘기지 않기 위한 Lua 분석 커널을 이 패키지에서 독립적으로 검증합니다.

## Commands

```bash
npm run wasm:check
```

패키지 단위로는 아래 명령을 씁니다.

```bash
npm --workspace @risuai/lua-analyzer-wasm run test:rust
npm --workspace @risuai/lua-analyzer-wasm run build:wasm
npm --workspace @risuai/lua-analyzer-wasm run test:smoke
```

`pkg/`는 `wasm-pack build --target nodejs`가 생성하는 산출물이며 git에는 커밋하지 않습니다.

## Scanner scope

The Rust/WASM analyzer is a lexical indexing kernel, not a full Lua parser.

It extracts:

- Lua short string literals (`"..."`, `'...'`) with escaped quote handling
- Lua long bracket string literals (`[[...]]`, `[=[...]=]`)
- Whether a string literal content range contains CBS markers (`{{` or `}}`)
- Static first-argument keys for `getState`, `setState`, `getChatVar`, and `setChatVar`

It intentionally ignores:

- Dynamic state keys such as `getState(prefix .. "key")`
- Full Lua AST, call graph, and module ownership analysis
- CBS parsing itself; TypeScript CBS providers still own CBS parsing
