# Rust WASM Lua Indexer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace risky JS whole-file `.risulua`/Lua indexing with a Rust/WASM lexical scan pipeline that returns compact string-literal and state-API records for CBS LSP providers.

**Architecture:** Rust/WASM becomes the Lua lexical indexing kernel: it scans comments, strings, long brackets, CBS-bearing string literal ranges, and static Risu state API calls. TypeScript remains responsible for VS Code document/version orchestration, fallback selection, LSP `Position`/`Range` mapping, CBS provider routing, and registry graph integration.

**Tech Stack:** Rust, `wasm-bindgen`, `serde`, `serde_json`, Node-target WASM package `@risuai/lua-analyzer-wasm`, TypeScript, Vitest, CBS LSP tests.

---

## File Structure

### Rust/WASM package

- Modify: `packages/lua-analyzer-wasm/src/lib.rs`
  - Owns exported `analyze_lua(source, options_json) -> String`.
  - Adds lexical scanner, result structs, UTF-16 offset tracking, string literal records, and state API records.
- Modify: `packages/lua-analyzer-wasm/tests/wasm.rs`
  - Adds wasm-bindgen tests for JSON shape and scanner behavior through the public API.
- Modify: `packages/lua-analyzer-wasm/test/smoke.cjs`
  - Adds Node smoke assertions for generated `pkg` output.
- Modify: `packages/lua-analyzer-wasm/README.md`
  - Documents supported scanner scope and non-goals.

### TypeScript core integration

- Create: `packages/core/src/domain/analyze/lua-wasm-types.ts`
  - Defines TypeScript mirror types for compact WASM results.
- Create: `packages/core/src/domain/analyze/lua-wasm-adapter.ts`
  - Lazy-loads `@risuai/lua-analyzer-wasm`, calls `analyze_lua`, parses JSON, validates version, exposes a safe typed wrapper.
- Create: `packages/core/src/domain/analyze/lua-analysis-backend.ts`
  - Selects `wasm`, `luaparse`, or `disabled` backend and enforces fallback policy.
- Modify: `packages/core/src/domain/analyze/lua-core.ts`
  - Keeps existing `luaparse` implementation available as fallback; exports a backend-aware entry point without breaking callers.
- Modify: `packages/core/src/domain/custom-extension/cbs-fragments.ts`
  - Adds a WASM-result-based `.risulua` fragment mapper that maps only CBS-bearing Lua string literal contents.
- Modify: `packages/core/package.json`
  - Adds workspace dependency on `@risuai/lua-analyzer-wasm` if core owns the adapter.

### CBS LSP integration

- Modify: `packages/cbs-lsp/src/indexer/file-scanner.ts`
  - Replaces oversized JS lightweight state scan with WASM compact scan when available.
  - Keeps existing JS fallback for WASM unavailable paths.
- Modify: `packages/cbs-lsp/src/indexer/element-registry.ts`
  - Consumes compact WASM state API records through existing `LuaAnalysisArtifact` shape.
- Modify: `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
  - Uses string-literal fragment mapping for `.risulua` when compact WASM scan data is available.
- Modify: `packages/cbs-lsp/src/utils/lua-state-access-scanner.ts`
  - Keeps JS scanner as fallback only; no behavioral expansion.

### Tests and docs

- Create: `packages/lua-analyzer-wasm/tests/fixtures/complex_literals.rs` or inline Rust test cases in `src/lib.rs` test module.
- Create: `packages/core/tests/domain/analyze/lua-wasm-adapter.test.ts`
- Modify: `packages/core/tests/domain/custom-extension/cbs-fragments.test.ts`
- Modify: `packages/cbs-lsp/tests/indexer/element-registry.test.ts`
- Modify: `packages/cbs-lsp/tests/perf/large-workspace.test.ts`
- Modify: `TODO.md`
  - Mark completed Rust WASM items only after tests/build pass.

---

## Task 1: Rust lexical result model and scanner tests

**Files:**
- Modify: `packages/lua-analyzer-wasm/src/lib.rs`

- [ ] **Step 1: Add failing Rust tests for string literal scanning**

Add these tests to the existing `#[cfg(test)] mod tests` in `packages/lua-analyzer-wasm/src/lib.rs`:

```rust
#[test]
fn extracts_cbs_bearing_short_string_literals() {
    let source = r#"
local a = "hello {{user}}"
local b = 'plain text'
local c = "escaped \"{{char}}\" marker"
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.string_literals.len(), 3);

    let cbs_literals: Vec<_> = result
        .string_literals
        .iter()
        .filter(|literal| literal.has_cbs_marker)
        .collect();

    assert_eq!(cbs_literals.len(), 2);
    assert_eq!(cbs_literals[0].quote_kind, "double");
    assert_eq!(cbs_literals[1].quote_kind, "double");
}

#[test]
fn ignores_strings_and_cbs_markers_inside_comments() {
    let source = r#"
-- local fake = "{{user}}"
--[[
local also_fake = "{{char}}"
]]
local real = "{{slot::item}}"
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.string_literals.len(), 1);
    assert!(result.string_literals[0].has_cbs_marker);
}

#[test]
fn extracts_long_bracket_string_literals() {
    let source = r#"
local a = [[plain long string]]
local b = [=[long {{getvar::mood}} string]=]
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.string_literals.len(), 2);
    assert_eq!(result.string_literals[0].quote_kind, "long_bracket");
    assert!(!result.string_literals[0].has_cbs_marker);
    assert_eq!(result.string_literals[1].quote_kind, "long_bracket");
    assert!(result.string_literals[1].has_cbs_marker);
}
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
npm run wasm:test:rust
```

Expected: FAIL because `analyze_source`, `AnalyzeOptions`, and populated `string_literals` are not implemented yet.

