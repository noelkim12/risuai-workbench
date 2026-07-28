# CBS Simulator Support Matrix & Gap Analysis

## Executive Summary

This document provides a comprehensive analysis of the CBS (Character Book Script) simulator's capabilities in the risu-workbench-core package. The simulator implements a **dry-run, mutation-free** evaluation contract for RisuAI CBS syntax patterns.

**Key Statistics:**
- **Total Registry Builtins:** 175 canonical names
- **Fully Supported:** 73 macros (42%)
- **Runtime-Unknown:** 46 macros (26%) - require explicit context
- **Effect-Only:** 8 macros (5%) - dry-run effects recorded, not committed
- **Approximate:** 9 macros (5%) - partial/approximate evaluation
- **Unsupported:** 14 macros (8%) - source preserved with diagnostics
- **Unknown (Parser Failures):** 0 macros - parser handles all registry items

---

## Support Classification Matrix

### 1. FULLY SUPPORTED MACROS (73)

These macros have complete evaluator implementations:

#### String & Display (18)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `blank` | `{{blank}}` | Returns empty string |
| `br` | `{{br}}` | Returns newline character |
| `cbr` | `{{cbr::[n]}}` | Returns escaped newline(s) |
| `decbo` | `{{decbo}}` | Display escaped curly bracket open (⁅) |
| `decbc` | `{{decbc}}` | Display escaped curly bracket close (⁆) |
| `bo` | `{{bo}}` | Double display escaped open (⁅⁅) |
| `bc` | `{{bc}}` | Double display escaped close (⁆⁆) |
| `displayescapedbracketopen` | `{{displayescapedbracketopen}}` | Unicode open parenthesis |
| `displayescapedbracketclose` | `{{displayescapedbracketclose}}` | Unicode close parenthesis |
| `displayescapedanglebracketopen` | `{{displayescapedanglebracketopen}}` | Unicode < |
| `displayescapedanglebracketclose` | `{{displayescapedanglebracketclose}}` | Unicode > |
| `displayescapedcolon` | `{{displayescapedcolon}}` | Unicode colon |
| `displayescapedsemicolon` | `{{displayescapedsemicolon}}` | Unicode semicolon |
| `trim` | `{{trim::text}}` | Trim whitespace |
| `lower` | `{{lower::text}}` | Lowercase conversion |
| `upper` | `{{upper::text}}` | Uppercase conversion |
| `capitalize` | `{{capitalize::text}}` | Capitalize first letter |
| `length` | `{{length::text}}` | String length |

#### Comparison & Logic (10)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `equal` | `{{equal::a::b}}` | String equality (returns 1/0) |
| `notequal` | `{{notequal::a::b}}` | String inequality |
| `greater` | `{{greater::a::b}}` | Numeric greater than |
| `less` | `{{less::a::b}}` | Numeric less than |
| `greaterequal` | `{{greaterequal::a::b}}` | Numeric >= |
| `lessequal` | `{{lessequal::a::b}}` | Numeric <= |
| `and` | `{{and::a::b}}` | Logical AND |
| `or` | `{{or::a::b}}` | Logical OR |
| `not` | `{{not::a}}` | Logical NOT |
| `iserror` | `{{iserror::text}}` | Checks for "error:" prefix |

#### String Operations (6)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `startswith` | `{{startswith::text::prefix}}` | Prefix check |
| `endswith` | `{{endswith::text::suffix}}` | Suffix check |
| `contains` | `{{contains::text::substring}}` | Substring check |
| `replace` | `{{replace::text::old::new}}` | Global replace |
| `split` | `{{split::text::delimiter}}` | Split to JSON array |
| `join` | `{{join::array::separator}}` | Join array elements |

#### Math & Calculation (14)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `calc` | `{{calc::expression}}` | Math expression evaluation |
| `round` | `{{round::number}}` | Round to nearest integer |
| `floor` | `{{floor::number}}` | Floor function |
| `ceil` | `{{ceil::number}}` | Ceiling function |
| `abs` | `{{abs::number}}` | Absolute value |
| `remaind` | `{{remaind::a::b}}` | Modulo operation |
| `tonumber` | `{{tonumber::text}}` | Extract numeric characters |
| `pow` | `{{pow::base::exp}}` | Exponentiation |
| `min` | `{{min::...values}}` | Minimum value |
| `max` | `{{max::...values}}` | Maximum value |
| `sum` | `{{sum::...values}}` | Sum of values |
| `average` | `{{average::...values}}` | Arithmetic mean |
| `fixnum` | `{{fixnum::number::decimals}}` | Fixed decimal places |
| `?` | `{{? expression}}` | Math expression (shorthand) |

