---
source: generated
page-class: consolidated
artifact: char_🏝️가챠섬_v1.7
artifact-type: character
content-type: variables
generated-at: "2026-06-04T09:25:52.995Z"
generator: "risu-workbench/analyze/wiki@0.1.0"
total-vars: 117
default-vars: 23
---

# Variables

117 total · 23 with defaults · 94 dynamic.

## Registry

| Name | Default | Readers | Writers | Chain |
|---|---|---|---|---|
| `cv_auxMode` | `` | lorebook: 🌎_세계관_&_시스템/AUX_모드_—_img_+_STATUS_TIP_금지_(기본_ON,_cv_auxMode=0_시만_OFF), lorebook: 🌎_세계관_&_시스템/시스템_나레이션_&_조언_사용_가이드, regex: AUX_ON_시_history의_img_태그_strip_(mimicry_차단_—_v2.1_§5.6_§9.8)._AUX_OFF_시_last-5_메시지만_유지, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/runtime/output | [cv_auxMode](chains/variable-flow/cv_auxMode.md) |
| `cv_companions` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치, lorebook: 🎰_가챠_종류/동료_소환, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/var, lua: lua/runtime/output | [cv_companions](chains/variable-flow/cv_companions.md) |
| `cv_dungeonGateState` | `` | lorebook: 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙, lorebook: 🌎_세계관_&_시스템/현재_주요_수치, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/runtime/output | [cv_dungeonGateState](chains/variable-flow/cv_dungeonGateState.md) |
| `cv_facilityDetails` | `` | lorebook: 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_facilityDetails](chains/variable-flow/cv_facilityDetails.md) |
| `cv_itemDetails` | `` | lorebook: 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/var, lua: lua/runtime/output | [cv_itemDetails](chains/variable-flow/cv_itemDetails.md) |
| `cv_points` | `` | lorebook: 🌎_세계관_&_시스템/가챠_규칙, lorebook: 🌎_세계관_&_시스템/현재_주요_수치, regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/monster, lua: lua/domain/var, lua: lua/main, lua: lua/runtime/output | [cv_points](chains/variable-flow/cv_points.md) |
| `cv_activeFloorCondition` | `` | lorebook: 🌎_세계관_&_시스템/던전_서사형_GM_가이드, lorebook: 🌎_세계관_&_시스템/층_컨디션_시스템 | lua: lua/domain/dungeon, lua: lua/runtime/input, lua: lua/runtime/output | [cv_activeFloorCondition](chains/variable-flow/cv_activeFloorCondition.md) |
| `cv_baseCharsOff` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/runtime/output | [cv_baseCharsOff](chains/variable-flow/cv_baseCharsOff.md) |
| `cv_companionsGrid` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_companionsGrid](chains/variable-flow/cv_companionsGrid.md) |
| `cv_currentFloor` | `` | lorebook: 🌎_세계관_&_시스템/던전 | lua: lua/button_actions/actions, lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_currentFloor](chains/variable-flow/cv_currentFloor.md) |
| `cv_day` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_day](chains/variable-flow/cv_day.md) |
| `cv_debugOpen` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/domain/var | [cv_debugOpen](chains/variable-flow/cv_debugOpen.md) |
| `cv_dungeonActive` | `` | lorebook: 🌎_세계관_&_시스템/Stat_System_(ATK_DEF_LUCK), lorebook: 🌎_세계관_&_시스템/던전_서사형_GM_가이드, lorebook: 🌎_세계관_&_시스템/변수_&_액티브_활용_가이드, lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/button_actions/actions, lua: lua/runtime/output | [cv_dungeonActive](chains/variable-flow/cv_dungeonActive.md) |
| `cv_dungeonEnteredToday` | `` | lorebook: 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙 | lua: lua/runtime/output | [cv_dungeonEnteredToday](chains/variable-flow/cv_dungeonEnteredToday.md) |
| `cv_equippedRelicDetails` | `` | lorebook: 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명, lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_equippedRelicDetails](chains/variable-flow/cv_equippedRelicDetails.md) |
| `cv_equippedRelics` | `` | lorebook: 🌎_세계관_&_시스템/마나_시스템_규칙, lorebook: 🌎_세계관_&_시스템/현재_주요_수치, lorebook: 🎰_가챠_종류/시설_건설 | lua: lua/runtime/output | [cv_equippedRelics](chains/variable-flow/cv_equippedRelics.md) |
| `cv_equippedSkillDetails` | `` | lorebook: 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명, lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_equippedSkillDetails](chains/variable-flow/cv_equippedSkillDetails.md) |
| `cv_equippedSkills` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_equippedSkills](chains/variable-flow/cv_equippedSkills.md) |
| `cv_facilities` | `` | lorebook: 🌎_세계관_&_시스템/마나_시스템_규칙, lorebook: 🌎_세계관_&_시스템/섬_환경, lorebook: 🌎_세계관_&_시스템/현재_주요_수치, lorebook: 🎰_가챠_종류/시설_건설 | lua: lua/runtime/output | [cv_facilities](chains/variable-flow/cv_facilities.md) |
| `cv_floor` | `` | lorebook: 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙 | lua: lua/button_actions/actions, lua: lua/runtime/output | [cv_floor](chains/variable-flow/cv_floor.md) |
| `cv_forgeActiveSlot` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/main, lua: lua/runtime/input, lua: lua/runtime/output | [cv_forgeActiveSlot](chains/variable-flow/cv_forgeActiveSlot.md) |
| `cv_forgeCategory` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/main, lua: lua/runtime/output | [cv_forgeCategory](chains/variable-flow/cv_forgeCategory.md) |
| `cv_forgeOpen` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/main, lua: lua/runtime/input, lua: lua/runtime/output | [cv_forgeOpen](chains/variable-flow/cv_forgeOpen.md) |
| `cv_forgeSlotFacility1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotFacility1](chains/variable-flow/cv_forgeSlotFacility1.md) |
| `cv_forgeSlotFacility2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotFacility2](chains/variable-flow/cv_forgeSlotFacility2.md) |
| `cv_forgeSlotFacility3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotFacility3](chains/variable-flow/cv_forgeSlotFacility3.md) |
| `cv_forgeSlotRelic1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotRelic1](chains/variable-flow/cv_forgeSlotRelic1.md) |
| `cv_forgeSlotRelic2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotRelic2](chains/variable-flow/cv_forgeSlotRelic2.md) |
| `cv_forgeSlotRelic3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotRelic3](chains/variable-flow/cv_forgeSlotRelic3.md) |
| `cv_forgeSlotSkill1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotSkill1](chains/variable-flow/cv_forgeSlotSkill1.md) |
| `cv_forgeSlotSkill2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotSkill2](chains/variable-flow/cv_forgeSlotSkill2.md) |
| `cv_forgeSlotSkill3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_forgeSlotSkill3](chains/variable-flow/cv_forgeSlotSkill3.md) |
| `cv_gachaPanelOpen` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/main, lua: lua/runtime/input, lua: lua/runtime/output | [cv_gachaPanelOpen](chains/variable-flow/cv_gachaPanelOpen.md) |
| `cv_gameOver` | `` | - | lorebook: 🌎_세계관_&_시스템/GAME_OVER_규칙, lua: lua/runtime/output | [cv_gameOver](chains/variable-flow/cv_gameOver.md) |
| `cv_guideOpen` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/input, lua: lua/runtime/output | [cv_guideOpen](chains/variable-flow/cv_guideOpen.md) |
| `cv_hp` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치, lua: lua/runtime/output | lua: lua/button_actions/actions, lua: lua/domain/apply_starvation_hp_per_response, lua: lua/domain/var, lua: lua/runtime/output | [cv_hp](chains/variable-flow/cv_hp.md) |
| `cv_hunger` | `` | lorebook: 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙, lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/domain/var, lua: lua/runtime/output | [cv_hunger](chains/variable-flow/cv_hunger.md) |
| `cv_invCategory` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/equip, lua: lua/runtime/output | [cv_invCategory](chains/variable-flow/cv_invCategory.md) |
| `cv_invOpen` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/equip, lua: lua/runtime/input, lua: lua/runtime/output | [cv_invOpen](chains/variable-flow/cv_invOpen.md) |
| `cv_islandStage` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_islandStage](chains/variable-flow/cv_islandStage.md) |
| `cv_items` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/domain/var, lua: lua/runtime/output | [cv_items](chains/variable-flow/cv_items.md) |
| `cv_lastCharMsgId` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/var, lua: lua/runtime/output | [cv_lastCharMsgId](chains/variable-flow/cv_lastCharMsgId.md) |
| `cv_mana` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/domain/var, lua: lua/runtime/output | [cv_mana](chains/variable-flow/cv_mana.md) |
| `cv_maxHp` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_maxHp](chains/variable-flow/cv_maxHp.md) |
| `cv_maxHunger` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_maxHunger](chains/variable-flow/cv_maxHunger.md) |
| `cv_maxMana` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | lua: lua/runtime/output | [cv_maxMana](chains/variable-flow/cv_maxMana.md) |
| `cv_monsterPanel` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/button_actions/actions, lua: lua/domain/monster, lua: lua/domain/var, lua: lua/runtime/output | [cv_monsterPanel](chains/variable-flow/cv_monsterPanel.md) |
| `cv_nextDungeonType` | `` | lorebook: 🌎_세계관_&_시스템/던전 | lua: lua/domain/dungeon, lua: lua/runtime/input, lua: lua/runtime/output | [cv_nextDungeonType](chains/variable-flow/cv_nextDungeonType.md) |
| `cv_relicInvHtml` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_relicInvHtml](chains/variable-flow/cv_relicInvHtml.md) |
| `cv_roundPanel` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/var, lua: lua/runtime/output | [cv_roundPanel](chains/variable-flow/cv_roundPanel.md) |
| `cv_sanctuarySpawnedFloor` | `` | lorebook: 🌎_세계관_&_시스템/던전 | lua: lua/button_actions/actions, lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_sanctuarySpawnedFloor](chains/variable-flow/cv_sanctuarySpawnedFloor.md) |
| `cv_skillInvHtml` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/runtime/output | [cv_skillInvHtml](chains/variable-flow/cv_skillInvHtml.md) |
| `cv_skills` | `` | lorebook: 🎰_가챠_종류/스킬_습득 | lua: lua/runtime/output | [cv_skills](chains/variable-flow/cv_skills.md) |
| `cv_varEditHtml` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | lua: lua/domain/var | [cv_varEditHtml](chains/variable-flow/cv_varEditHtml.md) |
| `...` | `` | lorebook: 🌎_세계관_&_시스템/가챠_규칙, lorebook: 🌎_세계관_&_시스템/변수_&_액티브_활용_가이드 | - | [...](chains/variable-flow/....md) |
| `cv_*` | `` | lorebook: 🌎_세계관_&_시스템/현재_주요_수치 | - | [cv_*](chains/variable-flow/cv_*.md) |
| `cv_activeDungeonType` | `` | - | lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_activeDungeonType](chains/variable-flow/cv_activeDungeonType.md) |
| `cv_attack` | `` | - | lua: lua/runtime/output | [cv_attack](chains/variable-flow/cv_attack.md) |
| `cv_attack_base` | `` | - | lua: lua/runtime/output | [cv_attack_base](chains/variable-flow/cv_attack_base.md) |
| `cv_combatRate` | `` | - | lua: lua/domain/roll, lua: lua/runtime/output | [cv_combatRate](chains/variable-flow/cv_combatRate.md) |
| `cv_combatResult` | `` | - | lua: lua/domain/roll, lua: lua/runtime/output | [cv_combatResult](chains/variable-flow/cv_combatResult.md) |
| `cv_combatResultBasic` | `` | - | lua: lua/domain/roll | [cv_combatResultBasic](chains/variable-flow/cv_combatResultBasic.md) |
| `cv_combatResultUlti` | `` | - | lua: lua/domain/roll | [cv_combatResultUlti](chains/variable-flow/cv_combatResultUlti.md) |
| `cv_combatRoll` | `` | - | lua: lua/domain/roll, lua: lua/runtime/output | [cv_combatRoll](chains/variable-flow/cv_combatRoll.md) |
| `cv_companionPoolCache` | `` | - | lua: lua/button_actions/actions, lua: lua/main | [cv_companionPoolCache](chains/variable-flow/cv_companionPoolCache.md) |
| `cv_companionsEng` | `` | - | lua: lua/domain/var, lua: lua/runtime/output | [cv_companionsEng](chains/variable-flow/cv_companionsEng.md) |
| `cv_companionsGridKey` | `` | - | lua: lua/runtime/output | [cv_companionsGridKey](chains/variable-flow/cv_companionsGridKey.md) |
| `cv_currentMonsters` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/monster, lua: lua/domain/var, lua: lua/runtime/output | [cv_currentMonsters](chains/variable-flow/cv_currentMonsters.md) |
| `cv_currentRound` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var, lua: lua/runtime/output | [cv_currentRound](chains/variable-flow/cv_currentRound.md) |
| `cv_darknessFortressUsedRound` | `` | - | lua: lua/runtime/output | [cv_darknessFortressUsedRound](chains/variable-flow/cv_darknessFortressUsedRound.md) |
| `cv_defense` | `` | - | lua: lua/runtime/output | [cv_defense](chains/variable-flow/cv_defense.md) |
| `cv_defense_base` | `` | - | lua: lua/runtime/output | [cv_defense_base](chains/variable-flow/cv_defense_base.md) |
| `cv_forgePickListFacility1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListFacility1](chains/variable-flow/cv_forgePickListFacility1.md) |
| `cv_forgePickListFacility2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListFacility2](chains/variable-flow/cv_forgePickListFacility2.md) |
| `cv_forgePickListFacility3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListFacility3](chains/variable-flow/cv_forgePickListFacility3.md) |
| `cv_forgePickListRelic1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListRelic1](chains/variable-flow/cv_forgePickListRelic1.md) |
| `cv_forgePickListRelic2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListRelic2](chains/variable-flow/cv_forgePickListRelic2.md) |
| `cv_forgePickListRelic3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListRelic3](chains/variable-flow/cv_forgePickListRelic3.md) |
| `cv_forgePickListSkill1` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListSkill1](chains/variable-flow/cv_forgePickListSkill1.md) |
| `cv_forgePickListSkill2` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListSkill2](chains/variable-flow/cv_forgePickListSkill2.md) |
| `cv_forgePickListSkill3` | `` | regex: 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | - | [cv_forgePickListSkill3](chains/variable-flow/cv_forgePickListSkill3.md) |
| `cv_gmAdminUsedRound` | `` | - | lua: lua/runtime/output | [cv_gmAdminUsedRound](chains/variable-flow/cv_gmAdminUsedRound.md) |
| `cv_hungerDrainAppliedRound` | `` | - | lua: lua/domain/var, lua: lua/runtime/output | [cv_hungerDrainAppliedRound](chains/variable-flow/cv_hungerDrainAppliedRound.md) |
| `cv_lastCompanionMsg` | `` | - | lua: lua/runtime/output | [cv_lastCompanionMsg](chains/variable-flow/cv_lastCompanionMsg.md) |
| `cv_lastDayMsg` | `` | - | lua: lua/runtime/output | [cv_lastDayMsg](chains/variable-flow/cv_lastDayMsg.md) |
| `cv_lastDungeonType` | `` | - | lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_lastDungeonType](chains/variable-flow/cv_lastDungeonType.md) |
| `cv_lastFallbackTip` | `` | - | lua: lua/domain/var | [cv_lastFallbackTip](chains/variable-flow/cv_lastFallbackTip.md) |
| `cv_lastGachaPick` | `` | - | lua: lua/domain/var, lua: lua/main, lua: lua/runtime/output | [cv_lastGachaPick](chains/variable-flow/cv_lastGachaPick.md) |
| `cv_luck` | `` | - | lua: lua/runtime/output | [cv_luck](chains/variable-flow/cv_luck.md) |
| `cv_luck_base` | `` | - | lua: lua/runtime/output | [cv_luck_base](chains/variable-flow/cv_luck_base.md) |
| `cv_maxHp_base` | `` | - | lua: lua/runtime/output | [cv_maxHp_base](chains/variable-flow/cv_maxHp_base.md) |
| `cv_maxHunger_base` | `` | - | lua: lua/runtime/output | [cv_maxHunger_base](chains/variable-flow/cv_maxHunger_base.md) |
| `cv_maxMana_base` | `` | - | lua: lua/runtime/output | [cv_maxMana_base](chains/variable-flow/cv_maxMana_base.md) |
| `cv_maxRelicSlots` | `` | - | lua: lua/domain/recalc, lua: lua/runtime/output | [cv_maxRelicSlots](chains/variable-flow/cv_maxRelicSlots.md) |
| `cv_maxSkillSlots` | `` | - | lua: lua/domain/recalc, lua: lua/runtime/output | [cv_maxSkillSlots](chains/variable-flow/cv_maxSkillSlots.md) |
| `cv_mazeEscapeCount` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var, lua: lua/runtime/output | [cv_mazeEscapeCount](chains/variable-flow/cv_mazeEscapeCount.md) |
| `cv_mazeFailStreak` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var, lua: lua/runtime/output | [cv_mazeFailStreak](chains/variable-flow/cv_mazeFailStreak.md) |
| `cv_nextFloorCondition` | `` | - | lua: lua/domain/dungeon, lua: lua/runtime/input, lua: lua/runtime/output | [cv_nextFloorCondition](chains/variable-flow/cv_nextFloorCondition.md) |
| `cv_panelStayOnce` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var, lua: lua/main | [cv_panelStayOnce](chains/variable-flow/cv_panelStayOnce.md) |
| `cv_pendingMonsterSpawn` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/dungeon, lua: lua/domain/var, lua: lua/runtime/listen_edit, lua: lua/runtime/output | [cv_pendingMonsterSpawn](chains/variable-flow/cv_pendingMonsterSpawn.md) |
| `cv_prevDungeonType` | `` | - | lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_prevDungeonType](chains/variable-flow/cv_prevDungeonType.md) |
| `cv_relicDetails` | `` | - | lua: lua/runtime/output | [cv_relicDetails](chains/variable-flow/cv_relicDetails.md) |
| `cv_relics` | `` | - | lua: lua/runtime/output | [cv_relics](chains/variable-flow/cv_relics.md) |
| `cv_roundClearRejectCount` | `` | - | lua: lua/runtime/output | [cv_roundClearRejectCount](chains/variable-flow/cv_roundClearRejectCount.md) |
| `cv_roundEvents` | `` | - | lua: lua/domain/var, lua: lua/runtime/output | [cv_roundEvents](chains/variable-flow/cv_roundEvents.md) |
| `cv_sanctuaryConsumed` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_sanctuaryConsumed](chains/variable-flow/cv_sanctuaryConsumed.md) |
| `cv_sanctuarySpawnedMsg` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/dungeon, lua: lua/runtime/output | [cv_sanctuarySpawnedMsg](chains/variable-flow/cv_sanctuarySpawnedMsg.md) |
| `cv_saveSeedGcCounter` | `` | - | lua: lua/domain/var | [cv_saveSeedGcCounter](chains/variable-flow/cv_saveSeedGcCounter.md) |
| `cv_saveSeedStore` | `` | - | lua: lua/domain/var | [cv_saveSeedStore](chains/variable-flow/cv_saveSeedStore.md) |
| `cv_seedCounter` | `` | - | lua: lua/domain/var | [cv_seedCounter](chains/variable-flow/cv_seedCounter.md) |
| `cv_skillDetails` | `` | - | lua: lua/runtime/output | [cv_skillDetails](chains/variable-flow/cv_skillDetails.md) |
| `cv_skipNextRerollPoint` | `` | - | lua: lua/main, lua: lua/runtime/output | [cv_skipNextRerollPoint](chains/variable-flow/cv_skipNextRerollPoint.md) |
| `cv_stage5MaxApplied` | `` | - | lua: lua/runtime/output | [cv_stage5MaxApplied](chains/variable-flow/cv_stage5MaxApplied.md) |
| `cv_totalRounds` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var, lua: lua/runtime/output | [cv_totalRounds](chains/variable-flow/cv_totalRounds.md) |
| `cv_varEditOpen` | `` | - | lua: lua/button_actions/actions, lua: lua/domain/var | [cv_varEditOpen](chains/variable-flow/cv_varEditOpen.md) |
| `cv_varEditTarget` | `` | - | lua: lua/domain/var | [cv_varEditTarget](chains/variable-flow/cv_varEditTarget.md) |
| `cv_yorEvasionUsedRound` | `` | - | lua: lua/runtime/output | [cv_yorEvasionUsedRound](chains/variable-flow/cv_yorEvasionUsedRound.md) |

## Defaults

```json
{
  "{": "",
  "  \"cv_hp\": \"100\",": "",
  "  \"cv_maxHp\": \"100\",": "",
  "  \"cv_mana\": \"100\",": "",
  "  \"cv_maxMana\": \"100\",": "",
  "  \"cv_hunger\": \"100\",": "",
  "  \"cv_maxHunger\": \"100\",": "",
  "  \"cv_day\": \"1\",": "",
  "  \"cv_points\": \"5,000\",": "",
  "  \"cv_floor\": \"0\",": "",
  "  \"cv_currentFloor\": \"0\",": "",
  "  \"cv_items\": \"None\",": "",
  "  \"cv_itemDetails\": \"None\",": "",
  "  \"cv_skills\": \"None\",": "",
  "  \"cv_skillDetails\": \"None\",": "",
  "  \"cv_relics\": \"None\",": "",
  "  \"cv_relicDetails\": \"None\",": "",
  "  \"cv_facilities\": \"None\",": "",
  "  \"cv_facilityDetails\": \"None\",": "",
  "  \"cv_companions\": \"None\",": "",
  "  \"cv_dungeonEnteredToday\": \"false\",": "",
  "  \"cv_lastCompanionMsg\": \"-1\"": "",
  "}": ""
}
```

## Notes

See [`../notes/variables.md`](../notes/variables.md) _(optional)_.