- [ ] **Step 3: Add Rust result structs and internal analyzer entry point**

In `packages/lua-analyzer-wasm/src/lib.rs`, add or replace the internal structs with this shape while preserving the exported `analyze_lua` function name:

```rust
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeOptions {
    #[serde(default = "default_true")]
    pub include_string_literals: bool,
    #[serde(default = "default_true")]
    pub include_state_accesses: bool,
    #[serde(default = "default_max_key_length")]
    pub max_key_length: usize,
}

impl Default for AnalyzeOptions {
    fn default() -> Self {
        Self {
            include_string_literals: true,
            include_state_accesses: true,
            max_key_length: default_max_key_length(),
        }
    }
}

fn default_true() -> bool { true }
fn default_max_key_length() -> usize { 256 }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaWasmAnalyzeResult {
    pub ok: bool,
    pub parser: &'static str,
    pub version: u32,
    pub source_length_utf16: usize,
    pub source_length_bytes: usize,
    pub total_lines: usize,
    pub string_literals: Vec<LuaStringLiteral>,
    pub state_accesses: Vec<LuaStateAccess>,
    pub diagnostics: Vec<LuaWasmDiagnostic>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaStringLiteral {
    pub start_utf16: usize,
    pub end_utf16: usize,
    pub content_start_utf16: usize,
    pub content_end_utf16: usize,
    pub start_byte: usize,
    pub end_byte: usize,
    pub content_start_byte: usize,
    pub content_end_byte: usize,
    pub quote_kind: &'static str,
    pub has_cbs_marker: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaStateAccess {
    pub api_name: String,
    pub key: String,
    pub direction: &'static str,
    pub arg_start_utf16: usize,
    pub arg_end_utf16: usize,
    pub arg_start_byte: usize,
    pub arg_end_byte: usize,
    pub line: usize,
    pub containing_function: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LuaWasmDiagnostic {
    pub message: String,
    pub start_utf16: usize,
    pub end_utf16: usize,
}

pub fn analyze_source(source: &str, options: AnalyzeOptions) -> LuaWasmAnalyzeResult {
    let mut scanner = LuaScanner::new(source, options);
    scanner.scan()
}

#[wasm_bindgen]
pub fn analyze_lua(source: &str, options_json: &str) -> String {
    let options = serde_json::from_str::<AnalyzeOptions>(options_json).unwrap_or_default();
    match serde_json::to_string(&analyze_source(source, options)) {
        Ok(json) => json,
        Err(error) => serde_json::json!({
            "ok": false,
            "parser": "rust-wasm-lua",
            "version": 1,
            "sourceLengthUtf16": source.encode_utf16().count(),
            "sourceLengthBytes": source.len(),
            "totalLines": source.lines().count().max(1),
            "stringLiterals": [],
            "stateAccesses": [],
            "diagnostics": [],
            "error": error.to_string()
        }).to_string(),
    }
}
```

- [ ] **Step 4: Add a minimal scanner implementation**

Add this scanner skeleton below the structs in `packages/lua-analyzer-wasm/src/lib.rs`:

