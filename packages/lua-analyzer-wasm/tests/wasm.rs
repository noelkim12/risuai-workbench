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

#[wasm_bindgen_test]
fn analyze_lua_returns_generated_bridge_index_arrays() {
    let source = r#"
local __button_actions = require("button_actions.actions")
---@source regex/Heroine_옷_설정.risuregex:11:0
setHeroineClothes = __button_actions.setHeroineClothes
"#;
    let json = lua_analyzer_wasm::analyze_lua(
        source,
        r#"{"includeRequireAliases":true,"includeMemberBridgeAssignments":true,"includeSourceComments":true}"#,
    );
    let value: serde_json::Value = serde_json::from_str(&json).expect("valid json");

    assert_eq!(value["version"], 1);
    assert_eq!(value["requireAliases"][0]["aliasName"], "__button_actions");
    assert_eq!(
        value["memberBridgeAssignments"][0]["publicName"],
        "setHeroineClothes"
    );
    assert_eq!(
        value["sourceComments"][0]["sourcePath"],
        "regex/Heroine_옷_설정.risuregex"
    );
}
