use wasm_bindgen_test::*;

#[wasm_bindgen_test]
fn analyze_lua_returns_json_from_wasm() {
    let output = lua_analyzer_wasm::analyze_lua("print('hello')", "{}");
    assert!(output.contains("\"ok\":true"));
    assert!(output.contains("\"parser\":\"rust-wasm-lua\""));
}

#[wasm_bindgen_test]
fn analyze_lua_returns_string_literals_and_state_accesses() {
    let source = "local msg = \"{{user}}\"\nsetState(\"mood\", msg)";
    let json = lua_analyzer_wasm::analyze_lua(
        source,
        r#"{"includeStringLiterals":true,"includeStateAccesses":true}"#,
    );
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid json");

    assert_eq!(value["ok"], true);
    assert_eq!(value["version"], 1);
    assert_eq!(value["stringLiterals"].as_array().unwrap().len(), 2);
    assert_eq!(value["stateAccesses"].as_array().unwrap().len(), 1);
    assert_eq!(value["stateAccesses"][0]["key"], "mood");
}