```rust
struct LuaScanner<'a> {
    source: &'a str,
    chars: Vec<(usize, char)>,
    index: usize,
    utf16_offset: usize,
    line: usize,
    options: AnalyzeOptions,
    string_literals: Vec<LuaStringLiteral>,
    state_accesses: Vec<LuaStateAccess>,
    diagnostics: Vec<LuaWasmDiagnostic>,
}

impl<'a> LuaScanner<'a> {
    fn new(source: &'a str, options: AnalyzeOptions) -> Self {
        Self {
            source,
            chars: source.char_indices().collect(),
            index: 0,
            utf16_offset: 0,
            line: 1,
            options,
            string_literals: Vec::new(),
            state_accesses: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn scan(&mut self) -> LuaWasmAnalyzeResult {
        while let Some(ch) = self.current_char() {
            if ch == '-' && self.peek_char(1) == Some('-') {
                self.scan_comment();
                continue;
            }
            if ch == '\'' || ch == '"' {
                self.scan_short_string(ch);
                continue;
            }
            if ch == '[' {
                if self.try_scan_long_bracket(false) {
                    continue;
                }
            }
            self.advance_char();
        }

        LuaWasmAnalyzeResult {
            ok: true,
            parser: "rust-wasm-lua",
            version: 1,
            source_length_utf16: self.source.encode_utf16().count(),
            source_length_bytes: self.source.len(),
            total_lines: self.line,
            string_literals: std::mem::take(&mut self.string_literals),
            state_accesses: std::mem::take(&mut self.state_accesses),
            diagnostics: std::mem::take(&mut self.diagnostics),
            error: None,
        }
    }

    fn current_char(&self) -> Option<char> {
        self.chars.get(self.index).map(|(_, ch)| *ch)
    }

    fn peek_char(&self, distance: usize) -> Option<char> {
        self.chars.get(self.index + distance).map(|(_, ch)| *ch)
    }

    fn current_byte(&self) -> usize {
        self.chars.get(self.index).map(|(byte, _)| *byte).unwrap_or(self.source.len())
    }

    fn advance_char(&mut self) -> Option<char> {
        let ch = self.current_char()?;
        self.index += 1;
        self.utf16_offset += ch.len_utf16();
        if ch == '\n' {
            self.line += 1;
        }
        Some(ch)
    }

    fn scan_comment(&mut self) {
        self.advance_char();
        self.advance_char();
        if self.current_char() == Some('[') && self.try_scan_long_bracket(true) {
            return;
        }
        while let Some(ch) = self.current_char() {
            self.advance_char();
            if ch == '\n' {
                break;
            }
        }
    }

    fn scan_short_string(&mut self, quote: char) {
        let start_byte = self.current_byte();
        let start_utf16 = self.utf16_offset;
        self.advance_char();
        let content_start_byte = self.current_byte();
        let content_start_utf16 = self.utf16_offset;
        let mut escaped = false;

        while let Some(ch) = self.current_char() {
            if escaped {
                escaped = false;
                self.advance_char();
                continue;
            }
            if ch == '\\' {
                escaped = true;
                self.advance_char();
                continue;
            }
            if ch == quote {
                let content_end_byte = self.current_byte();
                let content_end_utf16 = self.utf16_offset;
                self.advance_char();
                self.push_string_literal(
                    start_byte,
                    self.current_byte(),
                    content_start_byte,
                    content_end_byte,
                    start_utf16,
                    self.utf16_offset,
                    content_start_utf16,
                    content_end_utf16,
                    if quote == '\'' { "single" } else { "double" },
                );
                return;
            }
            self.advance_char();
        }
    }

    fn try_scan_long_bracket(&mut self, is_comment: bool) -> bool {
        let start_index = self.index;
        let start_byte = self.current_byte();
        let start_utf16 = self.utf16_offset;
        if self.current_char() != Some('[') {
            return false;
        }
        let mut cursor = self.index + 1;
        let mut equals_count = 0;
        while self.chars.get(cursor).map(|(_, ch)| *ch) == Some('=') {
            equals_count += 1;
            cursor += 1;
        }
        if self.chars.get(cursor).map(|(_, ch)| *ch) != Some('[') {
            return false;
        }

        while self.index <= cursor {
            self.advance_char();
        }
        let content_start_byte = self.current_byte();
        let content_start_utf16 = self.utf16_offset;

        while self.current_char().is_some() {
            if self.current_char() == Some(']') && self.long_bracket_close_matches(equals_count) {
                let content_end_byte = self.current_byte();
                let content_end_utf16 = self.utf16_offset;
                self.advance_char();
                for _ in 0..equals_count {
                    self.advance_char();
                }
                self.advance_char();
                if !is_comment {
                    self.push_string_literal(
                        start_byte,
                        self.current_byte(),
                        content_start_byte,
                        content_end_byte,
                        start_utf16,
                        self.utf16_offset,
                        content_start_utf16,
                        content_end_utf16,
                        "long_bracket",
                    );
                }
                return true;
            }
            self.advance_char();
        }

        self.index = start_index;
        false
    }

    fn long_bracket_close_matches(&self, equals_count: usize) -> bool {
        if self.current_char() != Some(']') {
            return false;
        }
        let mut cursor = self.index + 1;
        for _ in 0..equals_count {
            if self.chars.get(cursor).map(|(_, ch)| *ch) != Some('=') {
                return false;
            }
            cursor += 1;
        }
        self.chars.get(cursor).map(|(_, ch)| *ch) == Some(']')
    }

    fn push_string_literal(
        &mut self,
        start_byte: usize,
        end_byte: usize,
        content_start_byte: usize,
        content_end_byte: usize,
        start_utf16: usize,
        end_utf16: usize,
        content_start_utf16: usize,
        content_end_utf16: usize,
        quote_kind: &'static str,
    ) {
        if !self.options.include_string_literals {
            return;
        }
        let content = &self.source[content_start_byte..content_end_byte];
        self.string_literals.push(LuaStringLiteral {
            start_utf16,
            end_utf16,
            content_start_utf16,
            content_end_utf16,
            start_byte,
            end_byte,
            content_start_byte,
            content_end_byte,
            quote_kind,
            has_cbs_marker: content.contains("{{") || content.contains("}}"),
        });
    }
}
```

- [ ] **Step 5: Run Rust tests and verify they pass**

Run:

```bash
npm run wasm:test:rust
```

Expected: PASS for the new string literal scanner tests and existing tests.

---

## Task 2: Rust state API occurrence extraction

**Files:**
- Modify: `packages/lua-analyzer-wasm/src/lib.rs`
- Modify: `packages/lua-analyzer-wasm/tests/wasm.rs`

- [ ] **Step 1: Add failing Rust tests for state API extraction**

Add these tests to `packages/lua-analyzer-wasm/src/lib.rs`:

```rust
#[test]
fn extracts_static_state_api_keys() {
    let source = r#"
local mood = getState("mood")
setState('reply', "hello")
local chat = getChatVar("chatMood")
setChatVar('chatReply', mood)
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.state_accesses.len(), 4);
    assert_eq!(result.state_accesses[0].api_name, "getState");
    assert_eq!(result.state_accesses[0].direction, "read");
    assert_eq!(result.state_accesses[0].key, "mood");
    assert_eq!(result.state_accesses[1].api_name, "setState");
    assert_eq!(result.state_accesses[1].direction, "write");
    assert_eq!(result.state_accesses[1].key, "reply");
    assert_eq!(result.state_accesses[2].api_name, "getChatVar");
    assert_eq!(result.state_accesses[2].direction, "read");
    assert_eq!(result.state_accesses[3].api_name, "setChatVar");
    assert_eq!(result.state_accesses[3].direction, "write");
}

#[test]
fn ignores_state_api_inside_comments_and_strings() {
    let source = r#"
-- getState("commented")
local fake = "setState('stringOnly', 1)"
local real = getState("visible")
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.state_accesses.len(), 1);
    assert_eq!(result.state_accesses[0].key, "visible");
}

#[test]
fn skips_dynamic_state_api_keys() {
    let source = r#"
local key = "mood"
getState(key)
setState(prefix .. "reply", value)
getState("static")
"#;
    let result = analyze_source(source, AnalyzeOptions::default());

    assert!(result.ok);
    assert_eq!(result.state_accesses.len(), 1);
    assert_eq!(result.state_accesses[0].key, "static");
}
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run:

```bash
npm run wasm:test:rust
```

Expected: FAIL because `state_accesses` is still empty.

- [ ] **Step 3: Implement candidate matching outside comments/strings**

Modify `LuaScanner::scan()` in `packages/lua-analyzer-wasm/src/lib.rs` so ordinary code positions try state API matching before advancing:

```rust
if self.options.include_state_accesses && self.try_scan_state_access() {
    continue;
}
self.advance_char();
```

Add these methods to `impl LuaScanner<'_>`:

```rust
fn try_scan_state_access(&mut self) -> bool {
    const APIS: [(&str, &str); 4] = [
        ("getState", "read"),
        ("setState", "write"),
        ("getChatVar", "read"),
        ("setChatVar", "write"),
    ];

    for (api_name, direction) in APIS {
        if !self.starts_with_identifier(api_name) {
            continue;
        }
        if !self.has_identifier_boundary_before() || !self.has_identifier_boundary_after(api_name) {
            continue;
        }
        let saved_index = self.index;
        let saved_utf16 = self.utf16_offset;
        let saved_line = self.line;
        for _ in 0..api_name.chars().count() {
            self.advance_char();
        }
        self.skip_inline_whitespace();
        if self.current_char() != Some('(') {
            self.index = saved_index;
            self.utf16_offset = saved_utf16;
            self.line = saved_line;
            return false;
        }
        self.advance_char();
        self.skip_inline_whitespace();
        if let Some((key, arg_start_utf16, arg_end_utf16, arg_start_byte, arg_end_byte)) = self.scan_state_key_literal() {
            if key.len() <= self.options.max_key_length {
                self.state_accesses.push(LuaStateAccess {
                    api_name: api_name.to_string(),
                    key,
                    direction,
                    arg_start_utf16,
                    arg_end_utf16,
                    arg_start_byte,
                    arg_end_byte,
                    line: saved_line,
                    containing_function: "<top-level>".to_string(),
                });
            }
            return true;
        }
        self.index = saved_index;
        self.utf16_offset = saved_utf16;
        self.line = saved_line;
        return false;
    }

    false
}

fn starts_with_identifier(&self, name: &str) -> bool {
    self.source[self.current_byte()..].starts_with(name)
}

fn has_identifier_boundary_before(&self) -> bool {
    if self.index == 0 {
        return true;
    }
    let previous = self.chars[self.index - 1].1;
    !is_lua_identifier_char(previous) && previous != '.' && previous != ':'
}

fn has_identifier_boundary_after(&self, name: &str) -> bool {
    let after_index = self.index + name.chars().count();
    match self.chars.get(after_index).map(|(_, ch)| *ch) {
        Some(ch) => !is_lua_identifier_char(ch),
        None => true,
    }
}

fn skip_inline_whitespace(&mut self) {
    while matches!(self.current_char(), Some(' ' | '\t' | '\r' | '\n')) {
        self.advance_char();
    }
}

fn scan_state_key_literal(&mut self) -> Option<(String, usize, usize, usize, usize)> {
    let quote = self.current_char()?;
    if quote != '\'' && quote != '"' {
        return None;
    }
    let arg_start_utf16 = self.utf16_offset + quote.len_utf16();
    let arg_start_byte = self.current_byte() + quote.len_utf8();
    self.advance_char();
    let mut key = String::new();
    let mut escaped = false;
    while let Some(ch) = self.current_char() {
        if escaped {
            key.push(ch);
            escaped = false;
            self.advance_char();
            continue;
        }
        if ch == '\\' {
            escaped = true;
            self.advance_char();
            continue;
        }
        if ch == quote {
            let arg_end_utf16 = self.utf16_offset;
            let arg_end_byte = self.current_byte();
            self.advance_char();
            return Some((key, arg_start_utf16, arg_end_utf16, arg_start_byte, arg_end_byte));
        }
        key.push(ch);
        self.advance_char();
    }
    None
}
```

Add the helper outside the `impl`:

```rust
fn is_lua_identifier_char(ch: char) -> bool {
    ch == '_' || ch.is_ascii_alphanumeric()
}
```

- [ ] **Step 4: Run Rust tests and verify they pass**

Run:

```bash
npm run wasm:test:rust
```

Expected: PASS for string literal and state API scanner tests.

- [ ] **Step 5: Add wasm-bindgen public API test**

In `packages/lua-analyzer-wasm/tests/wasm.rs`, add:

```rust
#[wasm_bindgen_test]
fn analyze_lua_returns_string_literals_and_state_accesses() {
    let source = r#"local msg = "{{user}}"\nsetState("mood", msg)"#;
    let json = analyze_lua(source, r#"{"includeStringLiterals":true,"includeStateAccesses":true}"#);
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid json");

    assert_eq!(value["ok"], true);
    assert_eq!(value["version"], 1);
    assert_eq!(value["stringLiterals"].as_array().unwrap().len(), 2);
    assert_eq!(value["stateAccesses"].as_array().unwrap().len(), 1);
    assert_eq!(value["stateAccesses"][0]["key"], "mood");
}
```

- [ ] **Step 6: Run WASM tests**

Run:

```bash
npm run wasm:test:wasm
```

Expected: PASS.

---

## Task 3: TypeScript WASM adapter and fallback backend

**Files:**
- Create: `packages/core/src/domain/analyze/lua-wasm-types.ts`
- Create: `packages/core/src/domain/analyze/lua-wasm-adapter.ts`
- Create: `packages/core/src/domain/analyze/lua-analysis-backend.ts`
- Modify: `packages/core/package.json`
- Create: `packages/core/tests/domain/analyze/lua-wasm-adapter.test.ts`

- [ ] **Step 1: Add failing adapter tests**

