---
source: generated
page-class: consolidated
artifact: char_🏝️가챠섬_v1.7
artifact-type: character
content-type: lua
generated-at: "2026-06-04T09:25:52.995Z"
generator: "risu-workbench/analyze/wiki@0.1.0"
lua-files: 41
lua-functions: 202
---

# Lua

41 files · 202 functions.

## Split roles

- `button_actions`: 1 file
- `common`: 2 files
- `domain`: 19 files
- `features`: 1 file
- `handler_helpers`: 5 files
- `host_globals`: 3 files
- `main`: 1 file
- `prompts`: 1 file
- `runtime`: 6 files
- `schema`: 1 file
- `state`: 1 file

## `lua/main.risulua`

- **role:** `main`

### `buildmergedpool`

- **writes state:** `cv_companionPoolCache`
- **calls:** `json_decode`, `json_encode`

### `pickrandomcompanion`

- **calls:** `buildmergedpool`

### `forgesetslothandler`

- **writes state:** `cv_forgeOpen`, `cv_forgeCategory`, `cv_forgeActiveSlot`

### `g`

- **calls:** `forgesetslothandler`

### `forgeclearcat`

- **writes state:** `cv_forgeOpen`, `cv_forgeCategory`, `cv_forgeActiveSlot`

### `forgeclearskill`

- **calls:** `forgeclearcat`

### `forgeclearrelic`

- **calls:** `forgeclearcat`

### `forgeclearfacility`

- **calls:** `forgeclearcat`

### `forgeapplycat`

- **writes state:** `cv_gachaPanelOpen`, `cv_forgeOpen`, `cv_forgeActiveSlot`
- **calls:** `parseslot`

### `parseslot`


### `forgeapplyskill`

- **calls:** `forgeapplycat`

### `forgeapplyrelic`

- **calls:** `forgeapplycat`

### `forgeapplyfacility`

- **calls:** `forgeapplycat`

### `gachacompanion`

- **writes state:** `cv_lastGachaPick`
- **calls:** `pickrandomcompanion`

### `rerollpickreplacement`

- **calls:** `buildmergedpool`

### `gachacompanionreroll`

- **writes state:** `cv_points`, `cv_skipNextRerollPoint`, `cv_panelStayOnce`
- **calls:** `rerollpickreplacement`

### `buildrandomgachafragment`

- **writes state:** `cv_lastGachaPick`
- **calls:** `pickrandomcompanion`

### `gacharandom`

- **calls:** `buildrandomgachafragment`

### `gacharandomall`

- **calls:** `buildrandomgachafragment`

### `g`

- **calls:** `forgesetslothandler`

### `g`

- **calls:** `forgesetslothandler`

### `g`

- **calls:** `forgesetslothandler`

### `oninput`


### `listenedit_editrequest_l795`


### `aux_discover_characters`

- **calls:** `parse_section`

### `parse_section`


### `aux_build_combined_prompt`


### `aux_generate_combined`

- **calls:** `aux_discover_characters`, `num`, `gv`, `aux_build_combined_prompt`, `json_decode`

### `gv`


### `num`


### `onoutput`


### `listenedit_editdisplay_l1312`


### `onbuttonclick`


## `lua/button_actions/actions.risulua`

- **role:** `button_actions`

### `explorewestforest`


### `exploreeastdesert`


### `exploresouthbeach`


### `explorenorthmountain`


### `mapgotosanctuary`


### `mapenterdungeon`

- **writes state:** `cv_dungeonActive`, `cv_dungeonGateState`, `cv_currentFloor`, `cv_gachaPanelOpen`

### `auxmodeon`

- **writes state:** `cv_auxMode`
- **calls:** `stayinguide`

### `auxmodeoff`

- **writes state:** `cv_auxMode`
- **calls:** `stayinguide`

### `basecharson`

- **writes state:** `cv_baseCharsOff`, `cv_companionPoolCache`
- **calls:** `stayinguide`

### `basecharsoff`

- **writes state:** `cv_baseCharsOff`, `cv_companionPoolCache`
- **calls:** `stayinguide`

### `gachacouple`

- **calls:** `markgachapanelstay`

### `gacharelic`

- **calls:** `markgachapanelstay`

### `gachafacility`

- **calls:** `markgachapanelstay`

### `gachaskill`

- **calls:** `markgachapanelstay`

### `gachasupply`

- **calls:** `markgachapanelstay`, `picksupplycats`