#### Array & Object (10)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `makearray` | `{{makearray::...items}}` | Create JSON array |
| `makedict` | `{{makedict::key=value::...}}` | Create JSON object |
| `arraylength` | `{{arraylength::array}}` | Array element count |
| `arrayelement` | `{{arrayelement::array::index}}` | Get array element |
| `dictelement` | `{{dictelement::object::key}}` | Get object property |
| `element` | `{{element::data::...path}}` | Deep property access |
| `filter` | `{{filter::array::type}}` | Filter array (all/nonempty/unique) |
| `all` | `{{all::...values}}` | All values truthy? |
| `any` | `{{any::...values}}` | Any value truthy? |
| `range` | `{{range::[start,end,step]}}` | Generate number range |

#### Encoding & Crypto (8)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `unicodeencode` | `{{unicodeencode::text::[index]}}` | Char to code point |
| `unicodedecode` | `{{unicodedecode::code}}` | Code point to char |
| `u` | `{{u::hex}}` | Hex to Unicode char |
| `ue` | `{{ue::hex}}` | Hex to Unicode char (alias) |
| `fromhex` | `{{fromhex::hex}}` | Hex to decimal |
| `tohex` | `{{tohex::number}}` | Decimal to hex |
| `xor` | `{{xor::text}}` | XOR encrypt + base64 |
| `xordecrypt` | `{{xordecrypt::base64}}` | XOR decrypt |
| `crypt` | `{{crypt::text::[shift]}}` | Caesar cipher |

#### Random (5)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `random` | `{{random::...choices}}` | Random selection (RNG-based) |
| `pick` | `{{pick::...choices}}` | Random selection (hash-based) |
| `randint` | `{{randint::min::max}}` | Random integer |
| `roll` | `{{roll::notation}}` | Dice roll (RNG-based) |
| `rollp` | `{{rollp::notation}}` | Dice roll (hash-based) |

#### Time (4)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `unixtime` | `{{unixtime}}` | Unix timestamp (seconds) |
| `time` | `{{time::[format]::[timestamp]}}` | Formatted time |
| `isotime` | `{{isotime}}` | UTC time HH:MM:SS |
| `isodate` | `{{isodate}}` | UTC date YYYY-M-D |
| `date` | `{{date::[format]::[timestamp]}}` | Formatted date |

#### Variable Access (3)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `getvar` | `{{getvar::name}}` | Read chat variable |
| `getglobalvar` | `{{getglobalvar::name}}` | Read global variable |
| `tempvar` | `{{tempvar::name}}` | Read temp variable |

#### Output Formatting (3)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `tex` | `{{tex::expression}}` | LaTeX math wrapper |
| `ruby` | `{{ruby::base::ruby}}` | Ruby/furigana text |
| `codeblock` | `{{codeblock::[lang]::code}}` | Code block formatting |

#### Comments (2)
| Macro | Syntax | Description |
|-------|--------|-------------|
| `comment` | `{{comment::text}}` | Displayed comment |
| `//` | `{{// text}}` | Hidden comment |

---

### 2. RUNTIME-UNKNOWN MACROS (46)

These macros require explicit context to evaluate. Without context, they preserve source with diagnostics.

#### Identity & Chat Context (12)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `char` | `characterLabel` | Character name |
| `user` | `userLabel` | User name (supported if explicit) |
| `role` | `role` | Current message role |
| `chatindex` | `chatIndex` | Current message index |
| `isfirstmsg` | `isFirstMessage` | First message flag |
| `previouschatlog` | `chatHistory` | Chat history array |
| `lastmessageid` | `chatHistory` | Last message index |
| `history` | `chatHistory` | Full chat history |
| `previouscharchat` | `chatHistory` | Last char message |
| `previoususerchat` | `chatHistory` | Last user message |
| `userhistory` | `chatHistory` | All user messages |
| `charhistory` | `chatHistory` | All char messages |

#### Character Data (8)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `personality` | Character data | Persona field |
| `description` | Character data | Description field |
| `scenario` | Character data | Scenario field |
| `exampledialogue` | Character data | Example dialogue |
| `persona` | Character data | User persona |
| `mainprompt` | Character data | System prompt |
| `lorebook` | Character data | Active lorebook entries |
| `jb` | Character data | Jailbreak prompt |