Create `packages/core/tests/domain/analyze/lua-wasm-adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { analyzeLuaWithWasm, normalizeLuaWasmResult } from '../../../src/domain/analyze/lua-wasm-adapter';

describe('lua-wasm-adapter', () => {
  it('normalizes compact wasm results with utf16 offsets', () => {
    const normalized = normalizeLuaWasmResult({
      ok: true,
      parser: 'rust-wasm-lua',
      version: 1,
      sourceLengthUtf16: 24,
      sourceLengthBytes: 24,
      totalLines: 1,
      stringLiterals: [
        {
          startUtf16: 10,
          endUtf16: 20,
          contentStartUtf16: 11,
          contentEndUtf16: 19,
          startByte: 10,
          endByte: 20,
          contentStartByte: 11,
          contentEndByte: 19,
          quoteKind: 'double',
          hasCbsMarker: true,
        },
      ],
      stateAccesses: [],
      diagnostics: [],
      error: null,
    });

    expect(normalized.ok).toBe(true);
    expect(normalized.stringLiterals[0]?.contentStartUtf16).toBe(11);
    expect(normalized.stringLiterals[0]?.hasCbsMarker).toBe(true);
  });

  it('loads wasm package and analyzes a small lua source', async () => {
    const result = await analyzeLuaWithWasm('local msg = "{{user}}"\ngetState("mood")', {
      includeStringLiterals: true,
      includeStateAccesses: true,
    });

    expect(result.ok).toBe(true);
    expect(result.stringLiterals.some((literal) => literal.hasCbsMarker)).toBe(true);
    expect(result.stateAccesses.some((access) => access.key === 'mood')).toBe(true);
  });
});
```

- [ ] **Step 2: Run adapter test and verify it fails**

Run:

```bash
npm run --workspace risu-workbench-core test -- tests/domain/analyze/lua-wasm-adapter.test.ts
```

Expected: FAIL because adapter files do not exist.

- [ ] **Step 3: Add TypeScript WASM result types**

Create `packages/core/src/domain/analyze/lua-wasm-types.ts`:

```ts
export type LuaWasmQuoteKind = 'single' | 'double' | 'long_bracket';
export type LuaWasmAccessDirection = 'read' | 'write';

export interface LuaWasmAnalyzeOptions {
  readonly includeStringLiterals?: boolean;
  readonly includeStateAccesses?: boolean;
  readonly maxKeyLength?: number;
}

export interface LuaWasmStringLiteral {
  readonly startUtf16: number;
  readonly endUtf16: number;
  readonly contentStartUtf16: number;
  readonly contentEndUtf16: number;
  readonly startByte: number;
  readonly endByte: number;
  readonly contentStartByte: number;
  readonly contentEndByte: number;
  readonly quoteKind: LuaWasmQuoteKind;
  readonly hasCbsMarker: boolean;
}

export interface LuaWasmStateAccess {
  readonly apiName: 'getState' | 'setState' | 'getChatVar' | 'setChatVar';
  readonly key: string;
  readonly direction: LuaWasmAccessDirection;
  readonly argStartUtf16: number;
  readonly argEndUtf16: number;
  readonly argStartByte: number;
  readonly argEndByte: number;
  readonly line: number;
  readonly containingFunction: string;
}

export interface LuaWasmDiagnostic {
  readonly message: string;
  readonly startUtf16: number;
  readonly endUtf16: number;
}

export interface LuaWasmAnalyzeResult {
  readonly ok: boolean;
  readonly parser: 'rust-wasm-lua';
  readonly version: 1;
  readonly sourceLengthUtf16: number;
  readonly sourceLengthBytes: number;
  readonly totalLines: number;
  readonly stringLiterals: readonly LuaWasmStringLiteral[];
  readonly stateAccesses: readonly LuaWasmStateAccess[];
  readonly diagnostics: readonly LuaWasmDiagnostic[];
  readonly error: string | null;
}
```

- [ ] **Step 4: Add adapter implementation**

Create `packages/core/src/domain/analyze/lua-wasm-adapter.ts`:

```ts
import type { LuaWasmAnalyzeOptions, LuaWasmAnalyzeResult } from './lua-wasm-types';

interface LuaAnalyzerWasmModule {
  analyze_lua(source: string, optionsJson: string): string;
}

let wasmModulePromise: Promise<LuaAnalyzerWasmModule> | undefined;

export async function loadLuaAnalyzerWasm(): Promise<LuaAnalyzerWasmModule> {
  wasmModulePromise ??= import('@risuai/lua-analyzer-wasm') as Promise<LuaAnalyzerWasmModule>;
  return wasmModulePromise;
}

export async function analyzeLuaWithWasm(
  source: string,
  options: LuaWasmAnalyzeOptions = {},
): Promise<LuaWasmAnalyzeResult> {
  const wasm = await loadLuaAnalyzerWasm();
  const rawJson = wasm.analyze_lua(source, JSON.stringify(options));
  return normalizeLuaWasmResult(JSON.parse(rawJson));
}

export function normalizeLuaWasmResult(value: unknown): LuaWasmAnalyzeResult {
  if (!isRecord(value)) {
    throw new Error('Lua WASM analyzer returned a non-object result');
  }
  if (value.version !== 1 || value.parser !== 'rust-wasm-lua') {
    throw new Error('Lua WASM analyzer returned an unsupported result version');
  }
  if (!Array.isArray(value.stringLiterals) || !Array.isArray(value.stateAccesses)) {
    throw new Error('Lua WASM analyzer returned malformed result arrays');
  }
  return value as LuaWasmAnalyzeResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

- [ ] **Step 5: Add backend selection wrapper**

Create `packages/core/src/domain/analyze/lua-analysis-backend.ts`:

```ts
import { analyzeLuaSource } from './lua-core';
import { analyzeLuaWithWasm } from './lua-wasm-adapter';
import type { LuaAnalysisArtifact } from './lua-analysis-types';
import type { LuaWasmAnalyzeResult } from './lua-wasm-types';