### `gachasupplytwice`

- **calls:** `markgachapanelstay`, `picksupplycats`

### `dungeonreturn`

- **writes state:** `cv_gachaPanelOpen`
- **calls:** `forceclosedungeon`

### `dungeonnextfloor`

- **writes state:** `cv_gachaPanelOpen`

### `sanctuaryreturn`

- **writes state:** `cv_gachaPanelOpen`
- **calls:** `forceclosedungeon`

### `sanctuaryrecharge`

- **writes state:** `cv_gachaPanelOpen`, `cv_sanctuaryConsumed`

### `vareditminusbig`

- **calls:** `vareditapplydeltabyunit`

### `vareditminusmed`

- **calls:** `vareditapplydeltabyunit`

### `vareditminussml`

- **calls:** `vareditapplydeltabyunit`

### `vareditplussml`

- **calls:** `vareditapplydeltabyunit`

### `vareditplusmed`

- **calls:** `vareditapplydeltabyunit`

### `vareditplusbig`

- **calls:** `vareditapplydeltabyunit`

### `vareditsetmax`

- **writes state:** `cv_debugOpen`, `cv_varEditOpen`, `cv_panelStayOnce`
- **calls:** `vareditmaxvalue`, `vareditwritevalue`

### `vareditsetmin`

- **writes state:** `cv_debugOpen`, `cv_varEditOpen`, `cv_panelStayOnce`
- **calls:** `vareditwritevalue`

### `debugshowdungeonchoice`

- **calls:** `stayindebug`, `giappendmarkertolastchar`

### `debugshowsanctuarychoice`

- **writes state:** `cv_sanctuarySpawnedFloor`, `cv_sanctuarySpawnedMsg`, `cv_sanctuaryConsumed`
- **calls:** `stayindebug`, `giappendmarkertolastchar`

### `debugfloorclearreward`

- **writes state:** `cv_floor`, `cv_currentMonsters`, `cv_monsterPanel`, `cv_pendingMonsterSpawn`, `cv_mazeEscapeCount`, `cv_mazeFailStreak`, `cv_totalRounds`, `cv_currentRound`
- **calls:** `stayindebug`, `buildroundpanel`, `giaddgachaticket`, `girefreshderivedui`, `girefreshlaststatuspanel`, `giappendmarkertolastchar`

### `debugforcedungeonreturn`

- **writes state:** `cv_hp`
- **calls:** `stayindebug`, `forceclosedungeon`, `giremovechoicemarkersfromlastchar`, `girefreshderivedui`, `girefreshlaststatuspanel`

## `lua/common/helpers.risulua`

- **role:** `common`

## `lua/common/local_helpers.risulua`

- **role:** `common`

### `capcat`


## `lua/domain/apply_starvation_hp_per_response.risulua`

- **role:** `domain`

### `impl_applystarvationhpperresponse`

- **writes state:** `cv_hp`

## `lua/domain/aux.risulua`

- **role:** `domain`

### `impl_aux_strip_thinking`


### `impl_aux_apply_patches`


## `lua/domain/base.risulua`

- **role:** `domain`

### `impl_eqextractbase`


## `lua/domain/companion.risulua`

- **role:** `domain`

### `impl_buildcompanionsgrid`


## `lua/domain/core.risulua`

- **role:** `domain`

## `lua/domain/dungeon.risulua`

- **role:** `domain`

### `impl_forceclosedungeon`


### `impl_dungeonfloorsetup`

- **writes state:** `cv_currentFloor`, `cv_sanctuarySpawnedFloor`, `cv_sanctuarySpawnedMsg`, `cv_sanctuaryConsumed`, `cv_nextFloorCondition`, `cv_activeFloorCondition`, `cv_prevDungeonType`, `cv_nextDungeonType`, `cv_activeDungeonType`, `cv_lastDungeonType`, `cv_pendingMonsterSpawn`
- **calls:** `rollroundsforfloor`, `spawnmonstersforround`, `buildroundpanel`, `buildmonsterpanel`

## `lua/domain/entry.risulua`

- **role:** `domain`

### `impl_eqparseentry`


## `lua/domain/eq_unequip.risulua`

- **role:** `domain`

### `impl_equnequip`


## `lua/domain/equip.risulua`

- **role:** `domain`

### `impl_eqequip`


### `impl_equiptogglebyidx`

- **writes state:** `cv_invOpen`, `cv_invCategory`
- **calls:** `equnequip`, `buildinvhtml`, `buildequippeddetails`