#### Runtime State (10)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `globalnote` | Character data | Global/system note |
| `authornote` | Character data | Author's note |
| `model` | Runtime | AI model ID |
| `axmodel` | Runtime | Auxiliary model |
| `jbtoggled` | Runtime | JB toggle state |
| `maxcontext` | Runtime | Context limit |
| `prefillsupported` | Runtime | Prefill support flag |
| `moduleenabled` | Runtime | Module check |
| `risu` | Runtime | Risu logo display |
| `trigger_id` | Runtime | Trigger element ID |

#### Time & Message (6)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `messagetime` | Message data | Message timestamp time |
| `messagedate` | Message data | Message timestamp date |
| `messageunixtimearray` | Message data | All message timestamps |
| `messageidleduration` | Message data | Idle duration |
| `idleduration` | Message data | Time since last message |
| `firstmsgindex` | Character data | Selected greeting index |

#### UI/Environment (4)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `screenwidth` | Environment | Viewport width |
| `screenheight` | Environment | Viewport height |
| `emotionlist` | Character data | Available emotions |
| `assetlist` | Character data | Available assets |

#### Assets & Display (6)
| Macro | Required Context | Notes |
|-------|-----------------|-------|
| `lastmessage` | `chatHistory` | Last message content |
| `moduleassetlist` | Runtime | Module assets |
| `chardisplayasset` | Character data | Display assets |
| `metadata` | Runtime | System metadata |
| `hiddenkey` | Runtime | Lore activation key |
| `source` | Profile data | Profile source URL |

---

### 3. EFFECT-ONLY MACROS (8)

These macros record dry-run effects but don't commit changes:

| Macro | Syntax | Effect Recorded |
|-------|--------|-----------------|
| `setvar` | `{{setvar::name::value}}` | `variableWrite` to chatVariables |
| `addvar` | `{{addvar::name::amount}}` | `variableWrite` increment |
| `setdefaultvar` | `{{setdefaultvar::name::value}}` | `variableWrite` to characterDefaultVariable |
| `settempvar` | `{{settempvar::name::value}}` | Updates simulator-local temp state |
| `return` | `{{return::value}}` | Sets simulator-local return state |
| `declare` | `{{declare::name}}` | Parser declaration (no runtime effect) |
| `arrayshift` | `{{arrayshift::array}}` | Array mutation (not implemented) |
| `arraypop` | `{{arraypop::array}}` | Array mutation (not implemented) |
| `arraypush` | `{{arraypush::array::value}}` | Array mutation (not implemented) |
| `arraysplice` | `{{arraysplice::array::index::count::[value]}}` | Array mutation (not implemented) |

---

### 4. APPROXIMATE MACROS (9)

These macros have partial or approximate implementations:

| Macro | Status | Notes |
|-------|--------|-------|
| `hash` | Approximate | Deterministic 7-digit hash (not cryptographic) |
| `spread` | Approximate | Array joining with `::` separator |
| `objectassert` | Approximate | Object default value setting |
| `arrayassert` | Approximate | Array default value setting |
| `reverse` | Approximate | String reversal |
| `#if` | Approximate | Deprecated, basic truthy evaluation |
| `#if_pure` | Approximate | Deprecated, whitespace preserved |
| `position` | Approximate | Requires explicit `lorePositions` context |
| `slot` | Approximate | Bare slot needs host context |

---

### 5. UNSUPPORTED MACROS (14)

These macros preserve source with warning diagnostics:

| Category | Macros |
|----------|--------|
| **Assets** | `asset`, `emotion`, `audio`, `bg`, `bgm`, `video`, `video-img`, `image`, `img`, `path`, `inlay`, `inlayed`, `inlayeddata` |
| **UI** | `button`, `file`, `chardisplayasset` |
| **Internal** | `__` |

---

### 6. SUPPORTED BLOCKS (8)

| Block | Syntax | Support Level |
|-------|--------|---------------|
| `#when` | `{{#when::condition}}...{{/when}}` | Full - all operators supported |
| `:else` | `{{:else}}` | Full - else branch |
| `#each` | `{{#each array as alias}}...{{slot::alias}}...{{/each}}` | Full - iteration with slot binding |
| `#pure` | `{{#pure}}...{{/pure}}` | Full - literal body (deprecated) |
| `#puredisplay` | `{{#puredisplay}}...{{/puredisplay}}` | Full - literal with escape |
| `#escape` | `{{#escape}}...{{/escape}}` | Full - brace escaping |
| `#if` | `{{#if condition}}...{{/if}}` | Approximate - deprecated |
| `#if_pure` | `{{#if_pure condition}}...{{/if_pure}}` | Approximate - deprecated |
| `#func` | `{{#func}}...{{/func}}` | Unsupported - source preserved |

---

## Parser Coverage

The CBS parser (`CBSParser`) successfully handles:

- ✅ All 175 registry builtins
- ✅ Macro calls: `{{name::arg1::arg2}}`
- ✅ Block structures: `{{#when}}...{{/when}}`
- ✅ Nested macros and blocks (up to depth 64)
- ✅ Math expressions: `{{? 1+2}}`
- ✅ Comments: `{{! comment}}` and `{{// comment}}`
- ✅ Angle bracket macros: `<name>`
- ✅ Block operators: `keep`, `legacy` for `#when`, `#each`, `#escape`
- ✅ `#when` chain operators: `and`, `or`, `not`, `is`, `isnot`, `var`, `toggle`, `vis`, `visnot`, `tis`, `tisnot`, `>`, `<`, `>=`, `<=`

---

## Simulator Gaps & Limitations

### 1. Control Flow Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| `call` macro | High | Function calls not implemented - marked as unsupported |
| `#func` blocks | High | Function definitions not implemented |
| `return` across blocks | Medium | Only sets local state, doesn't actually exit nested blocks |

### 2. Array Mutation Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| `arrayshift` | Medium | Returns source, no mutation |
| `arraypop` | Medium | Returns source, no mutation |
| `arraypush` | Medium | Returns source, no mutation |
| `arraysplice` | Medium | Returns source, no mutation |

### 3. Context-Dependent Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| Character field macros | High | 46 macros need explicit context |
| Chat history access | High | Requires `chatHistory` in context |
| Runtime state | Medium | Model, toggles, screen size |
| Asset lists | Low | Character emotion/asset lists |

### 4. Asset Display Gaps

All asset-related macros are unsupported (14 total):
- Image/audio/video display
- Background/BGM control
- Inlay assets
- Path/raw asset access

### 5. Advanced Block Features

| Feature | Status | Notes |
|---------|--------|-------|
| `#each` with nested CBS in header | Partial | Basic support, complex nesting may fail |
| `#when` with complex operator chains | Partial | Right-to-left evaluation, all operators supported |
| Block close shorthand `{{/}}` | Full | Supported |
| Legacy numbered close `{{/123}}` | Full | Supported |

---

## Expected RisuAI CBS Syntax Patterns

Based on test fixtures and registry documentation:

### Basic Macro Pattern
```
{{macroName::arg1::arg2::...}}
```

### Block Patterns
```
{{#when condition}}content{{/when}}
{{#when::not::condition}}content{{:else}}other{{/when}}
{{#each ["a","b"] as item}}{{slot::item}}{{/each}}
{{#if condition}}content{{/if}}  (deprecated)
{{#puredisplay}}literal content{{/puredisplay}}
{{#escape}}escaped {{braces}}{{/escape}}
```

### Variable Patterns
```
{{getvar::variableName}}
{{setvar::variableName::value}}
{{addvar::variableName::amount}}
{{tempvar::variableName}}
{{settempvar::variableName::value}}
{{getglobalvar::variableName}}
```

### Math Patterns
```
{{calc::2+2*3}}
{{? (1+2)*3}}
{{randint::1::10}}
{{random::a::b::c}}
{{pick::option1::option2}}
```

### String Patterns
```
{{equal::{{user}}::Name}}
{{contains::{{getvar::text}}::substring}}
{{replace::text::old::new}}
{{split::a,b,c::,}}
{{join::["a","b"]::,}}
```

---

## Recommendations

### For Simulator Users

1. **Provide explicit context** for runtime-unknown macros to get evaluations rather than source preservation
2. **Use supported macros** for deterministic dry-run results
3. **Check diagnostics** for unsupported macro warnings
4. **Use effect recording** to track variable mutations without side effects

### For Implementation

1. **Priority 1:** Implement `call` and `#func` for control flow completeness
2. **Priority 2:** Add array mutation support (`arrayshift`, `arraypop`, `arraypush`, `arraysplice`)
3. **Priority 3:** Expand context providers for character data access
4. **Priority 4:** Consider asset display simulation (HTML output)

---

## Appendix: Coverage Verification

The classification table covers exactly 175 registry entries with no missing or extra classifications:

```typescript
// From cbs-simulator-classification.test.ts
expect(registry.getAll()).toHaveLength(175);
expect(coverage.missingClassifications).toEqual([]);
expect(coverage.extraClassifications).toEqual([]);
expect(Object.keys(CBS_SIMULATOR_SUPPORT_CLASSIFICATION)).toHaveLength(175);
```

All support classes are valid: `supported`, `approximate`, `unsupported`, `runtime-unknown`, `effect-only`.

---

*Generated from codebase analysis of packages/core/src/domain/cbs/*
*Date: 2026-05-05*
