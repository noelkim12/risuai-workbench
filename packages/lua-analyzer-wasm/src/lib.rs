//! Rust WASM Lua analyzer experiment entry points.

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

fn default_true() -> bool {
    true
}

fn default_max_key_length() -> usize {
    256
}

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

/// analyze_lua function.
/// Returns a compact JSON payload for the Rust WASM Lua analyzer boundary.
///
/// @param source - Lua source text to inspect.
/// @param options_json - JSON-encoded analyzer options.
/// @returns JSON string matching the planned Lua WASM analysis result envelope.
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
        })
        .to_string(),
    }
}

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
            if ch == '[' && self.try_scan_long_bracket(false) {
                continue;
            }
            if self.options.include_state_accesses && self.try_scan_state_access() {
                continue;
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
        self.chars
            .get(self.index)
            .map(|(byte, _)| *byte)
            .unwrap_or(self.source.len())
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
                self.push_string_literal(LuaStringLiteralInput {
                    start_byte,
                    end_byte: self.current_byte(),
                    content_start_byte,
                    content_end_byte,
                    start_utf16,
                    end_utf16: self.utf16_offset,
                    content_start_utf16,
                    content_end_utf16,
                    quote_kind: if quote == '\'' { "single" } else { "double" },
                });
                return;
            }
            self.advance_char();
        }
    }

    fn try_scan_long_bracket(&mut self, is_comment: bool) -> bool {
        let saved_index = self.index;
        let saved_utf16 = self.utf16_offset;
        let saved_line = self.line;
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
                    self.push_string_literal(LuaStringLiteralInput {
                        start_byte,
                        end_byte: self.current_byte(),
                        content_start_byte,
                        content_end_byte,
                        start_utf16,
                        end_utf16: self.utf16_offset,
                        content_start_utf16,
                        content_end_utf16,
                        quote_kind: "long_bracket",
                    });
                }
                return true;
            }
            self.advance_char();
        }

        self.index = saved_index;
        self.utf16_offset = saved_utf16;
        self.line = saved_line;
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

    fn push_string_literal(&mut self, input: LuaStringLiteralInput) {
        if !self.options.include_string_literals {
            return;
        }
        let content = &self.source[input.content_start_byte..input.content_end_byte];
        self.string_literals.push(LuaStringLiteral {
            start_utf16: input.start_utf16,
            end_utf16: input.end_utf16,
            content_start_utf16: input.content_start_utf16,
            content_end_utf16: input.content_end_utf16,
            start_byte: input.start_byte,
            end_byte: input.end_byte,
            content_start_byte: input.content_start_byte,
            content_end_byte: input.content_end_byte,
            quote_kind: input.quote_kind,
            has_cbs_marker: content.contains("{{") || content.contains("}}"),
        });
    }

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
            if !self.has_identifier_boundary_before() || !self.has_identifier_boundary_after(api_name)
            {
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
                self.restore_position(saved_index, saved_utf16, saved_line);
                return false;
            }
            self.advance_char();
            self.skip_inline_whitespace();
            if let Some((key, arg_start_utf16, arg_end_utf16, arg_start_byte, arg_end_byte)) =
                self.scan_state_key_literal()
            {
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
            self.restore_position(saved_index, saved_utf16, saved_line);
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
        let literal_start_utf16 = self.utf16_offset;
        let literal_start_byte = self.current_byte();
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
                self.push_string_literal(LuaStringLiteralInput {
                    start_byte: literal_start_byte,
                    end_byte: self.current_byte(),
                    content_start_byte: arg_start_byte,
                    content_end_byte: arg_end_byte,
                    start_utf16: literal_start_utf16,
                    end_utf16: self.utf16_offset,
                    content_start_utf16: arg_start_utf16,
                    content_end_utf16: arg_end_utf16,
                    quote_kind: if quote == '\'' { "single" } else { "double" },
                });
                return Some((key, arg_start_utf16, arg_end_utf16, arg_start_byte, arg_end_byte));
            }
            key.push(ch);
            self.advance_char();
        }
        None
    }

    fn restore_position(&mut self, index: usize, utf16_offset: usize, line: usize) {
        self.index = index;
        self.utf16_offset = utf16_offset;
        self.line = line;
    }
}

struct LuaStringLiteralInput {
    start_byte: usize,
    end_byte: usize,
    content_start_byte: usize,
    content_end_byte: usize,
    start_utf16: usize,
    end_utf16: usize,
    content_start_utf16: usize,
    content_end_utf16: usize,
    quote_kind: &'static str,
}

fn is_lua_identifier_char(ch: char) -> bool {
    ch == '_' || ch.is_ascii_alphanumeric()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    #[test]
    fn analyze_lua_returns_result_envelope() {
        let output = analyze_lua("local value = 1\nprint(value)", "{}");
        let parsed: Value = serde_json::from_str(&output).expect("valid JSON result");

        assert_eq!(parsed["ok"], true);
        assert_eq!(parsed["parser"], "rust-wasm-lua");
        assert_eq!(parsed["version"], 1);
        assert_eq!(parsed["sourceLengthUtf16"], 28);
        assert_eq!(parsed["sourceLengthBytes"], 28);
        assert_eq!(parsed["totalLines"], 2);
        assert_eq!(parsed["stringLiterals"].as_array().unwrap().len(), 0);
        assert_eq!(parsed["stateAccesses"].as_array().unwrap().len(), 0);
        assert_eq!(parsed["diagnostics"].as_array().unwrap().len(), 0);
        assert!(parsed["error"].is_null());
    }

    #[test]
    fn analyze_lua_counts_empty_source_as_one_line() {
        let output = analyze_lua("", "{}");
        let parsed: Value = serde_json::from_str(&output).expect("valid JSON result");

        assert_eq!(parsed["sourceLengthUtf16"], 0);
        assert_eq!(parsed["sourceLengthBytes"], 0);
        assert_eq!(parsed["totalLines"], 1);
    }

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

    #[test]
    fn enforces_max_key_length() {
        let result = analyze_source(
            r#"getState("toolong")
getState("ok")"#,
            AnalyzeOptions {
                max_key_length: 2,
                ..AnalyzeOptions::default()
            },
        );

        assert_eq!(result.state_accesses.len(), 1);
        assert_eq!(result.state_accesses[0].key, "ok");
        assert_eq!(result.state_accesses[0].containing_function, "<top-level>");
    }
}