## `lua/domain/list.risulua`

- **role:** `domain`

### `impl_eqinlist`


### `impl_eqcountlist`


### `impl_eqaddtolist`


### `impl_eqremovefromlist`


## `lua/domain/monster.risulua`

- **role:** `domain`

### `impl_setmonstername`

- **writes state:** `cv_currentMonsters`

### `impl_applymonsterdamage`

- **writes state:** `cv_points`, `cv_currentMonsters`, `cv_monsterPanel`

## `lua/domain/number.risulua`

- **role:** `domain`

### `impl_vareditclamp`


### `impl_aux_number_lines`


## `lua/domain/recalc.risulua`

- **role:** `domain`

### `impl_eqrecalcslots`

- **writes state:** `cv_maxSkillSlots`, `cv_maxRelicSlots`

## `lua/domain/roll.risulua`

- **role:** `domain`

### `impl_rollcombatresult`

- **writes state:** `cv_combatResult`, `cv_combatRoll`, `cv_combatRate`, `cv_combatResultBasic`, `cv_combatResultUlti`

## `lua/domain/string.risulua`

- **role:** `domain`

### `impl_parseandapplysavestringv2`


## `lua/domain/strip.risulua`

- **role:** `domain`

### `impl_stripsystagsinbody`


### `impl_stripbottagsinsidecotblocks`


## `lua/domain/text.risulua`

- **role:** `domain`

### `impl_rerollsplitcsv`


### `impl_rerolljoincsv`


### `impl_placeholdername`


### `impl_eqsplitentries`


### `impl_vareditsplititems`


### `impl_gisplitdetails`


## `lua/domain/value.risulua`

- **role:** `domain`

### `impl_escapevalueforsave`


## `lua/domain/var.risulua`

- **role:** `domain`

### `impl_safegetvar`


### `impl_smartsetchatvar`


### `impl_refreshseed`

- **writes state:** `cv_seedCounter`

### `impl_rollfloorcondition`


### `impl_rollrandomgachatype`


### `impl_rollgachatier`


### `impl_closeallsidepanels`


### `impl_parseforgeentries`


### `impl_buildallforgepicklists`


### `impl_stayinguide`


### `impl_stayindebug`


### `impl_markgachapanelstay`

- **writes state:** `cv_lastCharMsgId`

### `impl_rerollparsepoints`


### `impl_rerollformatpoints`


### `impl_rerollfindlastcompanion`

- **calls:** `rerollsplitcsv`

### `impl_rerollreplacecompanion`

- **writes state:** `cv_companions`, `cv_companionsEng`, `cv_lastGachaPick`
- **calls:** `rerollsplitcsv`, `rerolljoincsv`

### `impl_closesidepanel`


### `impl_picksupplycats`


### `impl_rollroundsforfloor`

- **writes state:** `cv_mazeEscapeCount`, `cv_mazeFailStreak`, `cv_currentRound`, `cv_totalRounds`, `cv_roundEvents`, `cv_hungerDrainAppliedRound`
- **calls:** `pickrandomevent`

### `pickrandomevent`


### `impl_buildroundpanel`

- **writes state:** `cv_roundPanel`
- **calls:** `iconfor`

### `iconfor`


### `impl_floormultiplier`


### `impl_spawnmonstersforround`

- **writes state:** `cv_currentMonsters`
- **calls:** `placeholdername`

### `impl_buildmonsterpanel`

- **writes state:** `cv_monsterPanel`

### `impl_advanceround`

- **writes state:** `cv_mazeEscapeCount`, `cv_mazeFailStreak`, `cv_roundEvents`, `cv_currentRound`, `cv_totalRounds`, `cv_pendingMonsterSpawn`, `cv_points`

### `impl_eqstatparse`


### `impl_eqstatserialize`


### `impl_eqstatextractfromeffect`


### `impl_eqgetentrystat`

- **calls:** `eqsplitentries`, `eqparseentry`, `eqextractbase`

### `impl_equpdateentrystat`

- **calls:** `eqsplitentries`, `eqparseentry`, `eqextractbase`

### `impl_eqrecalcstats`

- **writes state:** `cv_hp`, `cv_mana`, `cv_hunger`
- **calls:** `eqsplitentries`, `eqparseentry`

### `impl_htmlescape`


### `impl_buildinvhtml`


### `impl_buildequippeddetails`


### `impl_vareditformatpoints`