export type LuaAnalysisBackendKind = 'rust-wasm' | 'luaparse' | 'disabled';

export interface LuaAnalysisBackendRequest {
  readonly filePath: string;
  readonly source: string;
  readonly backend?: LuaAnalysisBackendKind;
}

export interface LuaBackendAnalysisResult {
  readonly backend: LuaAnalysisBackendKind;
  readonly wasmResult?: LuaWasmAnalyzeResult;
  readonly artifact?: LuaAnalysisArtifact;
}

export async function analyzeLuaWithBackend(
  request: LuaAnalysisBackendRequest,
): Promise<LuaBackendAnalysisResult> {
  const backend = request.backend ?? 'rust-wasm';
  if (backend === 'disabled') {
    return { backend };
  }
  if (backend === 'rust-wasm') {
    try {
      return {
        backend,
        wasmResult: await analyzeLuaWithWasm(request.source, {
          includeStringLiterals: true,
          includeStateAccesses: true,
        }),
      };
    } catch {
      return {
        backend: 'luaparse',
        artifact: analyzeLuaSource({ filePath: request.filePath, source: request.source }),
      };
    }
  }
  return {
    backend: 'luaparse',
    artifact: analyzeLuaSource({ filePath: request.filePath, source: request.source }),
  };
}
```

- [ ] **Step 6: Add workspace dependency**

Modify `packages/core/package.json` dependencies:

```json
{
  "dependencies": {
    "@risuai/lua-analyzer-wasm": "file:../lua-analyzer-wasm"
  }
}
```

If the package already has a `dependencies` object, add only the new entry. Do not remove existing dependencies.

- [ ] **Step 7: Run install/build/test**

Run:

```bash
npm install
npm run wasm:build
npm run --workspace risu-workbench-core test -- tests/domain/analyze/lua-wasm-adapter.test.ts
npm run --workspace risu-workbench-core build
```

Expected: all commands pass.

---

## Task 4: `.risulua` string-literal fragment mapping

**Files:**
- Modify: `packages/core/src/domain/custom-extension/cbs-fragments.ts`
- Modify: `packages/core/tests/domain/custom-extension/cbs-fragments.test.ts`

- [ ] **Step 1: Add failing fragment mapping tests**

In `packages/core/tests/domain/custom-extension/cbs-fragments.test.ts`, add:

```ts
import { mapLuaWasmStringLiteralsToCbsFragments } from '../../../src/domain/custom-extension/cbs-fragments';