### `impl_vareditreadvalue`


### `impl_vareditmaxvalue`


### `impl_vareditwritevalue`

- **calls:** `vareditclamp`

### `impl_vareditapplydelta`

- **writes state:** `cv_debugOpen`, `cv_varEditOpen`, `cv_panelStayOnce`

### `impl_vareditapplydeltabyunit`


### `impl_vareditselect`

- **writes state:** `cv_varEditTarget`, `cv_debugOpen`, `cv_varEditOpen`, `cv_panelStayOnce`

### `impl_vareditselectpoints`


### `impl_vareditselecthp`


### `impl_vareditselectmana`


### `impl_vareditselecthunger`


### `impl_vareditselectattack`


### `impl_vareditselectdefense`


### `impl_vareditselectluck`


### `impl_vareditremovedetailbyname`


### `impl_vareditdeleteitembyidx`

- **writes state:** `cv_items`, `cv_itemDetails`, `cv_debugOpen`, `cv_varEditOpen`, `cv_panelStayOnce`
- **calls:** `vareditsplititems`

### `impl_buildvaredithtml`

- **writes state:** `cv_varEditHtml`
- **calls:** `fmtunit`, `vareditsplititems`

### `impl_generatefallbacktip`

- **writes state:** `cv_lastFallbackTip`

### `impl_loadlateststatefromhistory`

- **calls:** `parseandapplysavestringv2`

### `impl_getsaveseedstore`

- **calls:** `json_decode`

### `impl_savesaveseedstore`

- **writes state:** `cv_saveSeedStore`
- **calls:** `json_encode`

### `impl_makesaveseed`


### `impl_remembersaveseedstate`


### `impl_collectreferencedsaveseeds`


### `impl_pruneunusedsaveseeds`


### `impl_collectsnapshotstatetable`


### `impl_generatesaveseedtag`

- **writes state:** `cv_saveSeedGcCounter`

### `impl_applysaveseedstate`


### `impl_appendsavetocurrentmessage`


### `impl_gifindlastcharmessage`


### `impl_gicleantip`


### `impl_gibuildstatuspanel`

- **calls:** `gv`, `num`

### `gv`


### `num`


### `impl_girefreshlaststatuspanel`


### `impl_giappendmarkertolastchar`


### `impl_giremovechoicemarkersfromlastchar`


### `impl_giaddgachaticket`

- **writes state:** `cv_items`, `cv_itemDetails`
- **calls:** `gisplitdetails`

### `impl_girefreshderivedui`


## `lua/features/core.risulua`

- **role:** `features`

## `lua/handler_helpers/button_click_helpers.risulua`

- **role:** `handler_helpers`

## `lua/handler_helpers/input_helpers.risulua`

- **role:** `handler_helpers`

## `lua/handler_helpers/listen_edit_helpers.risulua`

- **role:** `handler_helpers`

## `lua/handler_helpers/output_helpers.risulua`

- **role:** `handler_helpers`

### `parseinventory`


### `serializeinventory`


### `normalizeitemname`


### `splitentries`


### `extractbasename`


### `detailshasname`

- **calls:** `splitentries`, `extractbasename`

### `appenddetail`


### `removedetailbyname`

- **calls:** `splitentries`, `extractbasename`

### `syncstackableindetails`

- **calls:** `splitentries`, `extractbasename`

### `isplaceholder`


### `isplaceholder`


## `lua/handler_helpers/start_helpers.risulua`

- **role:** `handler_helpers`

## `lua/host_globals/async_actions.risulua`

- **role:** `host_globals`

## `lua/host_globals/duplicate_globals.risulua`

- **role:** `host_globals`

## `lua/host_globals/global_functions.risulua`

- **role:** `host_globals`

## `lua/prompts/instruction_store.risulua`

- **role:** `prompts`

## `lua/runtime/button_click.risulua`

- **role:** `runtime`

### `onbuttonclick`

- **calls:** `aux_generate_combined`

## `lua/runtime/input.risulua`

- **role:** `runtime`

### `oninput`

- **writes state:** `cv_gachaPanelOpen`, `cv_invOpen`, `cv_forgeOpen`, `cv_guideOpen`, `cv_forgeActiveSlot`, `cv_nextFloorCondition`, `cv_activeFloorCondition`, `cv_nextDungeonType`

## `lua/runtime/listen_edit.risulua`

- **role:** `runtime`

### `editrequest`

- **writes state:** `cv_pendingMonsterSpawn`
- **calls:** `safegetvar`, `spawnmonstersforround`

### `editdisplay`

- **calls:** `safegetvar`, `buildvaredithtml`

## `lua/runtime/listeners.risulua`

- **role:** `runtime`

## `lua/runtime/output.risulua`

- **role:** `runtime`

### `onoutput`

- **reads state:** `cv_hp`
- **writes state:** `cv_gachaPanelOpen`, `cv_lastCharMsgId`, `cv_hp`, `cv_maxHp`, `cv_mana`, `cv_maxMana`, `cv_hunger`, `cv_maxHunger`, `cv_day`, `cv_floor`, `cv_currentFloor`, `cv_points`, `cv_attack`, `cv_defense`, `cv_luck`, `cv_items`, `cv_itemDetails`, `cv_skills`, `cv_skillDetails`, `cv_relics`, `cv_relicDetails`, `cv_facilities`, `cv_facilityDetails`, `cv_companions`, `cv_companionsEng`, `cv_companionsGrid`, `cv_dungeonActive`, `cv_dungeonEnteredToday`, `cv_dungeonGateState`, `cv_combatResult`, `cv_combatRoll`, `cv_combatRate`, `cv_lastDayMsg`, `cv_lastCompanionMsg`, `cv_lastGachaPick`, `cv_nextFloorCondition`, `cv_activeFloorCondition`, `cv_nextDungeonType`, `cv_activeDungeonType`, `cv_lastDungeonType`, `cv_prevDungeonType`, `cv_sanctuarySpawnedFloor`, `cv_sanctuarySpawnedMsg`, `cv_sanctuaryConsumed`, `cv_currentRound`, `cv_totalRounds`, `cv_roundEvents`, `cv_roundPanel`, `cv_currentMonsters`, `cv_monsterPanel`, `cv_pendingMonsterSpawn`, `cv_mazeEscapeCount`, `cv_islandStage`, `cv_stage5MaxApplied`, `cv_gameOver`, `cv_invOpen`, `cv_invCategory`, `cv_forgeOpen`, `cv_forgeCategory`, `cv_forgeActiveSlot`, `cv_forgeSlotSkill1`, `cv_forgeSlotSkill2`, `cv_forgeSlotSkill3`, `cv_forgeSlotRelic1`, `cv_forgeSlotRelic2`, `cv_forgeSlotRelic3`, `cv_forgeSlotFacility1`, `cv_forgeSlotFacility2`, `cv_forgeSlotFacility3`, `cv_guideOpen`, `cv_auxMode`, `cv_equippedSkills`, `cv_equippedRelics`, `cv_maxSkillSlots`, `cv_maxRelicSlots`, `cv_attack_base`, `cv_defense_base`, `cv_luck_base`, `cv_maxHp_base`, `cv_maxMana_base`, `cv_maxHunger_base`, `cv_skillInvHtml`, `cv_relicInvHtml`, `cv_equippedSkillDetails`, `cv_equippedRelicDetails`, `cv_baseCharsOff`, `cv_skipNextRerollPoint`, `cv_gmAdminUsedRound`, `cv_darknessFortressUsedRound`, `cv_yorEvasionUsedRound`, `cv_hungerDrainAppliedRound`, `cv_mazeFailStreak`, `cv_companionsGridKey`, `cv_roundClearRejectCount`
- **calls:** `parseinventory`, `normalizeitemname`, `serializeinventory`, `detailshasname`, `appenddetail`, `removedetailbyname`, `syncstackableindetails`, `scancat`, `aux_generate_combined`, `isplaceholder`, `buildstatuspanelstr`

### `parseinventory`


### `serializeinventory`


### `normalizeitemname`


### `splitentries`


### `extractbasename`


### `detailshasname`

- **calls:** `splitentries`, `extractbasename`

### `appenddetail`


### `removedetailbyname`

- **calls:** `splitentries`, `extractbasename`

### `syncstackableindetails`

- **calls:** `splitentries`, `extractbasename`

### `scancat`


### `isplaceholder`


### `buildstatuspanelstr`

- **calls:** `gv`, `num`

### `gv`


### `num`


### `isplaceholder`


## `lua/runtime/start.risulua`

- **role:** `runtime`

## `lua/schema/constants.risulua`

- **role:** `schema`

## `lua/state/variable_store.risulua`

- **role:** `state`

## Notes

See [`../notes/lua.md`](../notes/lua.md) _(optional)_.