describe('mapLuaWasmStringLiteralsToCbsFragments', () => {
  it('maps only CBS-bearing Lua string literal contents to fragments', () => {
    const source = 'local a = "plain"\nlocal b = "hello {{user}}"\n';
    const fragmentMap = mapLuaWasmStringLiteralsToCbsFragments(source, [
      {
        startUtf16: 10,
        endUtf16: 17,
        contentStartUtf16: 11,
        contentEndUtf16: 16,
        startByte: 10,
        endByte: 17,
        contentStartByte: 10,
        contentEndByte: 17,
        quoteKind: 'double',
        hasCbsMarker: false,
      },
      {
        startUtf16: 28,
        endUtf16: 44,
        contentStartUtf16: 29,
        contentEndUtf16: 43,
        startByte: 28,
        endByte: 44,
        contentStartByte: 28,
        contentEndByte: 44,
        quoteKind: 'double',
        hasCbsMarker: true,
      },
    ]);

    expect(fragmentMap.artifact).toBe('lua');
    expect(fragmentMap.fragments).toHaveLength(1);
    expect(fragmentMap.fragments[0]).toMatchObject({
      section: 'lua-string:1',
      start: 29,
      end: 43,
      content: 'hello {{user}}',
    });
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run --workspace risu-workbench-core test -- tests/domain/custom-extension/cbs-fragments.test.ts
```

Expected: FAIL because `mapLuaWasmStringLiteralsToCbsFragments` does not exist.

- [ ] **Step 3: Implement fragment mapper**

In `packages/core/src/domain/custom-extension/cbs-fragments.ts`, import the type:

```ts
import type { LuaWasmStringLiteral } from '../analyze/lua-wasm-types';
```

Add this exported function near `mapLuaToCbsFragments`:

```ts
export function mapLuaWasmStringLiteralsToCbsFragments(
  rawContent: string,
  stringLiterals: readonly LuaWasmStringLiteral[],
): CbsFragmentMap {
  const fragments = stringLiterals
    .filter((literal) => literal.hasCbsMarker)
    .map((literal, index) => ({
      section: `lua-string:${index + 1}`,
      start: literal.contentStartUtf16,
      end: literal.contentEndUtf16,
      content: rawContent.slice(literal.contentStartUtf16, literal.contentEndUtf16),
    }));

  return {
    artifact: 'lua',
    fragments,
    fileLength: rawContent.length,
  };
}
```

- [ ] **Step 4: Run fragment tests**

Run:

```bash
npm run --workspace risu-workbench-core test -- tests/domain/custom-extension/cbs-fragments.test.ts
```

Expected: PASS.

---

## Task 5: CBS LSP indexing consumes WASM state accesses

**Files:**
- Modify: `packages/cbs-lsp/src/indexer/file-scanner.ts`
- Modify: `packages/cbs-lsp/src/indexer/element-registry.ts`
- Modify: `packages/cbs-lsp/tests/indexer/element-registry.test.ts`

- [ ] **Step 1: Add failing LSP registry test for WASM state access path**

In `packages/cbs-lsp/tests/indexer/element-registry.test.ts`, add a test near the existing oversized Lua test:

```ts
it('indexes oversized lua state accesses from compact wasm-compatible scan records', () => {
  const uri = 'file:///workspace/oversized.risulua';
  const source = 'local mood = getState("wasmMood")\nsetChatVar("wasmReply", mood)\n';
  const registry = new ElementRegistry();

  registry.rebuild({
    rootUri: 'file:///workspace',
    files: [
      {
        uri,
        absolutePath: '/workspace/oversized.risulua',
        relativePath: 'oversized.risulua',
        artifact: 'lua',
        artifactClass: 'cbs-bearing',
        cbsBearingArtifact: true,
        text: '',
        originalTextLength: source.length,
        indexTextTruncated: true,
        lightweightLuaSourceText: source,
        lightweightLuaStateAccessOccurrences: [
          {
            apiName: 'getState',
            key: 'wasmMood',
            direction: 'read',
            argStart: source.indexOf('wasmMood'),
            argEnd: source.indexOf('wasmMood') + 'wasmMood'.length,
            line: 1,
            containingFunction: '<top-level>',
          },
          {
            apiName: 'setChatVar',
            key: 'wasmReply',
            direction: 'write',
            argStart: source.indexOf('wasmReply'),
            argEnd: source.indexOf('wasmReply') + 'wasmReply'.length,
            line: 2,
            containingFunction: '<top-level>',
          },
        ],
        fragmentMap: { artifact: 'lua', fragments: [], fileLength: source.length },
        hasCbsFragments: false,
        fragmentCount: 0,
        fragmentSections: [],
      },
    ],
    stats: {
      filesDiscovered: 1,
      filesScanned: 1,
      filesSkipped: 0,
      artifacts: { lua: 1 },
      fragments: 0,
    },
  });

  const artifact = registry.getLuaArtifactByUri(uri);
  expect(artifact?.serialized.stateAccessOccurrences.map((occurrence) => occurrence.key)).toEqual([
    'wasmMood',
    'wasmReply',
  ]);
});
```

- [ ] **Step 2: Run registry test**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/indexer/element-registry.test.ts
```

Expected: PASS if the current lightweight path already accepts compact records. If it fails, fix only the registry path that consumes `lightweightLuaStateAccessOccurrences`.

- [ ] **Step 3: Add WASM-to-StateAccessOccurrence converter in FileScanner**

In `packages/cbs-lsp/src/indexer/file-scanner.ts`, add a local converter function:

```ts
import type { LuaWasmStateAccess } from '@risuai/core/domain/analyze/lua-wasm-types';

function convertWasmStateAccesses(
  accesses: readonly LuaWasmStateAccess[],
): readonly StateAccessOccurrence[] {
  return accesses.map((access) => ({
    apiName: access.apiName,
    key: access.key,
    direction: access.direction,
    argStart: access.argStartUtf16,
    argEnd: access.argEndUtf16,
    line: access.line,
    containingFunction: access.containingFunction,
  }));
}
```

If the package import path differs in this repository, use the existing core package import alias used elsewhere in `packages/cbs-lsp/src/indexer/file-scanner.ts`.

- [ ] **Step 4: Keep JS scanner fallback policy explicit**

In `createWorkspaceScanFileFromText()`, keep this behavior:

```ts
const lightweightLuaStateAccessOccurrences = indexTextTruncated
  ? scanLuaStateAccessOccurrences(options.text)
  : undefined;
```

Then add this fallback-policy comment directly above it:

```ts
// Keep this JS scanner as the fallback path. The Rust/WASM adapter replaces this
// value when compact scan records are available, but oversized files must never
// fall back to full Lua/CBS parsing on WASM load failure.
```

- [ ] **Step 5: Run LSP tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/indexer/element-registry.test.ts
```

Expected: PASS.

---

## Task 6: Runtime `.risulua` fragment analysis uses string literal ranges

**Files:**
- Modify: `packages/cbs-lsp/src/core/fragment-analysis-service.ts`
- Modify: `packages/cbs-lsp/tests/perf/large-workspace.test.ts`

- [ ] **Step 1: Add failing runtime test for literal-scoped CBS analysis**

In `packages/cbs-lsp/tests/perf/large-workspace.test.ts`, add a test near the existing oversized `.risulua` runtime tests:

```ts
it('keeps CBS runtime analysis scoped to Lua string literals when wasm literal ranges are available', async () => {
  const source = [
    'local plain = "no cbs here"',
    'local macro = "hello {{user}}"',
    'local luaCode = getState("mood")',
  ].join('\n');

  const service = new FragmentAnalysisService();
  const analysis = service.analyzeDocument({
    uri: 'file:///workspace/scoped.risulua',
    languageId: 'risulua',
    version: 1,
    text: source,
  });

  expect(analysis.fragmentMap.fragments.length).toBeLessThanOrEqual(1);
  expect(analysis.fragmentMap.fragments[0]?.content).toContain('{{user}}');
  expect(analysis.fragmentMap.fragments[0]?.content).not.toContain('getState');
});
```

If `FragmentAnalysisService` constructor requires dependencies in the current test file, instantiate it using the same helper already used by nearby tests.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
```

Expected: FAIL because `.risulua` still maps the whole file as one fragment when under the oversized threshold.

- [ ] **Step 3: Integrate fragment mapper in analysis service**

In `packages/cbs-lsp/src/core/fragment-analysis-service.ts`, locate the normal path where it calls:

```ts
const fragmentMap = core.mapToCbsFragments(artifact, request.text);
```

Replace the `.risulua`/Lua branch with this policy:

```ts
const fragmentMap = artifact === 'lua' && wasmResult?.ok
  ? core.mapLuaWasmStringLiteralsToCbsFragments(request.text, wasmResult.stringLiterals)
  : core.mapToCbsFragments(artifact, request.text);
```

If `wasmResult` is not available in this service yet, introduce a private helper:

```ts
private getLuaFragmentMap(artifact: ArtifactKind, text: string): CbsFragmentMap {
  if (artifact !== 'lua') {
    return core.mapToCbsFragments(artifact, text);
  }
  const cachedWasmResult = this.luaScanCache?.get(text);
  if (cachedWasmResult?.ok) {
    return core.mapLuaWasmStringLiteralsToCbsFragments(text, cachedWasmResult.stringLiterals);
  }
  return core.mapToCbsFragments(artifact, text);
}
```

Use the repository's existing cache/dependency injection style rather than introducing a global mutable singleton.

- [ ] **Step 4: Keep oversized guard unchanged**

Verify this branch still runs before any fragment mapping:

```ts
if (shouldSkipOversizedLuaText(request.text, request.uri)) {
  return this.createEmptyAnalysis(...);
}
```

Do not allow WASM failure or missing cache to re-enable full-file CBS parse for oversized `.risulua`.

- [ ] **Step 5: Run runtime/perf tests**

Run:

```bash
npm run --workspace cbs-language-server test -- tests/perf/large-workspace.test.ts
npm run --workspace cbs-language-server test -- tests/features/hover.test.ts tests/features/completion.test.ts
```

Expected: PASS.

---

## Task 7: Verification, docs, and TODO update

**Files:**
- Modify: `packages/lua-analyzer-wasm/README.md`
- Modify: `TODO.md`

- [ ] **Step 1: Update WASM README with scanner scope**

Add this section to `packages/lua-analyzer-wasm/README.md`:

```md
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
```

- [ ] **Step 2: Run full verification commands**

Run:

```bash
npm run wasm:check
npm run --workspace risu-workbench-core test -- tests/domain/analyze/lua-wasm-adapter.test.ts tests/domain/custom-extension/cbs-fragments.test.ts
npm run --workspace risu-workbench-core build
npm run --workspace cbs-language-server test -- tests/indexer/element-registry.test.ts tests/perf/large-workspace.test.ts tests/features/hover.test.ts tests/features/completion.test.ts
npm run --workspace cbs-language-server build
```

Expected: all commands pass.

- [ ] **Step 3: Run LSP diagnostics on modified TypeScript files**

Use the LSP diagnostics tool on all modified TypeScript files:

```text
packages/core/src/domain/analyze/lua-wasm-types.ts
packages/core/src/domain/analyze/lua-wasm-adapter.ts
packages/core/src/domain/analyze/lua-analysis-backend.ts
packages/core/src/domain/custom-extension/cbs-fragments.ts
packages/cbs-lsp/src/indexer/file-scanner.ts
packages/cbs-lsp/src/indexer/element-registry.ts
packages/cbs-lsp/src/core/fragment-analysis-service.ts
```

Expected: zero diagnostics.

- [ ] **Step 4: Update TODO.md after verification**

In `TODO.md`, under `### Done (2026-04-25)`, add:

```md
- [x] Rust/WASM Lua lexical indexing kernel을 CBS LSP `.risulua` 분석 경로에 연결함. WASM analyzer가 Lua short/long string literal range, CBS marker 여부, 정적 `getState`/`setState`/`getChatVar`/`setChatVar` key occurrence를 compact record로 반환하고, TypeScript adapter/backend가 WASM lazy-load와 `luaparse` fallback을 관리하게 했으며, `.risulua` CBS fragment mapping을 full-file이 아닌 CBS-bearing string literal content range 기반으로 전환함. wasm/core/cbs-lsp targeted tests와 build 검증을 완료함
```

Under `### Remaining` → `#### Rust WASM Lua Analyzer`, remove completed items only if all corresponding tests passed:

```md
- [ ] Lua string literal scanner 구현: single/double quote, escaped quote, long bracket, multiline, comment 안 fake string 제외, `hasCbsMarker` 계산
- [ ] `packages/core/src/domain/analyze/lua-wasm-adapter.ts` / `lua-analysis-backend.ts`를 추가해 WASM lazy-load와 `luaparse` fallback 정책 연결
- [ ] `.risulua` CBS fragment mapping을 string literal range 기반으로 전환하기
```

- [ ] **Step 5: Commit only if explicitly requested by the user**

Do not commit automatically. If the user explicitly asks for a commit, use the repository's git safety protocol and include only relevant files.

---

## Self-Review

### Spec coverage

- Whole-file JS memory risk is addressed by moving lexical indexing work into Rust/WASM and retaining compact records.
- Project-wide indexing is addressed through FileScanner/ElementRegistry compact state access consumption.
- CBS-specific algorithm is addressed through string-literal range mapping instead of full-file `.risulua` fragment mapping.
- Rust adoption is addressed through `packages/lua-analyzer-wasm`, TS adapter, backend selection, and targeted tests.
- Fallback safety is addressed by preserving JS scanner fallback and explicitly preventing oversized full parse resurrection.

### Placeholder scan

- Placeholder scan passed. The only task-ledger references point to `TODO.md`, not unfinished implementation instructions.
- Each code-changing step includes concrete code or an exact replacement policy.

### Type consistency

- Rust fields use camelCase JSON through `serde(rename_all = "camelCase")`.
- TypeScript `LuaWasmAnalyzeResult`, `LuaWasmStringLiteral`, and `LuaWasmStateAccess` mirror Rust result field names.
- LSP-facing offsets use `Utf16` fields for JS `slice()`/LSP `positionAt()` compatibility, while byte offsets remain available for future native scanner work.
