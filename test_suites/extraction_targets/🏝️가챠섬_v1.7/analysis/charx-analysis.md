# 가챠섬 (Gacha Island) — 캐릭터 카드 분석

> RisuAI 캐릭터 카드 구조의 자동 생성 종합 분석.

## 카드 정보
| 지표 | 값 |
|--------|-------|
| 카드 이름 | 가챠섬 (Gacha Island) |
| 스펙 버전 | chara_card_v3 |
| 로어북 항목 | 107 |
| 정규식 스크립트 | 2 |
| Lua 파일 | 41 |
| HTML 존재 | 예 |
| 변수 수 | 117 |


---

## 통합 CBS 변수 그래프

> ⚠️ 117개 변수 중 80개 표시

| 변수 | 요소 | 방향 | 기본값 | 쓰기 | 읽기 |
|----------|----------|-----------|---------------|---------|---------|
| cv_auxMode | 3 | bridged | — | lua | lorebook, regex |
| cv_companions | 3 | bridged | — | lua | lorebook, regex |
| cv_dungeonGateState | 3 | bridged | — | lua | lorebook, regex |
| cv_facilityDetails | 3 | bridged | — | lua | lorebook, regex |
| cv_itemDetails | 3 | bridged | — | lua | lorebook, regex |
| cv_points | 3 | bridged | — | lua | lorebook, regex |
| cv_activeFloorCondition | 2 | bridged | — | lua | lorebook |
| cv_baseCharsOff | 2 | bridged | — | lua | regex |
| cv_companionsGrid | 2 | bridged | — | lua | regex |
| cv_currentFloor | 2 | bridged | — | lua | lorebook |
| cv_day | 2 | bridged | — | lua | lorebook |
| cv_debugOpen | 2 | bridged | — | lua | regex |
| cv_dungeonActive | 2 | bridged | — | lua | lorebook |
| cv_dungeonEnteredToday | 2 | bridged | — | lua | lorebook |
| cv_equippedRelicDetails | 2 | bridged | — | lua | lorebook |
| cv_equippedRelics | 2 | bridged | — | lua | lorebook |
| cv_equippedSkillDetails | 2 | bridged | — | lua | lorebook |
| cv_equippedSkills | 2 | bridged | — | lua | lorebook |
| cv_facilities | 2 | bridged | — | lua | lorebook |
| cv_floor | 2 | bridged | — | lua | lorebook |
| cv_forgeActiveSlot | 2 | bridged | — | lua | regex |
| cv_forgeCategory | 2 | bridged | — | lua | regex |
| cv_forgeOpen | 2 | bridged | — | lua | regex |
| cv_forgeSlotFacility1 | 2 | bridged | — | lua | regex |
| cv_forgeSlotFacility2 | 2 | bridged | — | lua | regex |
| cv_forgeSlotFacility3 | 2 | bridged | — | lua | regex |
| cv_forgeSlotRelic1 | 2 | bridged | — | lua | regex |
| cv_forgeSlotRelic2 | 2 | bridged | — | lua | regex |
| cv_forgeSlotRelic3 | 2 | bridged | — | lua | regex |
| cv_forgeSlotSkill1 | 2 | bridged | — | lua | regex |
| cv_forgeSlotSkill2 | 2 | bridged | — | lua | regex |
| cv_forgeSlotSkill3 | 2 | bridged | — | lua | regex |
| cv_gachaPanelOpen | 2 | bridged | — | lua | regex |
| cv_gameOver | 2 | bridged | — | lorebook, lua | — |
| cv_guideOpen | 2 | bridged | — | lua | regex |
| cv_hp | 2 | bridged | — | lua | lorebook, lua |
| cv_hunger | 2 | bridged | — | lua | lorebook |
| cv_invCategory | 2 | bridged | — | lua | regex |
| cv_invOpen | 2 | bridged | — | lua | regex |
| cv_islandStage | 2 | bridged | — | lua | regex |
| cv_items | 2 | bridged | — | lua | lorebook |
| cv_lastCharMsgId | 2 | bridged | — | lua | regex |
| cv_mana | 2 | bridged | — | lua | lorebook |
| cv_maxHp | 2 | bridged | — | lua | lorebook |
| cv_maxHunger | 2 | bridged | — | lua | lorebook |
| cv_maxMana | 2 | bridged | — | lua | lorebook |
| cv_monsterPanel | 2 | bridged | — | lua | regex |
| cv_nextDungeonType | 2 | bridged | — | lua | lorebook |
| cv_relicInvHtml | 2 | bridged | — | lua | regex |
| cv_roundPanel | 2 | bridged | — | lua | regex |
| cv_sanctuarySpawnedFloor | 2 | bridged | — | lua | lorebook |
| cv_skillInvHtml | 2 | bridged | — | lua | regex |
| cv_skills | 2 | bridged | — | lua | lorebook |
| cv_varEditHtml | 2 | bridged | — | lua | regex |
| ... | 1 | isolated | — | — | lorebook |
| cv_* | 1 | isolated | — | — | lorebook |
| cv_activeDungeonType | 1 | isolated | — | lua | — |
| cv_attack | 1 | isolated | — | lua | — |
| cv_attack_base | 1 | isolated | — | lua | — |
| cv_combatRate | 1 | isolated | — | lua | — |
| cv_combatResult | 1 | isolated | — | lua | — |
| cv_combatResultBasic | 1 | isolated | — | lua | — |
| cv_combatResultUlti | 1 | isolated | — | lua | — |
| cv_combatRoll | 1 | isolated | — | lua | — |
| cv_companionPoolCache | 1 | isolated | — | lua | — |
| cv_companionsEng | 1 | isolated | — | lua | — |
| cv_companionsGridKey | 1 | isolated | — | lua | — |
| cv_currentMonsters | 1 | isolated | — | lua | — |
| cv_currentRound | 1 | isolated | — | lua | — |
| cv_darknessFortressUsedRound | 1 | isolated | — | lua | — |
| cv_defense | 1 | isolated | — | lua | — |
| cv_defense_base | 1 | isolated | — | lua | — |
| cv_forgePickListFacility1 | 1 | isolated | — | — | regex |
| cv_forgePickListFacility2 | 1 | isolated | — | — | regex |
| cv_forgePickListFacility3 | 1 | isolated | — | — | regex |
| cv_forgePickListRelic1 | 1 | isolated | — | — | regex |
| cv_forgePickListRelic2 | 1 | isolated | — | — | regex |
| cv_forgePickListRelic3 | 1 | isolated | — | — | regex |
| cv_forgePickListSkill1 | 1 | isolated | — | — | regex |
| cv_forgePickListSkill2 | 1 | isolated | — | — | regex |


---

## 교차 요소 요약

| 요소 쌍 | 공유 변수 |
|--------------|------------------|
| lua↔regex | 32 |
| lorebook↔lua | 28 |
| lorebook↔regex | 6 |


---

## 로어북 ↔ 정규식 상관관계

### 공유 변수

| 변수 | 방향 | 로어북 항목 | 정규식 스크립트 |
|----------|-----------|------------------|---------------|
| cv_auxMode | bidirectional | 🌎_세계관_&_시스템/시스템_나레이션_&_조언_사용_가이드, 🌎_세계관_&_시스템/AUX_모드_—_img_+_STATUS_TIP_금지_(기본_ON,_cv_auxMode=0_시만_OFF) | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널, AUX_ON_시_history의_img_태그_strip_(mimicry_차단_—_v2.1_§5.6_§9.8)._AUX_OFF_시_last-5_메시지만_유지 |
| cv_dungeonGateState | bidirectional | 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙, 🌎_세계관_&_시스템/현재_주요_수치 | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| cv_points | bidirectional | 🌎_세계관_&_시스템/가챠_규칙, 🌎_세계관_&_시스템/현재_주요_수치 | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| cv_companions | bidirectional | 🌎_세계관_&_시스템/현재_주요_수치, 🎰_가챠_종류/동료_소환 | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| cv_itemDetails | bidirectional | 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| cv_facilityDetails | bidirectional | 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |

### 로어북 전용 변수

- `cv_nextDungeonType`
- `cv_currentFloor`
- `cv_sanctuarySpawnedFloor`
- `cv_dungeonActive`
- `cv_activeFloorCondition`
- `cv_equippedRelics`
- `cv_facilities`
- `cv_floor`
- `cv_dungeonEnteredToday`
- `cv_hunger`
- `...`
- `cv_hp`
- `cv_maxHp`
- `cv_mana`
- `cv_maxMana`
- `cv_maxHunger`
- `cv_day`
- `cv_items`
- `cv_equippedSkills`
- `cv_equippedSkillDetails`
- `cv_equippedRelicDetails`
- `cv_*`
- `cv_skills`
- `cv_gameOver`

### 정규식 전용 변수

- `cv_roundPanel`
- `cv_monsterPanel`
- `cv_islandStage`
- `cv_lastCharMsgId`
- `cv_invOpen`
- `cv_gachaPanelOpen`
- `cv_forgeOpen`
- `cv_guideOpen`
- `cv_debugOpen`
- `cv_invCategory`
- `cv_skillInvHtml`
- `cv_relicInvHtml`
- `cv_companionsGrid`
- `cv_forgeCategory`
- `cv_forgeActiveSlot`
- `cv_forgeSlotSkill1`
- `cv_forgeSlotSkill2`
- `cv_forgeSlotSkill3`
- `cv_forgeSlotRelic1`
- `cv_forgeSlotRelic2`
- `cv_forgeSlotRelic3`
- `cv_forgeSlotFacility1`
- `cv_forgeSlotFacility2`
- `cv_forgeSlotFacility3`
- `cv_forgePickListSkill1`
- `cv_forgePickListSkill2`
- `cv_forgePickListSkill3`
- `cv_forgePickListRelic1`
- `cv_forgePickListRelic2`
- `cv_forgePickListRelic3`
- `cv_forgePickListFacility1`
- `cv_forgePickListFacility2`
- `cv_forgePickListFacility3`
- `cv_baseCharsOff`
- `cv_varEditHtml`


---

## 로어북 ↔ Lua 상관관계

| 변수 | 방향 | 로어북 항목 | Lua 파일 |
|----------|-----------|------------------|---------------|
| `cv_gameOver` | bidirectional | 🌎_세계관_&_시스템/GAME_OVER_규칙 | lua/runtime/output |
| `cv_hp` | bidirectional | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output, lua/button_actions/actions, lua/domain/apply_starvation_hp_per_response, lua/domain/var |
| `cv_auxMode` | lua->lorebook | 🌎_세계관_&_시스템/시스템_나레이션_&_조언_사용_가이드, 🌎_세계관_&_시스템/AUX_모드_—_img_+_STATUS_TIP_금지_(기본_ON,_cv_auxMode=0_시만_OFF) | lua/button_actions/actions, lua/runtime/output |
| `cv_companions` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치, 🎰_가챠_종류/동료_소환 | lua/domain/var, lua/runtime/output |
| `cv_dungeonGateState` | lua->lorebook | 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙, 🌎_세계관_&_시스템/현재_주요_수치 | lua/button_actions/actions, lua/runtime/output |
| `cv_facilityDetails` | lua->lorebook | 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | lua/runtime/output |
| `cv_itemDetails` | lua->lorebook | 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | lua/domain/var, lua/runtime/output |
| `cv_points` | lua->lorebook | 🌎_세계관_&_시스템/가챠_규칙, 🌎_세계관_&_시스템/현재_주요_수치 | lua/main, lua/domain/monster, lua/domain/var, lua/runtime/output |
| `cv_activeFloorCondition` | lua->lorebook | 🌎_세계관_&_시스템/던전_서사형_GM_가이드, 🌎_세계관_&_시스템/층_컨디션_시스템 | lua/domain/dungeon, lua/runtime/input, lua/runtime/output |
| `cv_currentFloor` | lua->lorebook | 🌎_세계관_&_시스템/던전 | lua/button_actions/actions, lua/domain/dungeon, lua/runtime/output |
| `cv_day` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output |
| `cv_dungeonActive` | lua->lorebook | 🌎_세계관_&_시스템/던전_서사형_GM_가이드, 🌎_세계관_&_시스템/변수_&_액티브_활용_가이드, 🌎_세계관_&_시스템/현재_주요_수치, 🌎_세계관_&_시스템/Stat_System_(ATK_DEF_LUCK) | lua/button_actions/actions, lua/runtime/output |
| `cv_dungeonEnteredToday` | lua->lorebook | 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙 | lua/runtime/output |
| `cv_equippedRelicDetails` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치, 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | lua/runtime/output |
| `cv_equippedRelics` | lua->lorebook | 🌎_세계관_&_시스템/마나_시스템_규칙, 🌎_세계관_&_시스템/현재_주요_수치, 🎰_가챠_종류/시설_건설 | lua/runtime/output |
| `cv_equippedSkillDetails` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치, 🌎_세계관_&_시스템/스킬·아이템·유물·시설_효과_설명 | lua/runtime/output |
| `cv_equippedSkills` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output |
| `cv_facilities` | lua->lorebook | 🌎_세계관_&_시스템/마나_시스템_규칙, 🌎_세계관_&_시스템/섬_환경, 🌎_세계관_&_시스템/현재_주요_수치, 🎰_가챠_종류/시설_건설 | lua/runtime/output |
| `cv_floor` | lua->lorebook | 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙 | lua/button_actions/actions, lua/runtime/output |
| `cv_hunger` | lua->lorebook | 🌎_세계관_&_시스템/날짜_&_던전_게이트_규칙, 🌎_세계관_&_시스템/현재_주요_수치 | lua/domain/var, lua/runtime/output |
| `cv_items` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/domain/var, lua/runtime/output |
| `cv_mana` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/domain/var, lua/runtime/output |
| `cv_maxHp` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output |
| `cv_maxHunger` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output |
| `cv_maxMana` | lua->lorebook | 🌎_세계관_&_시스템/현재_주요_수치 | lua/runtime/output |
| `cv_nextDungeonType` | lua->lorebook | 🌎_세계관_&_시스템/던전 | lua/domain/dungeon, lua/runtime/input, lua/runtime/output |
| `cv_sanctuarySpawnedFloor` | lua->lorebook | 🌎_세계관_&_시스템/던전 | lua/button_actions/actions, lua/domain/dungeon, lua/runtime/output |
| `cv_skills` | lua->lorebook | 🎰_가챠_종류/스킬_습득 | lua/runtime/output |


---

## Lua ↔ 정규식 상관관계

| 변수 | 방향 | Lua 파일 | 정규식 스크립트 |
|----------|-----------|------------------|---------------|
| `cv_auxMode` | lua->regex | lua/button_actions/actions, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널, AUX_ON_시_history의_img_태그_strip_(mimicry_차단_—_v2.1_§5.6_§9.8)._AUX_OFF_시_last-5_메시지만_유지 |
| `cv_companions` | lua->regex | lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_dungeonGateState` | lua->regex | lua/button_actions/actions, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_facilityDetails` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_itemDetails` | lua->regex | lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_points` | lua->regex | lua/main, lua/domain/monster, lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_baseCharsOff` | lua->regex | lua/button_actions/actions, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_companionsGrid` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_debugOpen` | lua->regex | lua/button_actions/actions, lua/domain/var | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeActiveSlot` | lua->regex | lua/main, lua/runtime/input, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeCategory` | lua->regex | lua/main, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeOpen` | lua->regex | lua/main, lua/runtime/input, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotFacility1` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotFacility2` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotFacility3` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotRelic1` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotRelic2` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotRelic3` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotSkill1` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotSkill2` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_forgeSlotSkill3` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_gachaPanelOpen` | lua->regex | lua/main, lua/button_actions/actions, lua/runtime/input, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_guideOpen` | lua->regex | lua/runtime/input, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_invCategory` | lua->regex | lua/domain/equip, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_invOpen` | lua->regex | lua/domain/equip, lua/runtime/input, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_islandStage` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_lastCharMsgId` | lua->regex | lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_monsterPanel` | lua->regex | lua/button_actions/actions, lua/domain/monster, lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_relicInvHtml` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_roundPanel` | lua->regex | lua/domain/var, lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_skillInvHtml` | lua->regex | lua/runtime/output | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |
| `cv_varEditHtml` | lua->regex | lua/domain/var | 상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 |


---

## 기본변수 매핑

| 변수 | 기본값 | 사용 위치 |
|----------|---------------|---------|
| { |  | — |
|   "cv_hp": "100", |  | — |
|   "cv_maxHp": "100", |  | — |
|   "cv_mana": "100", |  | — |
|   "cv_maxMana": "100", |  | — |
|   "cv_hunger": "100", |  | — |
|   "cv_maxHunger": "100", |  | — |
|   "cv_day": "1", |  | — |
|   "cv_points": "5,000", |  | — |
|   "cv_floor": "0", |  | — |
|   "cv_currentFloor": "0", |  | — |
|   "cv_items": "None", |  | — |
|   "cv_itemDetails": "None", |  | — |
|   "cv_skills": "None", |  | — |
|   "cv_skillDetails": "None", |  | — |
|   "cv_relics": "None", |  | — |
|   "cv_relicDetails": "None", |  | — |
|   "cv_facilities": "None", |  | — |
|   "cv_facilityDetails": "None", |  | — |
|   "cv_companions": "None", |  | — |
|   "cv_dungeonEnteredToday": "false", |  | — |
|   "cv_lastCompanionMsg": "-1" |  | — |
| } |  | — |


---

## 배경HTML 분석

### HTML 내 CBS 변수

> ℹ️ HTML에서 CBS 변수를 찾을 수 없음


---

## 변수 흐름

| 지표 | 값 |
|--------|-------|
| 추적된 변수 | 117 |
| 이슈 있는 변수 | 91 |

| 변수 | 이슈 |
|----------|--------|
| `...` | uninitialized-read |
| `cv_*` | uninitialized-read |
| `cv_activeDungeonType` | write-only, overwrite-conflict |
| `cv_activeFloorCondition` | overwrite-conflict |
| `cv_attack` | write-only |
| `cv_attack_base` | write-only |
| `cv_auxMode` | overwrite-conflict |
| `cv_baseCharsOff` | overwrite-conflict |
| `cv_combatRate` | write-only, overwrite-conflict |
| `cv_combatResult` | write-only, overwrite-conflict |
| `cv_combatResultBasic` | write-only |
| `cv_combatResultUlti` | write-only |
| `cv_combatRoll` | write-only, overwrite-conflict |
| `cv_companionPoolCache` | write-only, overwrite-conflict |
| `cv_companions` | overwrite-conflict |
| `cv_companionsEng` | write-only, overwrite-conflict |
| `cv_companionsGridKey` | write-only |
| `cv_currentFloor` | overwrite-conflict |
| `cv_currentMonsters` | write-only, overwrite-conflict |
| `cv_currentRound` | write-only, overwrite-conflict |
| `cv_darknessFortressUsedRound` | write-only |
| `cv_debugOpen` | overwrite-conflict |
| `cv_defense` | write-only |
| `cv_defense_base` | write-only |
| `cv_dungeonActive` | overwrite-conflict |
| `cv_dungeonGateState` | overwrite-conflict |
| `cv_floor` | overwrite-conflict |
| `cv_forgeActiveSlot` | overwrite-conflict |
| `cv_forgeCategory` | overwrite-conflict |
| `cv_forgeOpen` | overwrite-conflict |
| `cv_forgePickListFacility1` | uninitialized-read |
| `cv_forgePickListFacility2` | uninitialized-read |
| `cv_forgePickListFacility3` | uninitialized-read |
| `cv_forgePickListRelic1` | uninitialized-read |
| `cv_forgePickListRelic2` | uninitialized-read |
| `cv_forgePickListRelic3` | uninitialized-read |
| `cv_forgePickListSkill1` | uninitialized-read |
| `cv_forgePickListSkill2` | uninitialized-read |
| `cv_forgePickListSkill3` | uninitialized-read |
| `cv_gachaPanelOpen` | overwrite-conflict |
| `cv_gameOver` | write-only, overwrite-conflict |
| `cv_gmAdminUsedRound` | write-only |
| `cv_guideOpen` | overwrite-conflict |
| `cv_hp` | overwrite-conflict |
| `cv_hunger` | overwrite-conflict |
| `cv_hungerDrainAppliedRound` | write-only, overwrite-conflict |
| `cv_invCategory` | overwrite-conflict |
| `cv_invOpen` | overwrite-conflict |
| `cv_itemDetails` | overwrite-conflict |
| `cv_items` | overwrite-conflict |
| `cv_lastCharMsgId` | overwrite-conflict |
| `cv_lastCompanionMsg` | write-only |
| `cv_lastDayMsg` | write-only |
| `cv_lastDungeonType` | write-only, overwrite-conflict |
| `cv_lastFallbackTip` | write-only |
| `cv_lastGachaPick` | write-only, overwrite-conflict |
| `cv_luck` | write-only |
| `cv_luck_base` | write-only |
| `cv_mana` | overwrite-conflict |
| `cv_maxHp_base` | write-only |
| `cv_maxHunger_base` | write-only |
| `cv_maxMana_base` | write-only |
| `cv_maxRelicSlots` | write-only, overwrite-conflict |
| `cv_maxSkillSlots` | write-only, overwrite-conflict |
| `cv_mazeEscapeCount` | write-only, overwrite-conflict |
| `cv_mazeFailStreak` | write-only, overwrite-conflict |
| `cv_monsterPanel` | overwrite-conflict |
| `cv_nextDungeonType` | overwrite-conflict |
| `cv_nextFloorCondition` | write-only, overwrite-conflict |
| `cv_panelStayOnce` | write-only, overwrite-conflict |
| `cv_pendingMonsterSpawn` | write-only, overwrite-conflict |
| `cv_points` | overwrite-conflict |
| `cv_prevDungeonType` | write-only, overwrite-conflict |
| `cv_relicDetails` | write-only |
| `cv_relics` | write-only |
| `cv_roundClearRejectCount` | write-only |
| `cv_roundEvents` | write-only, overwrite-conflict |
| `cv_roundPanel` | overwrite-conflict |
| `cv_sanctuaryConsumed` | write-only, overwrite-conflict |
| `cv_sanctuarySpawnedFloor` | overwrite-conflict |
| `cv_sanctuarySpawnedMsg` | write-only, overwrite-conflict |
| `cv_saveSeedGcCounter` | write-only |
| `cv_saveSeedStore` | write-only |
| `cv_seedCounter` | write-only |
| `cv_skillDetails` | write-only |
| `cv_skipNextRerollPoint` | write-only, overwrite-conflict |
| `cv_stage5MaxApplied` | write-only |
| `cv_totalRounds` | write-only, overwrite-conflict |
| `cv_varEditOpen` | write-only, overwrite-conflict |
| `cv_varEditTarget` | write-only |
| `cv_yorEvasionUsedRound` | write-only |


---

## 데드 코드 발견 사항

| 유형 | 심각도 | 요소 | 메시지 |
|------|----------|---------|---------|
| uninitialized-variable | warning | lorebook:🌎_세계관_&_시스템/가챠_규칙 | Variable "..." is read before initialization. |
| uninitialized-variable | warning | lorebook:🌎_세계관_&_시스템/현재_주요_수치 | Variable "cv_*" is read before initialization. |
| write-only-variable | info | lua:lua/domain/dungeon | Variable "cv_activeDungeonType" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_attack" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_attack_base" is set but never read. |
| write-only-variable | info | lua:lua/domain/roll | Variable "cv_combatRate" is set but never read. |
| write-only-variable | info | lua:lua/domain/roll | Variable "cv_combatResult" is set but never read. |
| write-only-variable | info | lua:lua/domain/roll | Variable "cv_combatResultBasic" is set but never read. |
| write-only-variable | info | lua:lua/domain/roll | Variable "cv_combatResultUlti" is set but never read. |
| write-only-variable | info | lua:lua/domain/roll | Variable "cv_combatRoll" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_companionPoolCache" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_companionsEng" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_companionsGridKey" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_currentMonsters" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_currentRound" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_darknessFortressUsedRound" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_defense" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_defense_base" is set but never read. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListFacility1" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListFacility2" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListFacility3" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListRelic1" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListRelic2" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListRelic3" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListSkill1" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListSkill2" is read before initialization. |
| uninitialized-variable | warning | regex:상태창_UI_(STATUS_PANEL)_+_사이드토글_2개_+_인벤_가챠_사이드패널 | Variable "cv_forgePickListSkill3" is read before initialization. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_gameOver" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_gmAdminUsedRound" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_hungerDrainAppliedRound" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_lastCompanionMsg" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_lastDayMsg" is set but never read. |
| write-only-variable | info | lua:lua/domain/dungeon | Variable "cv_lastDungeonType" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_lastFallbackTip" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_lastGachaPick" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_luck" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_luck_base" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_maxHp_base" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_maxHunger_base" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_maxMana_base" is set but never read. |
| write-only-variable | info | lua:lua/domain/recalc | Variable "cv_maxRelicSlots" is set but never read. |
| write-only-variable | info | lua:lua/domain/recalc | Variable "cv_maxSkillSlots" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_mazeEscapeCount" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_mazeFailStreak" is set but never read. |
| write-only-variable | info | lua:lua/domain/dungeon | Variable "cv_nextFloorCondition" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_panelStayOnce" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_pendingMonsterSpawn" is set but never read. |
| write-only-variable | info | lua:lua/domain/dungeon | Variable "cv_prevDungeonType" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_relicDetails" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_relics" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_roundClearRejectCount" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_roundEvents" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_sanctuaryConsumed" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_sanctuarySpawnedMsg" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_saveSeedGcCounter" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_saveSeedStore" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_seedCounter" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_skillDetails" is set but never read. |
| write-only-variable | info | lua:lua/main | Variable "cv_skipNextRerollPoint" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_stage5MaxApplied" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_totalRounds" is set but never read. |
| write-only-variable | info | lua:lua/button_actions/actions | Variable "cv_varEditOpen" is set but never read. |
| write-only-variable | info | lua:lua/domain/var | Variable "cv_varEditTarget" is set but never read. |
| write-only-variable | info | lua:lua/runtime/output | Variable "cv_yorEvasionUsedRound" is set but never read. |
| shadowed-lorebook-keyword | warning | lorebook:시스템 나레이션 & 조언 사용 가이드 | Lorebook entry "시스템 나레이션 & 조언 사용 가이드" keyword "던전 진입" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "던전" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "포탈" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "Dungeon" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "Portal" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "층" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "보스" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "성역" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "가디언" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "floor" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "boss" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:던전 | Lorebook entry "던전" keyword "guardian" is shadowed by "던전 서사형 GM 가이드". |
| shadowed-lorebook-keyword | warning | lorebook:마나 시스템 규칙 | Lorebook entry "마나 시스템 규칙" keyword "회복" is shadowed by "스킬·아이템·유물·시설 효과 설명". |
| shadowed-lorebook-keyword | warning | lorebook:마나 시스템 규칙 | Lorebook entry "마나 시스템 규칙" keyword "回復" is shadowed by "스킬·아이템·유물·시설 효과 설명". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "食べ物" is shadowed by "차원 주머니 시스템". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "料理" is shadowed by "시설 노동 & 동료 일과 시스템". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "飢え" is shadowed by "GAME OVER 규칙". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "음식" is shadowed by "차원 주머니 시스템". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "요리" is shadowed by "시설 노동 & 동료 일과 시스템". |
| shadowed-lorebook-keyword | warning | lorebook:허기 시스템 규칙 | Lorebook entry "허기 시스템 규칙" keyword "굶주림" is shadowed by "GAME OVER 규칙". |
| shadowed-lorebook-keyword | warning | lorebook:시스템 태그 출력 형식 | Lorebook entry "시스템 태그 출력 형식" keyword "NEW_DAY" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:날짜 & 던전 게이트 규칙 | Lorebook entry "날짜 & 던전 게이트 규칙" keyword "NEW_DAY" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:날짜 & 던전 게이트 규칙 | Lorebook entry "날짜 & 던전 게이트 규칙" keyword "새벽" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:날짜 & 던전 게이트 규칙 | Lorebook entry "날짜 & 던전 게이트 규칙" keyword "아침" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:날짜 & 던전 게이트 규칙 | Lorebook entry "날짜 & 던전 게이트 규칙" keyword "夜明け" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:날짜 & 던전 게이트 규칙 | Lorebook entry "날짜 & 던전 게이트 규칙" keyword "朝" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:가챠 규칙 | Lorebook entry "가챠 규칙" keyword "가챠" is shadowed by "Stat System (ATK / DEF / LUCK)". |
| shadowed-lorebook-keyword | warning | lorebook:가챠 규칙 | Lorebook entry "가챠 규칙" keyword "ガチャマシン" is shadowed by "가챠 규칙". |
| shadowed-lorebook-keyword | warning | lorebook:시스템 태그 출력 형식 | Lorebook entry "시스템 태그 출력 형식" keyword "DEFEAT" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:시스템 태그 출력 형식 | Lorebook entry "시스템 태그 출력 형식" keyword "FLOOR" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:시스템 태그 출력 형식 | Lorebook entry "시스템 태그 출력 형식" keyword "GACHA" is shadowed by "시스템 태그 - 가챠 & 이벤트". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "장착" is shadowed by "Stat System (ATK / DEF / LUCK)". |
| shadowed-lorebook-keyword | warning | lorebook:Stat System (ATK / DEF / LUCK) | Lorebook entry "Stat System (ATK / DEF / LUCK)" keyword "스킬" is shadowed by "스킬 습득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "스킬" is shadowed by "스킬 습득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "아이템" is shadowed by "보급품". |
| shadowed-lorebook-keyword | warning | lorebook:Stat System (ATK / DEF / LUCK) | Lorebook entry "Stat System (ATK / DEF / LUCK)" keyword "유물" is shadowed by "유물 획득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "유물" is shadowed by "유물 획득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "시설" is shadowed by "시설 건설". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "スキル" is shadowed by "스킬 습득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "アイテム" is shadowed by "보급품". |
| shadowed-lorebook-keyword | warning | lorebook:스킬·아이템·유물·시설 효과 설명 | Lorebook entry "스킬·아이템·유물·시설 효과 설명" keyword "遺物" is shadowed by "유물 획득". |
| shadowed-lorebook-keyword | warning | lorebook:유물 획득 | Lorebook entry "유물 획득" keyword "遺物ガチャ" is shadowed by "유물 획득". |
| shadowed-lorebook-keyword | warning | lorebook:스킬 습득 | Lorebook entry "스킬 습득" keyword "スキルガチャ" is shadowed by "스킬 습득". |
| shadowed-lorebook-keyword | warning | lorebook:보급품 | Lorebook entry "보급품" keyword "補給品ガチャ" is shadowed by "보급품". |
| unreachable-lorebook-entry | warning | lorebook:커플 가챠 | Lorebook entry "커플 가챠" is selective but has no secondary keys. |


---

## 로어북 구조

### 폴더 트리

- 📁 **🌎_세계관_&_시스템**
  - 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성)
  - 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성)
  - 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성)
  - 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성)
  - AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) _(상수)_
  - Forge System (Tier-up Synthesis)
  - GAME OVER 규칙
  - Stat System (ATK / DEF / LUCK) _(상수)_
  - 가챠 규칙
  - 가챠섬 세계관 설정 _(상수)_
  - 날짜 & 던전 게이트 규칙
  - 던전
  - 던전 서사형 GM 가이드
  - 마나 시스템 규칙
  - 변수 & 액티브 활용 가이드 _(상수)_
  - 섬 개발 단계 시스템
  - 섬 환경
  - 스킬·아이템·유물·시설 효과 설명
  - 시설 노동 & 동료 일과 시스템
  - 시스템 나레이션 & 조언 사용 가이드 _(상수)_
  - 시스템 태그 - 가챠 & 이벤트
  - 시스템 태그 출력 형식 _(상수)_
  - 전투 판정 시스템
  - 차원 주머니 시스템
  - 최대 스탯 규칙
  - 층 컨디션 시스템
  - 허기 시스템 규칙
  - 현재 주요 수치 _(상수)_
- 📁 **🎰_가챠_종류**
  - 동료 소환
  - 랜덤 가챠
  - 보급품
  - 스킬 습득
  - 시설 건설
  - 유물 획득
  - 커플 가챠
- 📁 **🙂_동료**
  - 👩 2B
  - 👩 게임마스터
  - 👩 나오
  - 👩 난천
  - 👩 다이호
  - 👩 다크니스
  - 👩 대라
  - 👩 도바킨
  - 👩 라뷰린스
  - 👩 라이덴 쇼군
  - 👩 라이잘린 슈타우트
  - 👩 레오나 하이데른
  - 👩 레이디데블몬
  - 👩 루시엘라 R. 사워크림
  - 👩 루시퍼
  - 👩 리사
  - 👩 마츠모토 란기쿠
  - 👩 마키마
  - 👩 머드락
  - 👩 미나모토노 라이코
  - 👩 미래
  - 👩 미즈키 시라누이
  - 👩 바이켄
  - 👩 범황
  - 👩 베르스타몬
  - 👩 벨파스트
  - 👩 보아 핸콕
  - 👩 브레머튼
  - 👩 블랙 매지션 걸
  - 👩 비나
  - 👩 비앙카 듀란달 아타지나
  - 👩 사무스 아란
  - 👩 사일런트 매지션
  - 👩 산고
  - 👩 세크메트
  - 👩 셀레스틴 루클루스
  - 👩 쇼쿠호 미사키
  - 👩 시라누이 마이
  - 👩 시틀라리
  - 👩 시호인 요루이치
  - 👩 신학
  - 👩 실바나스 윈드러너
  - 👩 아델
  - 👩 아르토리아 얼터 (랜서)
  - 👩 아르토리아 펜드래곤 (랜서)
  - 👩 아를레키노
  - 👩 엔젤우몬
  - 👩 엘리시아
  - 👩 오가타 칸나
  - 👩 오컬트 마니아 (히토미)
  - 👩 올가 디스코르디아
  - 👩 요르 포저
  - 👩 위스퍼레인
  - 👩 이노우에 오리히메
  - 👩 이블린 슈발리에
  - 👩 이자요이 노노미
  - 👩 인조인간 18호
  - 👩 일레그
  - 👩 츠나데
  - 👩 츠카츠키 리오
  - 👩 카프카
  - 👩 칸타렐라
  - 👩 코쵸우 시노부
  - 👩 쿠기사키 노바라
  - 👩 티아 하리벨
  - 👩 페른
  - 👩 페코린느
  - 👩 하네카와 하스미
  - 👩 헬름
  - 👩 홍련
  - 👩 후부키
  - 👩 힌덴부르크

### 활성화 모드

| 모드 | 수 |
|------|-------|
| 항상 활성 | 7 |
| 키워드 활성 | 100 |
| 키워드 활성(멀티 키) | 0 |
| 참조 전용 | 0 |
| 활성 | 107 |
| 비활성 | 0 |
| CBS 포함 | 17 |
| CBS 미포함 | 90 |

### 키워드 중복

2개 이상 항목에서 공유하는 키워드:

| 키워드 | 공유 대상 |
|---------|-----------|
| 던전 진입 | 🌎_세계관_&_시스템/시스템 나레이션 & 조언 사용 가이드, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 던전 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 포탈 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| Dungeon | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| Portal | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 층 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 보스 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 성역 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 가디언 | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| floor | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| boss | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| guardian | 🌎_세계관_&_시스템/던전, 🌎_세계관_&_시스템/던전 서사형 GM 가이드 |
| 회복 | 🌎_세계관_&_시스템/마나 시스템 규칙, 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명 |
| 回復 | 🌎_세계관_&_시스템/마나 시스템 규칙, 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명 |
| 食べ物 | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/차원 주머니 시스템 |
| 料理 | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/시설 노동 & 동료 일과 시스템 |
| 飢え | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/GAME OVER 규칙 |
| 음식 | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/차원 주머니 시스템 |
| 요리 | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/시설 노동 & 동료 일과 시스템 |
| 굶주림 | 🌎_세계관_&_시스템/허기 시스템 규칙, 🌎_세계관_&_시스템/GAME OVER 규칙 |
| NEW_DAY | 🌎_세계관_&_시스템/날짜 & 던전 게이트 규칙, 🌎_세계관_&_시스템/시스템 태그 출력 형식, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 새벽 | 🌎_세계관_&_시스템/날짜 & 던전 게이트 규칙, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 아침 | 🌎_세계관_&_시스템/날짜 & 던전 게이트 규칙, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 夜明け | 🌎_세계관_&_시스템/날짜 & 던전 게이트 규칙, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 朝 | 🌎_세계관_&_시스템/날짜 & 던전 게이트 규칙, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 가챠 | 🌎_세계관_&_시스템/가챠 규칙, 🌎_세계관_&_시스템/Stat System (ATK / DEF / LUCK) |
| ガチャマシン | 🌎_세계관_&_시스템/가챠 규칙 |
| DEFEAT | 🌎_세계관_&_시스템/시스템 태그 출력 형식, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| FLOOR | 🌎_세계관_&_시스템/시스템 태그 출력 형식, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| GACHA | 🌎_세계관_&_시스템/시스템 태그 출력 형식, 🌎_세계관_&_시스템/시스템 태그 - 가챠 & 이벤트 |
| 장착 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🌎_세계관_&_시스템/Stat System (ATK / DEF / LUCK) |
| 스킬 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🌎_세계관_&_시스템/Stat System (ATK / DEF / LUCK), 🎰_가챠_종류/스킬 습득 |
| 아이템 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🎰_가챠_종류/보급품 |
| 유물 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🌎_세계관_&_시스템/Stat System (ATK / DEF / LUCK), 🎰_가챠_종류/유물 획득 |
| 시설 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🎰_가챠_종류/시설 건설 |
| スキル | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🎰_가챠_종류/스킬 습득 |
| アイテム | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🎰_가챠_종류/보급품 |
| 遺物 | 🌎_세계관_&_시스템/스킬·아이템·유물·시설 효과 설명, 🎰_가챠_종류/유물 획득 |
| 遺物ガチャ | 🎰_가챠_종류/유물 획득 |
| スキルガチャ | 🎰_가챠_종류/스킬 습득 |
| 補給品ガチャ | 🎰_가챠_종류/보급품 |


---

## 로어북 활성화 체인

| 지표 | 값 |
|--------|-------|
| 재귀 스캔 | true |
| 가능 체인 | 1501 |
| 부분 체인 | 0 |
| 차단 체인 | 9 |

| 흐름 | 상태 | 일치 키워드 | 차단 이유 |
|------|--------|----------|------------|
| 가챠섬 세계관 설정 → 던전 | possible | 던전, Dungeon, 성역, floor, boss | — |
| 가챠섬 세계관 설정 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 성역, floor, boss | — |
| 가챠섬 세계관 설정 → 마나 시스템 규칙 | possible | 마나, 충전, mana, charge, recharge | — |
| 가챠섬 세계관 설정 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 가챠섬 세계관 설정 → 최대 스탯 규칙 | possible | MAX | — |
| 가챠섬 세계관 설정 → 가챠 규칙 | possible | 가챠, Gacha, Summon, Draw, Ticket, 성소, Sanctuary, Gacha Machine | — |
| 가챠섬 세계관 설정 → 섬 환경 | possible | Island | — |
| 가챠섬 세계관 설정 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, DUNGEON, DEFEAT, FLOOR, GACHA | — |
| 가챠섬 세계관 설정 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DEFEAT | — |
| 가챠섬 세계관 설정 → 전투 판정 시스템 | possible | combat, monster | — |
| 가챠섬 세계관 설정 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 가챠섬 세계관 설정 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 가챠섬 세계관 설정 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 가챠섬 세계관 설정 → 스킬 습득 | possible | Skill | — |
| 가챠섬 세계관 설정 → 👩 티아 하리벨 | possible | Harribel | — |
| 가챠섬 세계관 설정 → 👩 시라누이 마이 | possible | Mai | — |
| 가챠섬 세계관 설정 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 가챠섬 세계관 설정 → 👩 츠카츠키 리오 | possible | Rio | — |
| 시스템 나레이션 & 조언 사용 가이드 → 던전 | possible | 던전, Dungeon, 층, 보스, floor, boss | — |
| 시스템 나레이션 & 조언 사용 가이드 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 층, 보스, floor, boss | — |
| 시스템 나레이션 & 조언 사용 가이드 → 마나 시스템 규칙 | possible | 마나, 충전, mana | — |
| 시스템 나레이션 & 조언 사용 가이드 → 허기 시스템 규칙 | possible | 허기, hunger, food, eat | — |
| 시스템 나레이션 & 조언 사용 가이드 → 최대 스탯 규칙 | possible | MAX | — |
| 시스템 나레이션 & 조언 사용 가이드 → 가챠 규칙 | possible | 가챠, Gacha, Summon, 성소, Sanctuary, Gacha Machine | — |
| 시스템 나레이션 & 조언 사용 가이드 → 섬 환경 | possible | 섬 | — |
| 시스템 나레이션 & 조언 사용 가이드 → 층 컨디션 시스템 | possible | floor condition | — |
| 시스템 나레이션 & 조언 사용 가이드 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, DUNGEON, DEFEAT, FLOOR, GACHA, STATUS_TIP, STATUS_PANEL | — |
| 시스템 나레이션 & 조언 사용 가이드 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DEFEAT, 던전 진입 | — |
| 시스템 나레이션 & 조언 사용 가이드 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 시스템 나레이션 & 조언 사용 가이드 → 스킬·아이템·유물·시설 효과 설명 | possible | 유물, use, skill | — |
| 시스템 나레이션 & 조언 사용 가이드 → Stat System (ATK / DEF / LUCK) | possible | DEF, 유물, 가챠 | — |
| 시스템 나레이션 & 조언 사용 가이드 → 유물 획득 | possible | 유물, 유물 가챠 | — |
| 시스템 나레이션 & 조언 사용 가이드 → 스킬 습득 | possible | Skill | — |
| 시스템 나레이션 & 조언 사용 가이드 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 시스템 나레이션 & 조언 사용 가이드 → 👩 츠카츠키 리오 | possible | Rio | — |
| 시스템 나레이션 & 조언 사용 가이드 → 👩 게임마스터 | possible | Gamemaster, 게임마스터, GM | — |
| 던전 → 던전 서사형 GM 가이드 | possible | 던전, 포탈, Dungeon, Portal, 층, 보스, 성역, 가디언, floor, boss, gimmick, trap, hidden | — |
| 던전 → 마나 시스템 규칙 | possible | 충전, mana, charge | — |
| 던전 → 허기 시스템 규칙 | possible | 허기, hunger, food, eat, cook | — |
| 던전 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY, 던전 게이트 | — |
| 던전 → 최대 스탯 규칙 | possible | MAX, 최대 | — |
| 던전 → 가챠 규칙 | possible | 가챠, Gacha, Ticket, 성소, Sanctuary | — |
| 던전 → 섬 환경 | possible | 섬, Island | — |
| 던전 → 층 컨디션 시스템 | possible | 저주받은 땅 | — |
| 던전 → GAME OVER 규칙 | possible | GAME OVER | — |
| 던전 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, DEFEAT, FLOOR, GACHA, STATUS_PANEL | — |
| 던전 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, FLOOR, DUNGEON_ENTER, DUNGEON_EXIT, DEFEAT, 클리어 | — |
| 던전 → 전투 판정 시스템 | possible | 전투, 공격, 판정, 몬스터, combat, attack, fight, monster | — |
| 던전 → 차원 주머니 시스템 | possible | inventory | — |
| 던전 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 던전 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 스킬, use, equip, drink, effect, skill, item, relic, facility | — |
| 던전 → Stat System (ATK / DEF / LUCK) | possible | ATK, DEF, 스킬, 가챠 | — |
| 던전 → 유물 획득 | possible | Relic | — |
| 던전 → 시설 건설 | possible | Facility | — |
| 던전 → 스킬 습득 | possible | 스킬, Skill, Ability | — |
| 던전 → 보급품 | possible | Supply, Item | — |
| 던전 → 👩 라이덴 쇼군 | possible | Ei | — |
| 던전 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 던전 → 👩 츠카츠키 리오 | possible | Rio | — |
| 던전 → 👩 게임마스터 | possible | GM | — |
| 던전 서사형 GM 가이드 → 시스템 나레이션 & 조언 사용 가이드 | possible | 경고 | — |
| 던전 서사형 GM 가이드 → 던전 | possible | 던전, Dungeon, 층, 보스, 성역, floor, boss | — |
| 던전 서사형 GM 가이드 → 마나 시스템 규칙 | possible | 마나, 충전, mana, charge, recharge | — |
| 던전 서사형 GM 가이드 → 허기 시스템 규칙 | possible | 허기, hunger, eat | — |
| 던전 서사형 GM 가이드 → 최대 스탯 규칙 | possible | MAX, 최대 | — |
| 던전 서사형 GM 가이드 → 가챠 규칙 | possible | 가챠, Gacha, 성소, Sanctuary | — |
| 던전 서사형 GM 가이드 → 섬 환경 | possible | 환경 | — |
| 던전 서사형 GM 가이드 → 층 컨디션 시스템 | possible | 층 컨디션, 저주받은 땅 | — |
| 던전 서사형 GM 가이드 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, ITEM, DUNGEON, DEFEAT, FLOOR, GACHA, STATUS_PANEL | — |
| 던전 서사형 GM 가이드 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DUNGEON_EXIT, DEFEAT | — |
| 던전 서사형 GM 가이드 → 전투 판정 시스템 | possible | 전투, 공격, 판정, 몬스터, combat, attack, fight, monster | — |
| 던전 서사형 GM 가이드 → 차원 주머니 시스템 | possible | 차원 주머니 | — |
| 던전 서사형 GM 가이드 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 던전 서사형 GM 가이드 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 스킬, use, heal, effect, skill, item, relic | — |
| 던전 서사형 GM 가이드 → Stat System (ATK / DEF / LUCK) | possible | ATK, DEF, LUCK, 스킬, 가챠 | — |
| 던전 서사형 GM 가이드 → 유물 획득 | possible | Relic | — |
| 던전 서사형 GM 가이드 → 스킬 습득 | possible | 스킬, Skill | — |
| 던전 서사형 GM 가이드 → 보급품 | possible | 보급품, Supply, Item | — |
| 던전 서사형 GM 가이드 → 👩 라이덴 쇼군 | possible | Ei | — |
| 던전 서사형 GM 가이드 → 👩 시라누이 마이 | possible | Mai | — |
| 던전 서사형 GM 가이드 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 던전 서사형 GM 가이드 → 👩 츠카츠키 리오 | possible | Rio | — |
| 던전 서사형 GM 가이드 → 👩 게임마스터 | possible | GM | — |
| 마나 시스템 규칙 → 던전 | possible | Dungeon, 성역, floor | — |
| 마나 시스템 규칙 → 던전 서사형 GM 가이드 | possible | Dungeon, 성역, floor | — |
| 마나 시스템 규칙 → 허기 시스템 규칙 | possible | eat | — |
| 마나 시스템 규칙 → 최대 스탯 규칙 | possible | MAX | — |
| 마나 시스템 규칙 → 가챠 규칙 | possible | Summon, 성소, Sanctuary | — |
| 마나 시스템 규칙 → 섬 환경 | possible | 섬, Island | — |
| 마나 시스템 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, ITEM, DUNGEON, FLOOR | — |
| 마나 시스템 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | FLOOR | — |
| 마나 시스템 규칙 → 전투 판정 시스템 | possible | combat, attack | — |
| 마나 시스템 규칙 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 마나 시스템 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | 회복, use, equip, effect, skill, item, relic | — |
| 마나 시스템 규칙 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 마나 시스템 규칙 → 유물 획득 | possible | Relic | — |
| 마나 시스템 규칙 → 스킬 습득 | possible | Skill | — |
| 마나 시스템 규칙 → 보급품 | possible | Item | — |
| 마나 시스템 규칙 → 👩 이노우에 오리히메 | possible | 오리히메 | — |
| 마나 시스템 규칙 → 👩 마츠모토 란기쿠 | possible | 란기쿠 | — |
| 마나 시스템 규칙 → 👩 시호인 요루이치 | possible | 요루이치 | — |
| 마나 시스템 규칙 → 👩 올가 디스코르디아 | possible | 올가 | — |
| 마나 시스템 규칙 → 👩 보아 핸콕 | possible | 핸콕 | — |
| 마나 시스템 규칙 → 👩 미나모토노 라이코 | possible | 라이코 | — |
| 마나 시스템 규칙 → 👩 라이덴 쇼군 | possible | Ei | — |
| 마나 시스템 규칙 → 👩 시라누이 마이 | possible | Mai | — |
| 마나 시스템 규칙 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 마나 시스템 규칙 → 👩 츠카츠키 리오 | possible | Rio | — |
| 마나 시스템 규칙 → 👩 게임마스터 | possible | GM | — |
| 허기 시스템 규칙 → 던전 | possible | 던전, Dungeon | — |
| 허기 시스템 규칙 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, anomaly, hidden | — |
| 허기 시스템 규칙 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 허기 시스템 규칙 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY | — |
| 허기 시스템 규칙 → 최대 스탯 규칙 | possible | MAX | — |
| 허기 시스템 규칙 → 가챠 규칙 | possible | 가챠, Gacha, Summon, Sanctuary | — |
| 허기 시스템 규칙 → 섬 환경 | possible | 섬, Island | — |
| 허기 시스템 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, DEFEAT, GACHA, STATUS_PANEL | — |
| 허기 시스템 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, DEFEAT | — |
| 허기 시스템 규칙 → 전투 판정 시스템 | possible | monster | — |
| 허기 시스템 규칙 → 차원 주머니 시스템 | possible | 차원 주머니 | — |
| 허기 시스템 규칙 → 시설 노동 & 동료 일과 시스템 | possible | 시설 노동, 노동, production | — |
| 허기 시스템 규칙 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 허기 시스템 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | 시설, use, effect, skill, item, relic, facility, building | — |
| 허기 시스템 규칙 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 허기 시스템 규칙 → 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) | possible | beach | — |
| 허기 시스템 규칙 → 유물 획득 | possible | Relic | — |
| 허기 시스템 규칙 → 시설 건설 | possible | 시설, Facility, Build | — |
| 허기 시스템 규칙 → 스킬 습득 | possible | Skill | — |
| 허기 시스템 규칙 → 보급품 | possible | Supply, Item | — |
| 허기 시스템 규칙 → 👩 라이덴 쇼군 | possible | Ei | — |
| 허기 시스템 규칙 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 허기 시스템 규칙 → 👩 게임마스터 | possible | GM | — |
| 날짜 & 던전 게이트 규칙 → 던전 | possible | 던전, Dungeon, Portal, floor | — |
| 날짜 & 던전 게이트 규칙 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, Portal, floor | — |
| 날짜 & 던전 게이트 규칙 → 마나 시스템 규칙 | possible | mana | — |
| 날짜 & 던전 게이트 규칙 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 날짜 & 던전 게이트 규칙 → 최대 스탯 규칙 | possible | MAX | — |
| 날짜 & 던전 게이트 규칙 → 가챠 규칙 | possible | 성소 | — |
| 날짜 & 던전 게이트 규칙 → 섬 환경 | possible | 섬, Island | — |
| 날짜 & 던전 게이트 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, NEW_DAY, DUNGEON, DEFEAT, FLOOR, STATUS_PANEL | — |
| 날짜 & 던전 게이트 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | NEW_DAY, FLOOR, DUNGEON_ENTER, DUNGEON_EXIT, DEFEAT, 아침 | — |
| 날짜 & 던전 게이트 규칙 → 전투 판정 시스템 | possible | fight, monster | — |
| 날짜 & 던전 게이트 규칙 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 날짜 & 던전 게이트 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, effect | — |
| 날짜 & 던전 게이트 규칙 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 날짜 & 던전 게이트 규칙 → 👩 시라누이 마이 | possible | Mai | — |
| 날짜 & 던전 게이트 규칙 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 날짜 & 던전 게이트 규칙 → 👩 츠카츠키 리오 | possible | Rio | — |
| 최대 스탯 규칙 → 마나 시스템 규칙 | possible | mana | — |
| 최대 스탯 규칙 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 최대 스탯 규칙 → 가챠 규칙 | possible | Gacha | — |
| 최대 스탯 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, GACHA | — |
| 최대 스탯 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 최대 스탯 규칙 → 전투 판정 시스템 | possible | combat | — |
| 최대 스탯 규칙 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 최대 스탯 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill, relic | — |
| 최대 스탯 규칙 → Stat System (ATK / DEF / LUCK) | possible | 스탯 | — |
| 최대 스탯 규칙 → 유물 획득 | possible | Relic | — |
| 최대 스탯 규칙 → 스킬 습득 | possible | Skill, Ability | — |
| 최대 스탯 규칙 → 👩 라이덴 쇼군 | possible | Ei | — |
| 최대 스탯 규칙 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 최대 스탯 규칙 → 👩 게임마스터 | possible | GM | — |
| 가챠 규칙 → 던전 | possible | 던전, Dungeon, 성역, floor, boss | — |
| 가챠 규칙 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 성역, floor, boss, trap, hidden | — |
| 가챠 규칙 → 마나 시스템 규칙 | possible | 마나, mana, 회복 | — |
| 가챠 규칙 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 가챠 규칙 → 날짜 & 던전 게이트 규칙 | possible | gate | — |
| 가챠 규칙 → 최대 스탯 규칙 | possible | MAX | — |
| 가챠 규칙 → 섬 환경 | possible | Island, Region | — |
| 가챠 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, tag format, POINT, HP, MANA, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 가챠 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 가챠 규칙 → 전투 판정 시스템 | possible | combat, attack | — |
| 가챠 규칙 → 시설 노동 & 동료 일과 시스템 | possible | 농장 | — |
| 가챠 규칙 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 가챠 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | 작동, 회복, 스킬, 유물, 시설, use, activate, effect, skill, item, relic, facility | — |
| 가챠 규칙 → Stat System (ATK / DEF / LUCK) | possible | DEF, LUCK, 스킬, 유물, 가챠 | — |
| 가챠 규칙 → 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) | possible | beach | — |
| 가챠 규칙 → 유물 획득 | possible | 유물, Relic | — |
| 가챠 규칙 → 시설 건설 | possible | 시설, Facility, Build | — |
| 가챠 규칙 → 스킬 습득 | possible | 스킬, Skill | — |
| 가챠 규칙 → 보급품 | possible | 보급품, 보급품 가챠, Supply, Item | — |
| 가챠 규칙 → 커플 가챠 | possible | Couple Item | — |
| 가챠 규칙 → 랜덤 가챠 | possible | Random Gacha | — |
| 가챠 규칙 → 👩 이노우에 오리히메 | possible | 이노우에 오리히메, 오리히메, Orihime, Inoue Orihime | — |
| 가챠 규칙 → 👩 엔젤우몬 | possible | 엔젤우몬, Angewomon | — |
| 가챠 규칙 → 👩 보아 핸콕 | possible | Hancock | — |
| 가챠 규칙 → 👩 2B | possible | 2B | — |
| 가챠 규칙 → 👩 라이덴 쇼군 | possible | Ei | — |
| 가챠 규칙 → 👩 시라누이 마이 | possible | Mai | — |
| 가챠 규칙 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 가챠 규칙 → 👩 미래 | possible | 미래 | — |
| 가챠 규칙 → 👩 게임마스터 | possible | GM | — |
| 섬 환경 → 던전 | possible | 던전, Dungeon, Portal, 성역, floor | — |
| 섬 환경 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, Portal, 성역, floor | — |
| 섬 환경 → 마나 시스템 규칙 | possible | 마나 | — |
| 섬 환경 → 허기 시스템 규칙 | possible | hunger, food, eat | — |
| 섬 환경 → 날짜 & 던전 게이트 규칙 | possible | 던전 게이트, gate | — |
| 섬 환경 → 최대 스탯 규칙 | possible | MAX | — |
| 섬 환경 → 가챠 규칙 | possible | 가챠, Gacha, 성소, Sanctuary, Gacha Machine | — |
| 섬 환경 → 섬 개발 단계 시스템 | possible | 황무지, 개척지, 마을, 요새, 왕국, 성지 | — |
| 섬 환경 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, HUNGER, ITEM, DUNGEON, DEFEAT, FLOOR, GACHA | — |
| 섬 환경 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DUNGEON_EXIT, DEFEAT | — |
| 섬 환경 → 전투 판정 시스템 | possible | monster | — |
| 섬 환경 → 시설 노동 & 동료 일과 시스템 | possible | 농장, 주방 | — |
| 섬 환경 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 섬 환경 → 스킬·아이템·유물·시설 효과 설명 | possible | use, activate, equip, drink, heal, item, facility | — |
| 섬 환경 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 섬 환경 → 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) | possible | 서쪽 숲, west forest | — |
| 섬 환경 → 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) | possible | 동쪽 사막, east desert | — |
| 섬 환경 → 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) | possible | 남쪽 해변, 해변, beach | — |
| 섬 환경 → 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) | possible | 북쪽 산맥, north mountain range | — |
| 섬 환경 → 시설 건설 | possible | Facility, Build | — |
| 섬 환경 → 보급품 | possible | Item | — |
| 섬 환경 → 👩 라이덴 쇼군 | possible | Ei | — |
| 섬 환경 → 👩 시라누이 마이 | possible | Mai | — |
| 섬 환경 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 섬 환경 → 👩 츠카츠키 리오 | possible | Rio | — |
| 섬 환경 → 👩 범황 | possible | Devi | — |
| 섬 개발 단계 시스템 → 던전 | possible | 던전, Dungeon, floor | — |
| 섬 개발 단계 시스템 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, floor | — |
| 섬 개발 단계 시스템 → 마나 시스템 규칙 | possible | 마나, mana, 회복 | — |
| 섬 개발 단계 시스템 → 허기 시스템 규칙 | possible | 허기, 배고픔, hunger, food, eat | — |
| 섬 개발 단계 시스템 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY | — |
| 섬 개발 단계 시스템 → 최대 스탯 규칙 | possible | MAX, 최대, relic effect | — |
| 섬 개발 단계 시스템 → 가챠 규칙 | possible | 가챠, Gacha | — |
| 섬 개발 단계 시스템 → 섬 환경 | possible | 섬, Island | — |
| 섬 개발 단계 시스템 → 층 컨디션 시스템 | possible | floor condition, 축복받은 땅 | — |
| 섬 개발 단계 시스템 → GAME OVER 규칙 | possible | GAME OVER | — |
| 섬 개발 단계 시스템 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, FLOOR, GACHA | — |
| 섬 개발 단계 시스템 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, FLOOR | — |
| 섬 개발 단계 시스템 → 전투 판정 시스템 | possible | 전투, combat | — |
| 섬 개발 단계 시스템 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 섬 개발 단계 시스템 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, 효과, 아이템, 유물, 시설, use, effect, item, relic, facility | — |
| 섬 개발 단계 시스템 → Stat System (ATK / DEF / LUCK) | possible | 스탯, DEF, 유물, 가챠 | — |
| 섬 개발 단계 시스템 → 유물 획득 | possible | 유물, Relic | — |
| 섬 개발 단계 시스템 → 시설 건설 | possible | 시설, Facility | — |
| 섬 개발 단계 시스템 → 보급품 | possible | 보급품, 아이템, 보급품 가챠, Supply, Item | — |
| 섬 개발 단계 시스템 → 👩 라이덴 쇼군 | possible | Ei | — |
| 섬 개발 단계 시스템 → 👩 시라누이 마이 | possible | Mai | — |
| 섬 개발 단계 시스템 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 섬 개발 단계 시스템 → 👩 게임마스터 | possible | GM | — |
| 층 컨디션 시스템 → 던전 | possible | 던전, Dungeon, 층, floor, boss | — |
| 층 컨디션 시스템 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 층, floor, boss, trap | — |
| 층 컨디션 시스템 → 마나 시스템 규칙 | possible | 마나, mana, 회복 | — |
| 층 컨디션 시스템 → 섬 개발 단계 시스템 | possible | 풍요 | — |
| 층 컨디션 시스템 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, DUNGEON, FLOOR | — |
| 층 컨디션 시스템 → 시스템 태그 - 가챠 & 이벤트 | possible | FLOOR, DUNGEON_ENTER, DUNGEON_EXIT | — |
| 층 컨디션 시스템 → 전투 판정 시스템 | possible | 전투, 판정, combat, attack, monster | — |
| 층 컨디션 시스템 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 층 컨디션 시스템 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, 스킬, effect, skill | — |
| 층 컨디션 시스템 → Stat System (ATK / DEF / LUCK) | possible | 스킬 | — |
| 층 컨디션 시스템 → 스킬 습득 | possible | 스킬, Skill | — |
| 층 컨디션 시스템 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 층 컨디션 시스템 → 👩 게임마스터 | possible | GM | — |
| GAME OVER 규칙 → 던전 | possible | Dungeon, floor | — |
| GAME OVER 규칙 → 던전 서사형 GM 가이드 | possible | Dungeon, floor | — |
| GAME OVER 규칙 → 마나 시스템 규칙 | possible | mana | — |
| GAME OVER 규칙 → 허기 시스템 규칙 | possible | hunger, eat, 굶주림 | — |
| GAME OVER 규칙 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY | — |
| GAME OVER 규칙 → 가챠 규칙 | possible | 가챠, Gacha, 성소, Sanctuary | — |
| GAME OVER 규칙 → 섬 환경 | possible | 섬, Island | — |
| GAME OVER 규칙 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, NEW_DAY, DUNGEON, DEFEAT, FLOOR, GACHA, STATUS_TIP, STATUS_PANEL | — |
| GAME OVER 규칙 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, FLOOR, DEFEAT | — |
| GAME OVER 규칙 → 전투 판정 시스템 | possible | combat | — |
| GAME OVER 규칙 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| GAME OVER 규칙 → 스킬·아이템·유물·시설 효과 설명 | possible | use | — |
| GAME OVER 규칙 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| GAME OVER 규칙 → 👩 라이덴 쇼군 | possible | Ei | — |
| GAME OVER 규칙 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| GAME OVER 규칙 → 👩 게임마스터 | possible | GM | — |
| 시스템 태그 출력 형식 → 던전 | possible | 던전, Dungeon, floor | — |
| 시스템 태그 출력 형식 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, floor, hidden | — |
| 시스템 태그 출력 형식 → 마나 시스템 규칙 | possible | mana | — |
| 시스템 태그 출력 형식 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 시스템 태그 출력 형식 → 최대 스탯 규칙 | possible | MAX, 최대 | — |
| 시스템 태그 출력 형식 → 가챠 규칙 | possible | 가챠, Gacha, Summon, Sanctuary | — |
| 시스템 태그 출력 형식 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DEFEAT | — |
| 시스템 태그 출력 형식 → 전투 판정 시스템 | possible | 전투, 판정, attack | — |
| 시스템 태그 출력 형식 → 차원 주머니 시스템 | possible | inventory | — |
| 시스템 태그 출력 형식 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 시스템 태그 출력 형식 → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, 스킬, 유물, use, effect, skill, item, relic, facility | — |
| 시스템 태그 출력 형식 → Stat System (ATK / DEF / LUCK) | possible | 스탯, ATK, DEF, LUCK, 스킬, 유물, 가챠 | — |
| 시스템 태그 출력 형식 → 동료 소환 | possible | 동료 소환, Companion Gacha | — |
| 시스템 태그 출력 형식 → 유물 획득 | possible | 유물, 유물 가챠, Relic | — |
| 시스템 태그 출력 형식 → 시설 건설 | possible | Facility | — |
| 시스템 태그 출력 형식 → 스킬 습득 | possible | 스킬, Skill | — |
| 시스템 태그 출력 형식 → 보급품 | possible | 보급품, Supply, Item | — |
| 시스템 태그 출력 형식 → 커플 가챠 | possible | Couple Item | — |
| 시스템 태그 출력 형식 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 시스템 태그 출력 형식 → 👩 게임마스터 | possible | GM | — |
| 시스템 태그 - 가챠 & 이벤트 → 던전 | possible | 던전, Dungeon, floor, guardian | — |
| 시스템 태그 - 가챠 & 이벤트 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, floor, guardian | — |
| 시스템 태그 - 가챠 & 이벤트 → 마나 시스템 규칙 | possible | 마나, mana, 회복 | — |
| 시스템 태그 - 가챠 & 이벤트 → 허기 시스템 규칙 | possible | hunger, eat | — |
| 시스템 태그 - 가챠 & 이벤트 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY, 던전 게이트, gate | — |
| 시스템 태그 - 가챠 & 이벤트 → 가챠 규칙 | possible | 가챠, Gacha, Summon, Ticket | — |
| 시스템 태그 - 가챠 & 이벤트 → 시스템 태그 출력 형식 | possible | 시스템 태그, SYSTEM, 출력 형식, POINT, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, DEFEAT, FLOOR, GACHA | — |
| 시스템 태그 - 가챠 & 이벤트 → 차원 주머니 시스템 | possible | inventory | — |
| 시스템 태그 - 가챠 & 이벤트 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 시스템 태그 - 가챠 & 이벤트 → 스킬·아이템·유물·시설 효과 설명 | possible | 회복, use, heal, effect, skill, item, relic, facility | — |
| 시스템 태그 - 가챠 & 이벤트 → Stat System (ATK / DEF / LUCK) | possible | ATK, DEF, 가챠 | — |
| 시스템 태그 - 가챠 & 이벤트 → 동료 소환 | possible | 동료 소환 | — |
| 시스템 태그 - 가챠 & 이벤트 → 유물 획득 | possible | Relic | — |
| 시스템 태그 - 가챠 & 이벤트 → 시설 건설 | possible | Facility | — |
| 시스템 태그 - 가챠 & 이벤트 → 스킬 습득 | possible | Skill | — |
| 시스템 태그 - 가챠 & 이벤트 → 보급품 | possible | Supply, Item | — |
| 시스템 태그 - 가챠 & 이벤트 → 커플 가챠 | possible | Couple Item | — |
| 시스템 태그 - 가챠 & 이벤트 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 전투 판정 시스템 → 던전 | possible | Dungeon, 층, 보스, 성역, floor, boss, guardian | — |
| 전투 판정 시스템 → 던전 서사형 GM 가이드 | possible | Dungeon, 층, 보스, 성역, floor, boss, guardian, 함정, trap | — |
| 전투 판정 시스템 → 마나 시스템 규칙 | possible | 마나, 충전, mana, charge, recharge | — |
| 전투 판정 시스템 → 허기 시스템 규칙 | possible | 허기, hunger, eat, cook | — |
| 전투 판정 시스템 → 최대 스탯 규칙 | possible | MAX | — |
| 전투 판정 시스템 → 가챠 규칙 | possible | 가챠, Gacha, Sanctuary | — |
| 전투 판정 시스템 → 섬 환경 | possible | 지형, 섬, Island | — |
| 전투 판정 시스템 → 섬 개발 단계 시스템 | possible | island stage | — |
| 전투 판정 시스템 → 층 컨디션 시스템 | possible | floor condition, 저주받은 땅 | — |
| 전투 판정 시스템 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, DUNGEON, DEFEAT, FLOOR, GACHA, STATUS_PANEL | — |
| 전투 판정 시스템 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DEFEAT | — |
| 전투 판정 시스템 → 변수 & 액티브 활용 가이드 | possible | 변수, 액티브, 활용, cv_, party pool | — |
| 전투 판정 시스템 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 스킬, use, equip, heal, effect, skill | — |
| 전투 판정 시스템 → Stat System (ATK / DEF / LUCK) | possible | DEF, LUCK, 스킬, 가챠 | — |
| 전투 판정 시스템 → 시설 건설 | possible | Build | — |
| 전투 판정 시스템 → 스킬 습득 | possible | 스킬, Skill, Ability | — |
| 전투 판정 시스템 → 보급품 | possible | Supply | — |
| 전투 판정 시스템 → 👩 이노우에 오리히메 | possible | 오리히메 | — |
| 전투 판정 시스템 → 👩 마츠모토 란기쿠 | possible | 란기쿠 | — |
| 전투 판정 시스템 → 👩 티아 하리벨 | possible | 하리벨 | — |
| 전투 판정 시스템 → 👩 셀레스틴 루클루스 | possible | 셀레스틴 | — |
| 전투 판정 시스템 → 👩 라이덴 쇼군 | possible | Ei | — |
| 전투 판정 시스템 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 전투 판정 시스템 → 👩 츠카츠키 리오 | possible | Rio | — |
| 전투 판정 시스템 → 👩 페코린느 | possible | 페코린느 | — |
| 전투 판정 시스템 → 👩 게임마스터 | possible | GM | — |
| 차원 주머니 시스템 → 던전 | possible | 던전, Dungeon, 성역, floor | — |
| 차원 주머니 시스템 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 성역, floor, trap | — |
| 차원 주머니 시스템 → 마나 시스템 규칙 | possible | mana, 회복 | — |
| 차원 주머니 시스템 → 허기 시스템 규칙 | possible | 음식, 식사, hunger, food, eat | — |
| 차원 주머니 시스템 → 가챠 규칙 | possible | 가챠, Gacha, 성소, Sanctuary | — |
| 차원 주머니 시스템 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 차원 주머니 시스템 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 차원 주머니 시스템 → 전투 판정 시스템 | possible | combat, monster | — |
| 차원 주머니 시스템 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 차원 주머니 시스템 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, use, drink, effect, item | — |
| 차원 주머니 시스템 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 차원 주머니 시스템 → 보급품 | possible | Supply, Item | — |
| 차원 주머니 시스템 → 커플 가챠 | possible | Couple Gacha, Couple Item | — |
| 차원 주머니 시스템 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 시설 노동 & 동료 일과 시스템 → 던전 | possible | Dungeon, floor | — |
| 시설 노동 & 동료 일과 시스템 → 던전 서사형 GM 가이드 | possible | Dungeon, floor | — |
| 시설 노동 & 동료 일과 시스템 → 마나 시스템 규칙 | possible | 마나, mana, 회복 | — |
| 시설 노동 & 동료 일과 시스템 → 허기 시스템 규칙 | possible | 배고픔, 음식, hunger, food, eat, cook | — |
| 시설 노동 & 동료 일과 시스템 → 최대 스탯 규칙 | possible | MAX | — |
| 시설 노동 & 동료 일과 시스템 → 가챠 규칙 | possible | 가챠, Gacha, Summon, 성소 | — |
| 시설 노동 & 동료 일과 시스템 → 섬 환경 | possible | 섬, Island, Region | — |
| 시설 노동 & 동료 일과 시스템 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 시설 노동 & 동료 일과 시스템 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR, DUNGEON_EXIT | — |
| 시설 노동 & 동료 일과 시스템 → 전투 판정 시스템 | possible | monster | — |
| 시설 노동 & 동료 일과 시스템 → 차원 주머니 시스템 | possible | 음식, storage | — |
| 시설 노동 & 동료 일과 시스템 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, 효과, 아이템, 시설, use, effect, item, facility | — |
| 시설 노동 & 동료 일과 시스템 → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 시설 노동 & 동료 일과 시스템 → 시설 건설 | possible | 시설, Facility, Build | — |
| 시설 노동 & 동료 일과 시스템 → 보급품 | possible | 보급품, 아이템, 보급품 가챠, Supply, Item | — |
| 시설 노동 & 동료 일과 시스템 → 👩 이노우에 오리히메 | possible | 오리히메, Orihime | — |
| 시설 노동 & 동료 일과 시스템 → 👩 마츠모토 란기쿠 | possible | 란기쿠 | — |
| 시설 노동 & 동료 일과 시스템 → 👩 티아 하리벨 | possible | 하리벨, Harribel | — |
| 시설 노동 & 동료 일과 시스템 → 👩 베르스타몬 | possible | 베르스타몬 | — |
| 시설 노동 & 동료 일과 시스템 → 👩 올가 디스코르디아 | possible | 올가, Olga | — |
| 시설 노동 & 동료 일과 시스템 → 👩 보아 핸콕 | possible | Hancock | — |
| 시설 노동 & 동료 일과 시스템 → 👩 라이덴 쇼군 | possible | Ei | — |
| 시설 노동 & 동료 일과 시스템 → 👩 시라누이 마이 | possible | Mai | — |
| 시설 노동 & 동료 일과 시스템 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 시설 노동 & 동료 일과 시스템 → 👩 게임마스터 | possible | GM | — |
| 변수 & 액티브 활용 가이드 → 던전 | possible | Dungeon, 층, floor | — |
| 변수 & 액티브 활용 가이드 → 던전 서사형 GM 가이드 | possible | Dungeon, 층, floor | — |
| 변수 & 액티브 활용 가이드 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 변수 & 액티브 활용 가이드 → 허기 시스템 규칙 | possible | 허기, hunger | — |
| 변수 & 액티브 활용 가이드 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY, gate | — |
| 변수 & 액티브 활용 가이드 → 최대 스탯 규칙 | possible | MAX | — |
| 변수 & 액티브 활용 가이드 → 가챠 규칙 | possible | 가챠, Gacha | — |
| 변수 & 액티브 활용 가이드 → 섬 환경 | possible | Island | — |
| 변수 & 액티브 활용 가이드 → 섬 개발 단계 시스템 | possible | 풍요, island stage | — |
| 변수 & 액티브 활용 가이드 → 층 컨디션 시스템 | possible | floor condition, 축복받은 땅, 마나 과잉, 풍요의 기운, 저주받은 땅, 마나 고갈 | — |
| 변수 & 액티브 활용 가이드 → GAME OVER 규칙 | possible | GAME OVER, gameover, cv_gameOver | — |
| 변수 & 액티브 활용 가이드 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, FLOOR, GACHA, STATUS_PANEL | — |
| 변수 & 액티브 활용 가이드 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, FLOOR, 클리어 | — |
| 변수 & 액티브 활용 가이드 → 전투 판정 시스템 | possible | 전투, 판정, combat | — |
| 변수 & 액티브 활용 가이드 → 차원 주머니 시스템 | possible | inventory, storage | — |
| 변수 & 액티브 활용 가이드 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, effect, skill, item, relic, facility, building | — |
| 변수 & 액티브 활용 가이드 → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 변수 & 액티브 활용 가이드 → 유물 획득 | possible | Relic | — |
| 변수 & 액티브 활용 가이드 → 시설 건설 | possible | Facility, Build | — |
| 변수 & 액티브 활용 가이드 → 스킬 습득 | possible | Skill | — |
| 변수 & 액티브 활용 가이드 → 보급품 | possible | Item | — |
| 변수 & 액티브 활용 가이드 → 👩 티아 하리벨 | possible | 하리벨 | — |
| 변수 & 액티브 활용 가이드 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 현재 주요 수치 → 던전 | possible | Dungeon | — |
| 현재 주요 수치 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 현재 주요 수치 → 마나 시스템 규칙 | possible | 마나, mana, charge, recharge | — |
| 현재 주요 수치 → 허기 시스템 규칙 | possible | hunger | — |
| 현재 주요 수치 → 날짜 & 던전 게이트 규칙 | possible | gate | — |
| 현재 주요 수치 → 최대 스탯 규칙 | possible | MAX | — |
| 현재 주요 수치 → 시스템 태그 출력 형식 | possible | POINT, HP, MANA, HUNGER, ITEM, DUNGEON, STATUS_PANEL | — |
| 현재 주요 수치 → 전투 판정 시스템 | possible | combat | — |
| 현재 주요 수치 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 현재 주요 수치 → 스킬·아이템·유물·시설 효과 설명 | possible | 장착, use, equip, effect, skill, item, relic | — |
| 현재 주요 수치 → Stat System (ATK / DEF / LUCK) | possible | ATK, DEF, LUCK, 장착 | — |
| 현재 주요 수치 → 유물 획득 | possible | Relic | — |
| 현재 주요 수치 → 스킬 습득 | possible | Skill | — |
| 현재 주요 수치 → 보급품 | possible | Item | — |
| 현재 주요 수치 → 👩 시라누이 마이 | possible | Mai | — |
| 현재 주요 수치 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 스킬·아이템·유물·시설 효과 설명 → 시스템 태그 출력 형식 | possible | ITEM | — |
| 스킬·아이템·유물·시설 효과 설명 → 변수 & 액티브 활용 가이드 | possible | variable, cv_ | — |
| 스킬·아이템·유물·시설 효과 설명 → Stat System (ATK / DEF / LUCK) | possible | 스킬, 유물 | — |
| 스킬·아이템·유물·시설 효과 설명 → 유물 획득 | possible | 유물, Relic | — |
| 스킬·아이템·유물·시설 효과 설명 → 시설 건설 | possible | Facility | — |
| 스킬·아이템·유물·시설 효과 설명 → 스킬 습득 | possible | 스킬, Skill | — |
| 스킬·아이템·유물·시설 효과 설명 → 보급품 | possible | 아이템, Item | — |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 던전 | blocked | Dungeon | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 던전 서사형 GM 가이드 | blocked | Dungeon | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 마나 시스템 규칙 | blocked | mana | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 허기 시스템 규칙 | blocked | hunger, eat | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 가챠 규칙 | blocked | Sanctuary | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 시스템 태그 출력 형식 | blocked | SYSTEM, POINT, HP, MANA, HUNGER, DUNGEON, STATUS_TIP, STATUS_PANEL | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 변수 & 액티브 활용 가이드 | blocked | cv_ | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 👩 시라누이 마이 | blocked | Mai | source-recursion-disabled |
| AUX 모드 — img + STATUS_TIP 금지 (기본 ON, cv_auxMode=0 시만 OFF) → 👩 루시엘라 R. 사워크림 | blocked | Lu | source-recursion-disabled |
| Stat System (ATK / DEF / LUCK) → 던전 | possible | Dungeon | — |
| Stat System (ATK / DEF / LUCK) → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| Stat System (ATK / DEF / LUCK) → 마나 시스템 규칙 | possible | mana, 회복 | — |
| Stat System (ATK / DEF / LUCK) → 허기 시스템 규칙 | possible | hunger, eat | — |
| Stat System (ATK / DEF / LUCK) → 최대 스탯 규칙 | possible | MAX | — |
| Stat System (ATK / DEF / LUCK) → 가챠 규칙 | possible | 가챠, Gacha, Sanctuary | — |
| Stat System (ATK / DEF / LUCK) → 섬 개발 단계 시스템 | possible | 요새 | — |
| Stat System (ATK / DEF / LUCK) → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, DUNGEON, GACHA, STATUS_PANEL | — |
| Stat System (ATK / DEF / LUCK) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| Stat System (ATK / DEF / LUCK) → 전투 판정 시스템 | possible | 전투, 공격, combat, attack, monster | — |
| Stat System (ATK / DEF / LUCK) → 시설 노동 & 동료 일과 시스템 | possible | 생산 | — |
| Stat System (ATK / DEF / LUCK) → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| Stat System (ATK / DEF / LUCK) → 스킬·아이템·유물·시설 효과 설명 | possible | 장착, 회복, 효과, use, equip, effect, skill, item, relic, facility | — |
| Stat System (ATK / DEF / LUCK) → 유물 획득 | possible | Relic | — |
| Stat System (ATK / DEF / LUCK) → 시설 건설 | possible | Facility | — |
| Stat System (ATK / DEF / LUCK) → 스킬 습득 | possible | Skill, Ability | — |
| Stat System (ATK / DEF / LUCK) → 보급품 | possible | 보급품, Supply, Item | — |
| Stat System (ATK / DEF / LUCK) → 👩 라이덴 쇼군 | possible | Ei | — |
| Stat System (ATK / DEF / LUCK) → 👩 시라누이 마이 | possible | Mai | — |
| Stat System (ATK / DEF / LUCK) → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| Forge System (Tier-up Synthesis) → 허기 시스템 규칙 | possible | eat | — |
| Forge System (Tier-up Synthesis) → 가챠 규칙 | possible | Gacha | — |
| Forge System (Tier-up Synthesis) → 시스템 태그 출력 형식 | possible | SYSTEM, ITEM, GACHA | — |
| Forge System (Tier-up Synthesis) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| Forge System (Tier-up Synthesis) → 전투 판정 시스템 | possible | attack | — |
| Forge System (Tier-up Synthesis) → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| Forge System (Tier-up Synthesis) → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill, item, relic, facility | — |
| Forge System (Tier-up Synthesis) → Stat System (ATK / DEF / LUCK) | possible | LUCK | — |
| Forge System (Tier-up Synthesis) → 유물 획득 | possible | Relic | — |
| Forge System (Tier-up Synthesis) → 시설 건설 | possible | Facility | — |
| Forge System (Tier-up Synthesis) → 스킬 습득 | possible | Skill | — |
| Forge System (Tier-up Synthesis) → 보급품 | possible | Item | — |
| Forge System (Tier-up Synthesis) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 던전 | possible | Dungeon, floor | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 던전 서사형 GM 가이드 | possible | Dungeon, floor | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 허기 시스템 규칙 | possible | hunger | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 가챠 규칙 | possible | 가챠, Gacha, 성소 | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 섬 환경 | possible | 섬 | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 전투 판정 시스템 | possible | combat | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 시설 노동 & 동료 일과 시스템 | possible | facility labor | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, use, activate, skill, item, facility | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 시설 건설 | possible | Facility | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 스킬 습득 | possible | Skill | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 보급품 | possible | 보급품, Supply, Item | — |
| 🧭 🌲 서쪽숲 탐색 — selective (EXPLORE 태그 활성) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 던전 | possible | Dungeon, floor | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 던전 서사형 GM 가이드 | possible | Dungeon, floor | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 허기 시스템 규칙 | possible | hunger | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 가챠 규칙 | possible | 가챠, Gacha, 성소 | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 섬 환경 | possible | 섬 | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 전투 판정 시스템 | possible | combat | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 시설 노동 & 동료 일과 시스템 | possible | facility labor | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, use, activate, skill, item, facility | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 시설 건설 | possible | Facility | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 스킬 습득 | possible | Skill | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 보급품 | possible | 보급품, Supply, Item | — |
| 🧭 🏜 동쪽 사막 탐색 — selective (EXPLORE 태그 활성) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 던전 | possible | Dungeon, floor | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 던전 서사형 GM 가이드 | possible | Dungeon, floor, 함정 | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 허기 시스템 규칙 | possible | hunger | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 가챠 규칙 | possible | 가챠, Gacha, 성소 | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 섬 환경 | possible | 섬 | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 전투 판정 시스템 | possible | combat | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 시설 노동 & 동료 일과 시스템 | possible | facility labor | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, use, activate, skill, item, facility | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 시설 건설 | possible | Facility | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 스킬 습득 | possible | Skill | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 보급품 | possible | 보급품, Supply, Item | — |
| 🧭 🌊 남쪽해변 탐색 — selective (EXPLORE 태그 활성) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 던전 | possible | Dungeon, floor | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 던전 서사형 GM 가이드 | possible | Dungeon, floor | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 허기 시스템 규칙 | possible | hunger | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 가챠 규칙 | possible | 가챠, Gacha, 성소 | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 섬 환경 | possible | 섬 | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, HUNGER, ITEM, DUNGEON, FLOOR, GACHA | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, FLOOR | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 전투 판정 시스템 | possible | combat | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 시설 노동 & 동료 일과 시스템 | possible | facility labor | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, use, activate, skill, item, facility | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 시설 건설 | possible | Facility | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 스킬 습득 | possible | Skill | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 보급품 | possible | 보급품, Supply, Item | — |
| 🧭 🏔 북쪽 산맥 탐색 — selective (EXPLORE 태그 활성) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 동료 소환 → 마나 시스템 규칙 | possible | 마나 | — |
| 동료 소환 → 허기 시스템 규칙 | possible | eat | — |
| 동료 소환 → 가챠 규칙 | possible | 가챠, 뽑기, Gacha, Summon, 성소, 가챠 머신, Sanctuary | — |
| 동료 소환 → 섬 환경 | possible | 섬, Island | — |
| 동료 소환 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, ITEM, GACHA, STATUS_TIP | — |
| 동료 소환 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 동료 소환 → 전투 판정 시스템 | possible | battle, fight | — |
| 동료 소환 → 차원 주머니 시스템 | possible | inventory | — |
| 동료 소환 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 동료 소환 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, use, skill, item | — |
| 동료 소환 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 동료 소환 → 스킬 습득 | possible | Skill | — |
| 동료 소환 → 보급품 | possible | Item | — |
| 동료 소환 → 👩 라이덴 쇼군 | possible | Ei | — |
| 동료 소환 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 동료 소환 → 👩 게임마스터 | possible | Gamemaster, GM | — |
| 유물 획득 → 시스템 나레이션 & 조언 사용 가이드 | possible | 던전 진입 | — |
| 유물 획득 → 던전 | possible | 던전, Dungeon, 보스, 성역 | — |
| 유물 획득 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, 보스, 성역 | — |
| 유물 획득 → 마나 시스템 규칙 | possible | 마나, 충전, mana, 마나 충전, 회복 | — |
| 유물 획득 → 허기 시스템 규칙 | possible | 허기, 음식, hunger, eat | — |
| 유물 획득 → 날짜 & 던전 게이트 규칙 | possible | NEW_DAY | — |
| 유물 획득 → 최대 스탯 규칙 | possible | MAX | — |
| 유물 획득 → 가챠 규칙 | possible | Gacha | — |
| 유물 획득 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, NEW_DAY, DUNGEON, GACHA | — |
| 유물 획득 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA, NEW_DAY, 던전 진입 | — |
| 유물 획득 → 전투 판정 시스템 | possible | 전투, combat, attack | — |
| 유물 획득 → 차원 주머니 시스템 | possible | 음식 | — |
| 유물 획득 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 유물 획득 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, 효과, 스킬, use, activate, equip, heal, effect, item, relic | — |
| 유물 획득 → Stat System (ATK / DEF / LUCK) | possible | 스탯, ATK, DEF, LUCK, 행운, 스킬 | — |
| 유물 획득 → 스킬 습득 | possible | 스킬, Ability | — |
| 유물 획득 → 보급품 | possible | Item | — |
| 유물 획득 → 👩 라이덴 쇼군 | possible | Ei | — |
| 유물 획득 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 유물 획득 → 👩 미래 | possible | 미래 | — |
| 시설 건설 → 마나 시스템 규칙 | possible | 충전, mana | — |
| 시설 건설 → 허기 시스템 규칙 | possible | 허기, food, eat | — |
| 시설 건설 → 가챠 규칙 | possible | 가챠, Gacha, 성소, Sanctuary | — |
| 시설 건설 → 섬 환경 | possible | 지형, 환경, 섬, Island, Region | — |
| 시설 건설 → 섬 개발 단계 시스템 | possible | 요새 | — |
| 시설 건설 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, ITEM, GACHA | — |
| 시설 건설 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 시설 건설 → 전투 판정 시스템 | possible | 전투, combat, attack | — |
| 시설 건설 → 시설 노동 & 동료 일과 시스템 | possible | 시설 노동, 노동, 동료 일과, production | — |
| 시설 건설 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 시설 건설 → 스킬·아이템·유물·시설 효과 설명 | possible | 장착, 효과, 시설, 건물, use, equip, effect, skill, item, relic, facility | — |
| 시설 건설 → Stat System (ATK / DEF / LUCK) | possible | DEF, LUCK, 장착, 가챠 | — |
| 시설 건설 → 유물 획득 | possible | Relic | — |
| 시설 건설 → 스킬 습득 | possible | Skill, Ability | — |
| 시설 건설 → 보급품 | possible | 보급품, Item | — |
| 시설 건설 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 시설 건설 → 👩 츠카츠키 리오 | possible | Rio | — |
| 시설 건설 → 👩 미래 | possible | 미래 | — |
| 스킬 습득 → 던전 | possible | 던전, Dungeon | — |
| 스킬 습득 → 던전 서사형 GM 가이드 | possible | 던전, Dungeon, trap | — |
| 스킬 습득 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 스킬 습득 → 허기 시스템 규칙 | possible | eat, cook | — |
| 스킬 습득 → 가챠 규칙 | possible | Gacha, Draw, Gacha Machine | — |
| 스킬 습득 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, DUNGEON, GACHA | — |
| 스킬 습득 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 스킬 습득 → 전투 판정 시스템 | possible | 공격, 판정, combat, attack, fight, monster | — |
| 스킬 습득 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 스킬 습득 → 스킬·아이템·유물·시설 효과 설명 | possible | 효과, 스킬, use, effect, skill, building | — |
| 스킬 습득 → Stat System (ATK / DEF / LUCK) | possible | DEF, LUCK, 행운, 스킬 | — |
| 스킬 습득 → 시설 건설 | possible | Build | — |
| 스킬 습득 → 👩 라이덴 쇼군 | possible | Ei | — |
| 스킬 습득 → 👩 시라누이 마이 | possible | Mai | — |
| 스킬 습득 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 스킬 습득 → 👩 츠카츠키 리오 | possible | Rio | — |
| 보급품 → 던전 서사형 GM 가이드 | possible | 함정, trap | — |
| 보급품 → 마나 시스템 규칙 | possible | 마나, mana, charge, 회복 | — |
| 보급품 → 허기 시스템 규칙 | possible | 배고픔, hunger, eat | — |
| 보급품 → 최대 스탯 규칙 | possible | MAX | — |
| 보급품 → 가챠 규칙 | possible | 가챠, Gacha | — |
| 보급품 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER, ITEM, GACHA | — |
| 보급품 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 보급품 → 차원 주머니 시스템 | possible | dimension pouch | — |
| 보급품 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 보급품 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, 회복, 효과, 아이템, use, effect, item, relic, facility | — |
| 보급품 → Stat System (ATK / DEF / LUCK) | possible | DEF, 가챠 | — |
| 보급품 → 유물 획득 | possible | Relic | — |
| 보급품 → 시설 건설 | possible | Facility | — |
| 보급품 → 스킬 습득 | possible | Ability | — |
| 보급품 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 보급품 → 👩 미래 | possible | 미래 | — |
| 커플 가챠 → 던전 | possible | Dungeon, 성역 | — |
| 커플 가챠 → 던전 서사형 GM 가이드 | possible | Dungeon, 성역 | — |
| 커플 가챠 → 마나 시스템 규칙 | possible | 마나, 충전, mana, charge, 회복 | — |
| 커플 가챠 → 허기 시스템 규칙 | possible | eat | — |
| 커플 가챠 → 최대 스탯 규칙 | possible | MAX | — |
| 커플 가챠 → 가챠 규칙 | possible | 가챠, Gacha, 성소 | — |
| 커플 가챠 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, MANA, ITEM, DUNGEON, GACHA | — |
| 커플 가챠 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 커플 가챠 → 전투 판정 시스템 | possible | combat, attack | — |
| 커플 가챠 → 차원 주머니 시스템 | possible | inventory | — |
| 커플 가챠 → 변수 & 액티브 활용 가이드 | possible | cv_ | — |
| 커플 가챠 → 스킬·아이템·유물·시설 효과 설명 | possible | 회복, 효과, use, effect, item | — |
| 커플 가챠 → Stat System (ATK / DEF / LUCK) | possible | DEF, LUCK, 가챠 | — |
| 커플 가챠 → 스킬 습득 | possible | Ability | — |
| 커플 가챠 → 보급품 | possible | Item | — |
| 커플 가챠 → 👩 라이덴 쇼군 | possible | Ei | — |
| 커플 가챠 → 👩 시라누이 마이 | possible | Mai, 마이 | — |
| 커플 가챠 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 커플 가챠 → 👩 미래 | possible | 미래 | — |
| 랜덤 가챠 → 가챠 규칙 | possible | 가챠, Gacha, Summon, Ticket | — |
| 랜덤 가챠 → 시스템 태그 출력 형식 | possible | SYSTEM, tag format, POINT, ITEM, GACHA | — |
| 랜덤 가챠 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 랜덤 가챠 → 스킬·아이템·유물·시설 효과 설명 | possible | 사용, use, effect, skill, item, relic, facility | — |
| 랜덤 가챠 → Stat System (ATK / DEF / LUCK) | possible | 가챠 | — |
| 랜덤 가챠 → 동료 소환 | possible | 동료 소환 | — |
| 랜덤 가챠 → 유물 획득 | possible | Relic | — |
| 랜덤 가챠 → 시설 건설 | possible | Facility | — |
| 랜덤 가챠 → 스킬 습득 | possible | Skill | — |
| 랜덤 가챠 → 보급품 | possible | Supply, Item | — |
| 랜덤 가챠 → 커플 가챠 | possible | 커플 가챠 | — |
| 랜덤 가챠 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 이노우에 오리히메 → 마나 시스템 규칙 | possible | 마나, mana, kiss | — |
| 👩 이노우에 오리히메 → 허기 시스템 규칙 | possible | food | — |
| 👩 이노우에 오리히메 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 이노우에 오리히메 → 전투 판정 시스템 | possible | 공격, 판정, attack | — |
| 👩 이노우에 오리히메 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 이노우에 오리히메 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill | — |
| 👩 이노우에 오리히메 → 스킬 습득 | possible | Skill | — |
| 👩 이노우에 오리히메 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 이노우에 오리히메 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 이노우에 오리히메 → 👩 헬름 | possible | Helm | — |
| 👩 마츠모토 란기쿠 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 마츠모토 란기쿠 → 마나 시스템 규칙 | possible | mana | — |
| 👩 마츠모토 란기쿠 → 허기 시스템 규칙 | possible | eat | — |
| 👩 마츠모토 란기쿠 → 가챠 규칙 | possible | Draw | — |
| 👩 마츠모토 란기쿠 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 마츠모토 란기쿠 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 마츠모토 란기쿠 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 마츠모토 란기쿠 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 마츠모토 란기쿠 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 마츠모토 란기쿠 → 스킬 습득 | possible | Skill | — |
| 👩 마츠모토 란기쿠 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 시호인 요루이치 → 마나 시스템 규칙 | possible | mana | — |
| 👩 시호인 요루이치 → 허기 시스템 규칙 | possible | eat | — |
| 👩 시호인 요루이치 → 가챠 규칙 | possible | Draw | — |
| 👩 시호인 요루이치 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 시호인 요루이치 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 시호인 요루이치 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 시호인 요루이치 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 시호인 요루이치 → 스킬 습득 | possible | Skill | — |
| 👩 시호인 요루이치 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 시호인 요루이치 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 👩 시호인 요루이치 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 티아 하리벨 → 마나 시스템 규칙 | possible | mana | — |
| 👩 티아 하리벨 → 허기 시스템 규칙 | possible | eat | — |
| 👩 티아 하리벨 → 최대 스탯 규칙 | possible | MAX | — |
| 👩 티아 하리벨 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 티아 하리벨 → 전투 판정 시스템 | possible | 공격, attack, battle, fight | — |
| 👩 티아 하리벨 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 티아 하리벨 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 티아 하리벨 → 스킬 습득 | possible | Skill | — |
| 👩 티아 하리벨 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 엔젤우몬 → 던전 | possible | guardian | — |
| 👩 엔젤우몬 → 던전 서사형 GM 가이드 | possible | guardian | — |
| 👩 엔젤우몬 → 마나 시스템 규칙 | possible | mana, charge | — |
| 👩 엔젤우몬 → 허기 시스템 규칙 | possible | eat | — |
| 👩 엔젤우몬 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 엔젤우몬 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 엔젤우몬 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 엔젤우몬 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 엔젤우몬 → 스킬 습득 | possible | Skill | — |
| 👩 엔젤우몬 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 엔젤우몬 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 엔젤우몬 → 👩 헬름 | possible | Helm | — |
| 👩 레이디데블몬 → 던전 서사형 GM 가이드 | possible | trap | — |
| 👩 레이디데블몬 → 마나 시스템 규칙 | possible | mana | — |
| 👩 레이디데블몬 → 허기 시스템 규칙 | possible | eat | — |
| 👩 레이디데블몬 → 날짜 & 던전 게이트 규칙 | possible | gate | — |
| 👩 레이디데블몬 → 가챠 규칙 | possible | Summon | — |
| 👩 레이디데블몬 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 레이디데블몬 → 전투 판정 시스템 | possible | 공격, combat | — |
| 👩 레이디데블몬 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 레이디데블몬 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill | — |
| 👩 레이디데블몬 → 스킬 습득 | possible | Skill, Ability | — |
| 👩 레이디데블몬 → 👩 엔젤우몬 | possible | Angewomon | — |
| 👩 레이디데블몬 → 👩 범황 | possible | Devi | — |
| 👩 레이디데블몬 → 👩 다크니스 | possible | 다크니스, Darkness | — |
| 👩 베르스타몬 → 마나 시스템 규칙 | possible | mana | — |
| 👩 베르스타몬 → 허기 시스템 규칙 | possible | eat | — |
| 👩 베르스타몬 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 베르스타몬 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 베르스타몬 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 베르스타몬 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 베르스타몬 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 베르스타몬 → 스킬 습득 | possible | Skill | — |
| 👩 베르스타몬 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 셀레스틴 루클루스 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 셀레스틴 루클루스 → 허기 시스템 규칙 | possible | eat | — |
| 👩 셀레스틴 루클루스 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA | — |
| 👩 셀레스틴 루클루스 → 전투 판정 시스템 | possible | 판정 | — |
| 👩 셀레스틴 루클루스 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 셀레스틴 루클루스 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, effect, skill | — |
| 👩 셀레스틴 루클루스 → 스킬 습득 | possible | Skill | — |
| 👩 셀레스틴 루클루스 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 셀레스틴 루클루스 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 👩 셀레스틴 루클루스 → 👩 헬름 | possible | Helm | — |
| 👩 올가 디스코르디아 → 마나 시스템 규칙 | possible | mana | — |
| 👩 올가 디스코르디아 → 허기 시스템 규칙 | possible | eat | — |
| 👩 올가 디스코르디아 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 올가 디스코르디아 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 올가 디스코르디아 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 올가 디스코르디아 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 올가 디스코르디아 → 스킬 습득 | possible | Skill | — |
| 👩 올가 디스코르디아 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 올가 디스코르디아 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 올가 디스코르디아 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 올가 디스코르디아 → 👩 헬름 | possible | Helm | — |
| 👩 올가 디스코르디아 → 👩 다크니스 | possible | Darkness | — |
| 👩 보아 핸콕 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 보아 핸콕 → 마나 시스템 규칙 | possible | mana | — |
| 👩 보아 핸콕 → 허기 시스템 규칙 | possible | eat | — |
| 👩 보아 핸콕 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 보아 핸콕 → 전투 판정 시스템 | possible | 공격, combat, attack | — |
| 👩 보아 핸콕 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 보아 핸콕 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 보아 핸콕 → 스킬 습득 | possible | Skill | — |
| 👩 보아 핸콕 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 보아 핸콕 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 보아 핸콕 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 보아 핸콕 → 👩 헬름 | possible | Helm | — |
| 👩 보아 핸콕 → 👩 게임마스터 | possible | GM | — |
| 👩 아르토리아 펜드래곤 (랜서) → 마나 시스템 규칙 | possible | mana, charge | — |
| 👩 아르토리아 펜드래곤 (랜서) → 허기 시스템 규칙 | possible | food, eat | — |
| 👩 아르토리아 펜드래곤 (랜서) → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 아르토리아 펜드래곤 (랜서) → 전투 판정 시스템 | possible | 공격 | — |
| 👩 아르토리아 펜드래곤 (랜서) → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 아르토리아 펜드래곤 (랜서) → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 아르토리아 펜드래곤 (랜서) → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 아르토리아 펜드래곤 (랜서) → 스킬 습득 | possible | Skill | — |
| 👩 아르토리아 펜드래곤 (랜서) → 👩 시라누이 마이 | possible | Mai | — |
| 👩 아르토리아 펜드래곤 (랜서) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 아르토리아 펜드래곤 (랜서) → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 아르토리아 얼터 (랜서) → 마나 시스템 규칙 | possible | mana, charge | — |
| 👩 아르토리아 얼터 (랜서) → 허기 시스템 규칙 | possible | eat | — |
| 👩 아르토리아 얼터 (랜서) → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 아르토리아 얼터 (랜서) → 전투 판정 시스템 | possible | 공격, fight | — |
| 👩 아르토리아 얼터 (랜서) → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 아르토리아 얼터 (랜서) → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 아르토리아 얼터 (랜서) → 스킬 습득 | possible | Skill | — |
| 👩 아르토리아 얼터 (랜서) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 미나모토노 라이코 → 마나 시스템 규칙 | possible | mana | — |
| 👩 미나모토노 라이코 → 허기 시스템 규칙 | possible | eat | — |
| 👩 미나모토노 라이코 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 미나모토노 라이코 → 전투 판정 시스템 | possible | monster | — |
| 👩 미나모토노 라이코 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 미나모토노 라이코 → 스킬 습득 | possible | Skill | — |
| 👩 미나모토노 라이코 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 미나모토노 라이코 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 미나모토노 라이코 → 👩 헬름 | possible | Helm | — |
| 👩 2B → 마나 시스템 규칙 | possible | mana | — |
| 👩 2B → 허기 시스템 규칙 | possible | eat | — |
| 👩 2B → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 2B → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 2B → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 2B → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 2B → 스킬 습득 | possible | Skill | — |
| 👩 2B → 👩 시라누이 마이 | possible | Mai | — |
| 👩 2B → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 2B → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 블랙 매지션 걸 → 마나 시스템 규칙 | possible | mana | — |
| 👩 블랙 매지션 걸 → 허기 시스템 규칙 | possible | eat | — |
| 👩 블랙 매지션 걸 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 블랙 매지션 걸 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 블랙 매지션 걸 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 블랙 매지션 걸 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 블랙 매지션 걸 → 스킬 습득 | possible | Skill | — |
| 👩 블랙 매지션 걸 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 블랙 매지션 걸 → 👩 헬름 | possible | Helm | — |
| 👩 사무스 아란 → 마나 시스템 규칙 | possible | mana, charge | — |
| 👩 사무스 아란 → 허기 시스템 규칙 | possible | eat | — |
| 👩 사무스 아란 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 사무스 아란 → 전투 판정 시스템 | possible | 공격, fight | — |
| 👩 사무스 아란 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 사무스 아란 → 스킬·아이템·유물·시설 효과 설명 | possible | use, activate, effect, skill | — |
| 👩 사무스 아란 → 스킬 습득 | possible | Skill | — |
| 👩 사무스 아란 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 사무스 아란 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 인조인간 18호 → 마나 시스템 규칙 | possible | mana | — |
| 👩 인조인간 18호 → 허기 시스템 규칙 | possible | eat | — |
| 👩 인조인간 18호 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 인조인간 18호 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 인조인간 18호 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 인조인간 18호 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 인조인간 18호 → 스킬 습득 | possible | Skill | — |
| 👩 인조인간 18호 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 인조인간 18호 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 인조인간 18호 → 👩 헬름 | possible | Helm | — |
| 👩 인조인간 18호 → 👩 게임마스터 | possible | GM | — |
| 👩 페른 → 마나 시스템 규칙 | possible | mana | — |
| 👩 페른 → 허기 시스템 규칙 | possible | eat | — |
| 👩 페른 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 페른 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 페른 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 페른 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 페른 → 스킬 습득 | possible | Skill | — |
| 👩 페른 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 페른 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 페른 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 페른 → 👩 게임마스터 | possible | GM | — |
| 👩 후부키 → 던전 | possible | 보스, boss | — |
| 👩 후부키 → 던전 서사형 GM 가이드 | possible | 보스, boss | — |
| 👩 후부키 → 마나 시스템 규칙 | possible | mana | — |
| 👩 후부키 → 허기 시스템 규칙 | possible | eat | — |
| 👩 후부키 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 후부키 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 후부키 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 후부키 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 후부키 → 시설 건설 | possible | Build | — |
| 👩 후부키 → 스킬 습득 | possible | Skill | — |
| 👩 후부키 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 후부키 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 후부키 → 👩 헬름 | possible | Helm | — |
| 👩 도바킨 → 마나 시스템 규칙 | possible | mana | — |
| 👩 도바킨 → 허기 시스템 규칙 | possible | eat | — |
| 👩 도바킨 → 최대 스탯 규칙 | possible | MAX | — |
| 👩 도바킨 → 시스템 태그 출력 형식 | possible | MANA, ITEM | — |
| 👩 도바킨 → 전투 판정 시스템 | possible | 공격, combat, attack, battle | — |
| 👩 도바킨 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 도바킨 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill, item | — |
| 👩 도바킨 → 스킬 습득 | possible | Skill, Ability | — |
| 👩 도바킨 → 보급품 | possible | Item | — |
| 👩 도바킨 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 도바킨 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 도바킨 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 도바킨 → 👩 헬름 | possible | Helm | — |
| 👩 산고 → 던전 서사형 GM 가이드 | possible | trap, hidden | — |
| 👩 산고 → 마나 시스템 규칙 | possible | mana | — |
| 👩 산고 → 허기 시스템 규칙 | possible | eat | — |
| 👩 산고 → 시스템 태그 출력 형식 | possible | HP, MANA | — |
| 👩 산고 → 전투 판정 시스템 | possible | 공격, combat, battle, fight, monster | — |
| 👩 산고 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 산고 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 산고 → 스킬 습득 | possible | Skill | — |
| 👩 산고 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 산고 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 산고 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 요르 포저 → 던전 | possible | floor | — |
| 👩 요르 포저 → 던전 서사형 GM 가이드 | possible | floor | — |
| 👩 요르 포저 → 마나 시스템 규칙 | possible | mana | — |
| 👩 요르 포저 → 허기 시스템 규칙 | possible | eat, cook | — |
| 👩 요르 포저 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA, FLOOR | — |
| 👩 요르 포저 → 시스템 태그 - 가챠 & 이벤트 | possible | FLOOR | — |
| 👩 요르 포저 → 전투 판정 시스템 | possible | 전투, 공격, combat, monster | — |
| 👩 요르 포저 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 👩 요르 포저 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, drink, effect, skill | — |
| 👩 요르 포저 → 스킬 습득 | possible | Skill | — |
| 👩 요르 포저 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 요르 포저 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 요르 포저 → 👩 헬름 | possible | Helm | — |
| 👩 요르 포저 → 👩 게임마스터 | possible | GM | — |
| 👩 이블린 슈발리에 → 마나 시스템 규칙 | possible | mana | — |
| 👩 이블린 슈발리에 → 허기 시스템 규칙 | possible | eat | — |
| 👩 이블린 슈발리에 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 이블린 슈발리에 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 이블린 슈발리에 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 이블린 슈발리에 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 이블린 슈발리에 → 스킬 습득 | possible | Skill, Ability | — |
| 👩 이블린 슈발리에 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 이블린 슈발리에 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 이블린 슈발리에 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 마키마 → 마나 시스템 규칙 | possible | mana | — |
| 👩 마키마 → 허기 시스템 규칙 | possible | eat | — |
| 👩 마키마 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 마키마 → 전투 판정 시스템 | possible | 공격, fight | — |
| 👩 마키마 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 마키마 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 마키마 → 스킬 습득 | possible | Skill | — |
| 👩 마키마 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 마키마 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 마키마 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 마키마 → 👩 범황 | possible | Devi | — |
| 👩 마키마 → 👩 헬름 | possible | Helm | — |
| 👩 마키마 → 👩 게임마스터 | possible | GM | — |
| 👩 라이덴 쇼군 → 마나 시스템 규칙 | possible | mana | — |
| 👩 라이덴 쇼군 → 허기 시스템 규칙 | possible | food, eat, cook | — |
| 👩 라이덴 쇼군 → 가챠 규칙 | possible | Draw | — |
| 👩 라이덴 쇼군 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 라이덴 쇼군 → 전투 판정 시스템 | possible | attack | — |
| 👩 라이덴 쇼군 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 라이덴 쇼군 → 스킬 습득 | possible | Skill | — |
| 👩 라이덴 쇼군 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 라이덴 쇼군 → 👩 게임마스터 | possible | GM | — |
| 👩 신학 → 마나 시스템 규칙 | possible | mana | — |
| 👩 신학 → 허기 시스템 규칙 | possible | eat | — |
| 👩 신학 → 가챠 규칙 | possible | Summon | — |
| 👩 신학 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 신학 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 신학 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 신학 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 신학 → 스킬 습득 | possible | Skill | — |
| 👩 신학 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 신학 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 신학 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 신학 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 신학 → 👩 헬름 | possible | Helm | — |
| 👩 리사 → 마나 시스템 규칙 | possible | mana | — |
| 👩 리사 → 허기 시스템 규칙 | possible | eat | — |
| 👩 리사 → 가챠 규칙 | possible | Summon | — |
| 👩 리사 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 리사 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 리사 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 리사 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, skill | — |
| 👩 리사 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 리사 → 스킬 습득 | possible | Skill | — |
| 👩 리사 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 리사 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 리사 → 👩 헬름 | possible | Helm | — |
| 👩 아를레키노 → 마나 시스템 규칙 | possible | mana | — |
| 👩 아를레키노 → 허기 시스템 규칙 | possible | eat | — |
| 👩 아를레키노 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 아를레키노 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 아를레키노 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 아를레키노 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill | — |
| 👩 아를레키노 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 아를레키노 → 스킬 습득 | possible | Skill | — |
| 👩 아를레키노 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 아를레키노 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 아를레키노 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 아를레키노 → 👩 헬름 | possible | Helm | — |
| 👩 아를레키노 → 👩 게임마스터 | possible | GM | — |
| 👩 바이켄 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 바이켄 → 마나 시스템 규칙 | possible | mana | — |
| 👩 바이켄 → 허기 시스템 규칙 | possible | eat | — |
| 👩 바이켄 → 가챠 규칙 | possible | Summon | — |
| 👩 바이켄 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 바이켄 → 전투 판정 시스템 | possible | 공격, attack, battle | — |
| 👩 바이켄 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 바이켄 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, skill | — |
| 👩 바이켄 → 스킬 습득 | possible | Skill, Ability | — |
| 👩 바이켄 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 바이켄 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 츠나데 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 츠나데 → 허기 시스템 규칙 | possible | eat | — |
| 👩 츠나데 → 가챠 규칙 | possible | Summon | — |
| 👩 츠나데 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 츠나데 → 전투 판정 시스템 | possible | 공격, 판정 | — |
| 👩 츠나데 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 츠나데 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, heal, skill | — |
| 👩 츠나데 → 스킬 습득 | possible | Skill | — |
| 👩 츠나데 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 츠나데 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 츠나데 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 츠나데 → 👩 게임마스터 | possible | GM | — |
| 👩 라이잘린 슈타우트 → 마나 시스템 규칙 | possible | mana | — |
| 👩 라이잘린 슈타우트 → 허기 시스템 규칙 | possible | eat | — |
| 👩 라이잘린 슈타우트 → 시스템 태그 출력 형식 | possible | MANA, ITEM | — |
| 👩 라이잘린 슈타우트 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 라이잘린 슈타우트 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 라이잘린 슈타우트 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill, item | — |
| 👩 라이잘린 슈타우트 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 라이잘린 슈타우트 → 스킬 습득 | possible | Skill | — |
| 👩 라이잘린 슈타우트 → 보급품 | possible | Item | — |
| 👩 라이잘린 슈타우트 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 라이잘린 슈타우트 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 라이잘린 슈타우트 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 칸타렐라 → 마나 시스템 규칙 | possible | mana | — |
| 👩 칸타렐라 → 허기 시스템 규칙 | possible | eat | — |
| 👩 칸타렐라 → 가챠 규칙 | possible | Summon | — |
| 👩 칸타렐라 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 칸타렐라 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 칸타렐라 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 칸타렐라 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, effect, skill | — |
| 👩 칸타렐라 → 스킬 습득 | possible | Skill | — |
| 👩 칸타렐라 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 칸타렐라 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 칸타렐라 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 칸타렐라 → 👩 게임마스터 | possible | GM | — |
| 👩 아델 → 마나 시스템 규칙 | possible | mana | — |
| 👩 아델 → 허기 시스템 규칙 | possible | eat | — |
| 👩 아델 → 가챠 규칙 | possible | Summon | — |
| 👩 아델 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 아델 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 아델 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 아델 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 아델 → 스킬 습득 | possible | Skill | — |
| 👩 아델 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 아델 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 아델 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 쿠기사키 노바라 → 던전 | possible | boss | — |
| 👩 쿠기사키 노바라 → 던전 서사형 GM 가이드 | possible | boss | — |
| 👩 쿠기사키 노바라 → 마나 시스템 규칙 | possible | mana | — |
| 👩 쿠기사키 노바라 → 허기 시스템 규칙 | possible | eat | — |
| 👩 쿠기사키 노바라 → 섬 환경 | possible | 섬 | — |
| 👩 쿠기사키 노바라 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 쿠기사키 노바라 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 쿠기사키 노바라 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 쿠기사키 노바라 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, skill | — |
| 👩 쿠기사키 노바라 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 쿠기사키 노바라 → 스킬 습득 | possible | Skill | — |
| 👩 쿠기사키 노바라 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 쿠기사키 노바라 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 쿠기사키 노바라 → 👩 헬름 | possible | Helm | — |
| 👩 일레그 → 마나 시스템 규칙 | possible | mana, sex | — |
| 👩 일레그 → 허기 시스템 규칙 | possible | eat | — |
| 👩 일레그 → 시스템 태그 출력 형식 | possible | SYSTEM, MANA | — |
| 👩 일레그 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 일레그 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 일레그 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, skill | — |
| 👩 일레그 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 일레그 → 유물 획득 | possible | Artifact | — |
| 👩 일레그 → 스킬 습득 | possible | Skill | — |
| 👩 일레그 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 일레그 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 일레그 → 👩 범황 | possible | Devi | — |
| 👩 코쵸우 시노부 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 코쵸우 시노부 → 허기 시스템 규칙 | possible | eat | — |
| 👩 코쵸우 시노부 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, HP, MANA | — |
| 👩 코쵸우 시노부 → 전투 판정 시스템 | possible | 판정, battle | — |
| 👩 코쵸우 시노부 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 코쵸우 시노부 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 코쵸우 시노부 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 코쵸우 시노부 → 시설 건설 | possible | Build | — |
| 👩 코쵸우 시노부 → 스킬 습득 | possible | Skill | — |
| 👩 코쵸우 시노부 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 코쵸우 시노부 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 코쵸우 시노부 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 하네카와 하스미 → 마나 시스템 규칙 | possible | mana | — |
| 👩 하네카와 하스미 → 허기 시스템 규칙 | possible | food, eat | — |
| 👩 하네카와 하스미 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 하네카와 하스미 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 하네카와 하스미 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 하네카와 하스미 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 하네카와 하스미 → 스킬 습득 | possible | Skill | — |
| 👩 하네카와 하스미 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 하네카와 하스미 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 하네카와 하스미 → 👩 헬름 | possible | Helm | — |
| 👩 이자요이 노노미 → 마나 시스템 규칙 | possible | mana | — |
| 👩 이자요이 노노미 → 허기 시스템 규칙 | possible | eat | — |
| 👩 이자요이 노노미 → 가챠 규칙 | possible | Draw | — |
| 👩 이자요이 노노미 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 이자요이 노노미 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 이자요이 노노미 → 시설 노동 & 동료 일과 시스템 | possible | 청소 | — |
| 👩 이자요이 노노미 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 이자요이 노노미 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 이자요이 노노미 → 스킬 습득 | possible | Skill | — |
| 👩 이자요이 노노미 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 이자요이 노노미 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 이자요이 노노미 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 이자요이 노노미 → 👩 헬름 | possible | Helm | — |
| 👩 실바나스 윈드러너 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 실바나스 윈드러너 → 마나 시스템 규칙 | possible | mana | — |
| 👩 실바나스 윈드러너 → 허기 시스템 규칙 | possible | eat | — |
| 👩 실바나스 윈드러너 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 실바나스 윈드러너 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 실바나스 윈드러너 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 실바나스 윈드러너 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 실바나스 윈드러너 → 스킬 습득 | possible | Skill | — |
| 👩 실바나스 윈드러너 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 실바나스 윈드러너 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 실바나스 윈드러너 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 실바나스 윈드러너 → 👩 헬름 | possible | Helm | — |
| 👩 실바나스 윈드러너 → 👩 게임마스터 | possible | GM | — |
| 👩 미즈키 시라누이 → 마나 시스템 규칙 | possible | mana | — |
| 👩 미즈키 시라누이 → 허기 시스템 규칙 | possible | eat | — |
| 👩 미즈키 시라누이 → 가챠 규칙 | possible | Summon | — |
| 👩 미즈키 시라누이 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 미즈키 시라누이 → 전투 판정 시스템 | possible | attack, battle | — |
| 👩 미즈키 시라누이 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 미즈키 시라누이 → 스킬 습득 | possible | Skill | — |
| 👩 미즈키 시라누이 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 미즈키 시라누이 → 👩 헬름 | possible | Helm | — |
| 👩 비나 → 마나 시스템 규칙 | possible | mana | — |
| 👩 비나 → 허기 시스템 규칙 | possible | eat | — |
| 👩 비나 → 가챠 규칙 | possible | Summon | — |
| 👩 비나 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 비나 → 전투 판정 시스템 | possible | 공격, combat, attack, battle | — |
| 👩 비나 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 비나 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, skill | — |
| 👩 비나 → 스킬 습득 | possible | Skill | — |
| 👩 비나 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 비나 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 레오나 하이데른 → 마나 시스템 규칙 | possible | mana | — |
| 👩 레오나 하이데른 → 허기 시스템 규칙 | possible | eat | — |
| 👩 레오나 하이데른 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 레오나 하이데른 → 전투 판정 시스템 | possible | 공격, combat, battle, fight | — |
| 👩 레오나 하이데른 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 레오나 하이데른 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 레오나 하이데른 → 스킬 습득 | possible | Skill | — |
| 👩 레오나 하이데른 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 레오나 하이데른 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 레오나 하이데른 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 레오나 하이데른 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 레오나 하이데른 → 👩 헬름 | possible | Helm | — |
| 👩 시라누이 마이 → 마나 시스템 규칙 | possible | mana | — |
| 👩 시라누이 마이 → 허기 시스템 규칙 | possible | eat, cook | — |
| 👩 시라누이 마이 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 시라누이 마이 → 전투 판정 시스템 | possible | 공격, combat, attack, fight | — |
| 👩 시라누이 마이 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 시라누이 마이 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 시라누이 마이 → 스킬 습득 | possible | Skill | — |
| 👩 시라누이 마이 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 시라누이 마이 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 시라누이 마이 → 👩 헬름 | possible | Helm | — |
| 👩 홍련 → 마나 시스템 규칙 | possible | mana | — |
| 👩 홍련 → 허기 시스템 규칙 | possible | eat | — |
| 👩 홍련 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 홍련 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 홍련 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 홍련 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 홍련 → 스킬 습득 | possible | Skill | — |
| 👩 홍련 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 홍련 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 홍련 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 홍련 → 👩 헬름 | possible | Helm | — |
| 👩 세크메트 → 던전 서사형 GM 가이드 | possible | trap | — |
| 👩 세크메트 → 마나 시스템 규칙 | possible | mana | — |
| 👩 세크메트 → 허기 시스템 규칙 | possible | eat | — |
| 👩 세크메트 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 세크메트 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 세크메트 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 세크메트 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 세크메트 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 세크메트 → 스킬 습득 | possible | Skill | — |
| 👩 세크메트 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 세크메트 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 세크메트 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 세크메트 → 👩 헬름 | possible | Helm | — |
| 👩 카프카 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 카프카 → 마나 시스템 규칙 | possible | mana | — |
| 👩 카프카 → 허기 시스템 규칙 | possible | eat | — |
| 👩 카프카 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 카프카 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 카프카 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 카프카 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 카프카 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 카프카 → 스킬 습득 | possible | Skill | — |
| 👩 카프카 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 카프카 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 카프카 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 👩 카프카 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 브레머튼 → 마나 시스템 규칙 | possible | 마나, mana, sex, 회복 | — |
| 👩 브레머튼 → 허기 시스템 규칙 | possible | eat | — |
| 👩 브레머튼 → 가챠 규칙 | possible | Summon | — |
| 👩 브레머튼 → 시스템 태그 출력 형식 | possible | SYSTEM, MANA | — |
| 👩 브레머튼 → 전투 판정 시스템 | possible | 공격, 판정, battle | — |
| 👩 브레머튼 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 브레머튼 → 스킬·아이템·유물·시설 효과 설명 | possible | 회복, use, heal, skill | — |
| 👩 브레머튼 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 브레머튼 → 스킬 습득 | possible | Skill | — |
| 👩 브레머튼 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 브레머튼 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 브레머튼 → 👩 헬름 | possible | Helm | — |
| 👩 브레머튼 → 👩 게임마스터 | possible | GM | — |
| 👩 다이호 → 마나 시스템 규칙 | possible | mana, sex | — |
| 👩 다이호 → 허기 시스템 규칙 | possible | eat, cook | — |
| 👩 다이호 → 가챠 규칙 | possible | Summon | — |
| 👩 다이호 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 다이호 → 전투 판정 시스템 | possible | 공격, fight | — |
| 👩 다이호 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 다이호 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 다이호 → 스킬 습득 | possible | Skill | — |
| 👩 다이호 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 다이호 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 다이호 → 👩 헬름 | possible | Helm | — |
| 👩 쇼쿠호 미사키 → 던전 | possible | Dungeon | — |
| 👩 쇼쿠호 미사키 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 쇼쿠호 미사키 → 마나 시스템 규칙 | possible | mana | — |
| 👩 쇼쿠호 미사키 → 허기 시스템 규칙 | possible | eat | — |
| 👩 쇼쿠호 미사키 → 가챠 규칙 | possible | Draw | — |
| 👩 쇼쿠호 미사키 → 시스템 태그 출력 형식 | possible | POINT, MANA, DUNGEON | — |
| 👩 쇼쿠호 미사키 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 쇼쿠호 미사키 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 쇼쿠호 미사키 → 스킬 습득 | possible | Skill | — |
| 👩 쇼쿠호 미사키 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 쇼쿠호 미사키 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 쇼쿠호 미사키 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 쇼쿠호 미사키 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 대라 → 마나 시스템 규칙 | possible | mana | — |
| 👩 대라 → 허기 시스템 규칙 | possible | eat | — |
| 👩 대라 → 가챠 규칙 | possible | Summon | — |
| 👩 대라 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 대라 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 대라 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 대라 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 대라 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 대라 → 스킬 습득 | possible | Skill | — |
| 👩 대라 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 대라 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 대라 → 👩 헬름 | possible | Helm | — |
| 👩 비앙카 듀란달 아타지나 → 마나 시스템 규칙 | possible | mana, charge | — |
| 👩 비앙카 듀란달 아타지나 → 허기 시스템 규칙 | possible | eat | — |
| 👩 비앙카 듀란달 아타지나 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 비앙카 듀란달 아타지나 → 전투 판정 시스템 | possible | 공격, combat, attack | — |
| 👩 비앙카 듀란달 아타지나 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 비앙카 듀란달 아타지나 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, skill | — |
| 👩 비앙카 듀란달 아타지나 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 비앙카 듀란달 아타지나 → 스킬 습득 | possible | Skill | — |
| 👩 비앙카 듀란달 아타지나 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 비앙카 듀란달 아타지나 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 비앙카 듀란달 아타지나 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 비앙카 듀란달 아타지나 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 비앙카 듀란달 아타지나 → 👩 헬름 | possible | Helm | — |
| 👩 라뷰린스 → 던전 | possible | Dungeon | — |
| 👩 라뷰린스 → 던전 서사형 GM 가이드 | possible | Dungeon, 함정, trap | — |
| 👩 라뷰린스 → 마나 시스템 규칙 | possible | mana | — |
| 👩 라뷰린스 → 허기 시스템 규칙 | possible | eat | — |
| 👩 라뷰린스 → 시스템 태그 출력 형식 | possible | MANA, DUNGEON | — |
| 👩 라뷰린스 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 라뷰린스 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 라뷰린스 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 라뷰린스 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 라뷰린스 → 스킬 습득 | possible | Skill | — |
| 👩 라뷰린스 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 라뷰린스 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 라뷰린스 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 라뷰린스 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 라뷰린스 → 👩 범황 | possible | Devi | — |
| 👩 라뷰린스 → 👩 헬름 | possible | Helm | — |
| 👩 루시엘라 R. 사워크림 → 마나 시스템 규칙 | possible | 키스, mana, charge | — |
| 👩 루시엘라 R. 사워크림 → 허기 시스템 규칙 | possible | eat | — |
| 👩 루시엘라 R. 사워크림 → 가챠 규칙 | possible | Summon | — |
| 👩 루시엘라 R. 사워크림 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 루시엘라 R. 사워크림 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 루시엘라 R. 사워크림 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 루시엘라 R. 사워크림 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 루시엘라 R. 사워크림 → 스킬 습득 | possible | Skill | — |
| 👩 루시엘라 R. 사워크림 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 루시엘라 R. 사워크림 → 👩 헬름 | possible | Helm | — |
| 👩 츠카츠키 리오 → 던전 | possible | Dungeon, floor | — |
| 👩 츠카츠키 리오 → 던전 서사형 GM 가이드 | possible | Dungeon, floor, hidden | — |
| 👩 츠카츠키 리오 → 마나 시스템 규칙 | possible | mana | — |
| 👩 츠카츠키 리오 → 허기 시스템 규칙 | possible | eat | — |
| 👩 츠카츠키 리오 → 시스템 태그 출력 형식 | possible | SYSTEM, POINT, MANA, DUNGEON, FLOOR | — |
| 👩 츠카츠키 리오 → 시스템 태그 - 가챠 & 이벤트 | possible | FLOOR | — |
| 👩 츠카츠키 리오 → 전투 판정 시스템 | possible | combat, attack, battle | — |
| 👩 츠카츠키 리오 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 츠카츠키 리오 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 츠카츠키 리오 → 스킬 습득 | possible | Skill | — |
| 👩 츠카츠키 리오 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 츠카츠키 리오 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 츠카츠키 리오 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 츠카츠키 리오 → 👩 범황 | possible | Devi | — |
| 👩 츠카츠키 리오 → 👩 헬름 | possible | Helm | — |
| 👩 츠카츠키 리오 → 👩 게임마스터 | possible | GM | — |
| 👩 머드락 → 던전 | possible | guardian | — |
| 👩 머드락 → 던전 서사형 GM 가이드 | possible | guardian | — |
| 👩 머드락 → 마나 시스템 규칙 | possible | mana | — |
| 👩 머드락 → 허기 시스템 규칙 | possible | eat | — |
| 👩 머드락 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 머드락 → 전투 판정 시스템 | possible | combat, attack | — |
| 👩 머드락 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 머드락 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 머드락 → 스킬 습득 | possible | Skill | — |
| 👩 머드락 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 머드락 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 미래 → 던전 서사형 GM 가이드 | possible | trap | — |
| 👩 미래 → 마나 시스템 규칙 | possible | mana | — |
| 👩 미래 → 허기 시스템 규칙 | possible | eat | — |
| 👩 미래 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 미래 → 전투 판정 시스템 | possible | 공격, combat, attack, battle | — |
| 👩 미래 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 미래 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 미래 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 미래 → 스킬 습득 | possible | Skill | — |
| 👩 미래 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 미래 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 미래 → 👩 다크니스 | possible | Darkness | — |
| 👩 범황 → 던전 | possible | Dungeon | — |
| 👩 범황 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 범황 → 마나 시스템 규칙 | possible | mana | — |
| 👩 범황 → 허기 시스템 규칙 | possible | eat | — |
| 👩 범황 → 가챠 규칙 | possible | Summon | — |
| 👩 범황 → 섬 환경 | possible | Island | — |
| 👩 범황 → 시스템 태그 출력 형식 | possible | MANA, DUNGEON | — |
| 👩 범황 → 전투 판정 시스템 | possible | 공격, attack, battle | — |
| 👩 범황 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 범황 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 범황 → 스킬 습득 | possible | Skill | — |
| 👩 범황 → 👩 페른 | possible | Fern | — |
| 👩 범황 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 범황 → 👩 대라 | possible | 대라, Shakti | — |
| 👩 범황 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 범황 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 범황 → 👩 헬름 | possible | Helm | — |
| 👩 벨파스트 → 마나 시스템 규칙 | possible | mana | — |
| 👩 벨파스트 → 허기 시스템 규칙 | possible | eat, cook | — |
| 👩 벨파스트 → 가챠 규칙 | possible | Summon | — |
| 👩 벨파스트 → 시스템 태그 출력 형식 | possible | SYSTEM, MANA | — |
| 👩 벨파스트 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 벨파스트 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 벨파스트 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, skill | — |
| 👩 벨파스트 → 스킬 습득 | possible | Skill | — |
| 👩 벨파스트 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 벨파스트 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 사일런트 매지션 → 마나 시스템 규칙 | possible | mana | — |
| 👩 사일런트 매지션 → 허기 시스템 규칙 | possible | eat | — |
| 👩 사일런트 매지션 → 시스템 태그 출력 형식 | possible | POINT, MANA | — |
| 👩 사일런트 매지션 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 사일런트 매지션 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 사일런트 매지션 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 사일런트 매지션 → 스킬 습득 | possible | Skill | — |
| 👩 사일런트 매지션 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 사일런트 매지션 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 사일런트 매지션 → 👩 게임마스터 | possible | GM | — |
| 👩 시틀라리 → 던전 | possible | Dungeon | — |
| 👩 시틀라리 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 시틀라리 → 마나 시스템 규칙 | possible | mana | — |
| 👩 시틀라리 → 허기 시스템 규칙 | possible | eat | — |
| 👩 시틀라리 → 가챠 규칙 | possible | Summon | — |
| 👩 시틀라리 → 시스템 태그 출력 형식 | possible | MANA, DUNGEON | — |
| 👩 시틀라리 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 시틀라리 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 시틀라리 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 시틀라리 → 스킬 습득 | possible | Skill | — |
| 👩 시틀라리 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 시틀라리 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 엘리시아 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 엘리시아 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 엘리시아 → 허기 시스템 규칙 | possible | eat | — |
| 👩 엘리시아 → 날짜 & 던전 게이트 규칙 | possible | 새벽 | — |
| 👩 엘리시아 → 가챠 규칙 | possible | Summon, Draw | — |
| 👩 엘리시아 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 엘리시아 → 시스템 태그 - 가챠 & 이벤트 | possible | 새벽 | — |
| 👩 엘리시아 → 전투 판정 시스템 | possible | 공격, 판정, attack, battle, monster | — |
| 👩 엘리시아 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 👩 엘리시아 → 스킬·아이템·유물·시설 효과 설명 | possible | use, effect, skill | — |
| 👩 엘리시아 → 스킬 습득 | possible | Skill | — |
| 👩 엘리시아 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 엘리시아 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 엘리시아 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 엘리시아 → 👩 헬름 | possible | Helm | — |
| 👩 엘리시아 → 👩 게임마스터 | possible | GM | — |
| 👩 오컬트 마니아 (히토미) → 던전 | possible | Dungeon | — |
| 👩 오컬트 마니아 (히토미) → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 오컬트 마니아 (히토미) → 마나 시스템 규칙 | possible | mana | — |
| 👩 오컬트 마니아 (히토미) → 허기 시스템 규칙 | possible | hunger, eat | — |
| 👩 오컬트 마니아 (히토미) → 가챠 규칙 | possible | Summon | — |
| 👩 오컬트 마니아 (히토미) → 시스템 태그 출력 형식 | possible | MANA, HUNGER, ITEM, DUNGEON | — |
| 👩 오컬트 마니아 (히토미) → 전투 판정 시스템 | possible | 공격 | — |
| 👩 오컬트 마니아 (히토미) → 시설 노동 & 동료 일과 시스템 | possible | 생산, production | — |
| 👩 오컬트 마니아 (히토미) → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 오컬트 마니아 (히토미) → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill, item | — |
| 👩 오컬트 마니아 (히토미) → 스킬 습득 | possible | Skill | — |
| 👩 오컬트 마니아 (히토미) → 보급품 | possible | Item | — |
| 👩 오컬트 마니아 (히토미) → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 오컬트 마니아 (히토미) → 👩 시라누이 마이 | possible | Mai | — |
| 👩 오컬트 마니아 (히토미) → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 위스퍼레인 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 위스퍼레인 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 위스퍼레인 → 허기 시스템 규칙 | possible | eat | — |
| 👩 위스퍼레인 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 위스퍼레인 → 전투 판정 시스템 | possible | 판정 | — |
| 👩 위스퍼레인 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 위스퍼레인 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill | — |
| 👩 위스퍼레인 → 스킬 습득 | possible | Skill | — |
| 👩 위스퍼레인 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 위스퍼레인 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 오가타 칸나 → 던전 | possible | Dungeon | — |
| 👩 오가타 칸나 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 오가타 칸나 → 마나 시스템 규칙 | possible | mana | — |
| 👩 오가타 칸나 → 허기 시스템 규칙 | possible | food, eat | — |
| 👩 오가타 칸나 → 가챠 규칙 | possible | Summon | — |
| 👩 오가타 칸나 → 섬 환경 | possible | Island | — |
| 👩 오가타 칸나 → 시스템 태그 출력 형식 | possible | POINT, MANA, DUNGEON | — |
| 👩 오가타 칸나 → 전투 판정 시스템 | possible | 공격, attack | — |
| 👩 오가타 칸나 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 오가타 칸나 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 오가타 칸나 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 오가타 칸나 → 스킬 습득 | possible | Skill | — |
| 👩 오가타 칸나 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 오가타 칸나 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 오가타 칸나 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 오가타 칸나 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 오가타 칸나 → 👩 게임마스터 | possible | GM | — |
| 👩 헬름 → 던전 | possible | Dungeon | — |
| 👩 헬름 → 던전 서사형 GM 가이드 | possible | Dungeon | — |
| 👩 헬름 → 마나 시스템 규칙 | possible | 충전, mana, charge | — |
| 👩 헬름 → 허기 시스템 규칙 | possible | eat | — |
| 👩 헬름 → 최대 스탯 규칙 | possible | 최대 | — |
| 👩 헬름 → 가챠 규칙 | possible | Summon | — |
| 👩 헬름 → 섬 환경 | possible | Island | — |
| 👩 헬름 → 시스템 태그 출력 형식 | possible | MANA, DUNGEON | — |
| 👩 헬름 → 전투 판정 시스템 | possible | 공격, battle | — |
| 👩 헬름 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 헬름 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, skill | — |
| 👩 헬름 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 헬름 → 스킬 습득 | possible | Skill | — |
| 👩 헬름 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 헬름 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 헬름 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 헬름 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 힌덴부르크 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 힌덴부르크 → 마나 시스템 규칙 | possible | mana | — |
| 👩 힌덴부르크 → 허기 시스템 규칙 | possible | eat | — |
| 👩 힌덴부르크 → 시스템 태그 출력 형식 | possible | MANA | — |
| 👩 힌덴부르크 → 전투 판정 시스템 | possible | 공격, combat, battle, monster | — |
| 👩 힌덴부르크 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 힌덴부르크 → 스킬·아이템·유물·시설 효과 설명 | possible | use, drink, skill | — |
| 👩 힌덴부르크 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 힌덴부르크 → 스킬 습득 | possible | Skill | — |
| 👩 힌덴부르크 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 힌덴부르크 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 힌덴부르크 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 힌덴부르크 → 👩 헬름 | possible | Helm | — |
| 👩 페코린느 → 마나 시스템 규칙 | possible | 마나, mana | — |
| 👩 페코린느 → 허기 시스템 규칙 | possible | hunger, food, eat | — |
| 👩 페코린느 → 가챠 규칙 | possible | Draw | — |
| 👩 페코린느 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, HUNGER | — |
| 👩 페코린느 → 전투 판정 시스템 | possible | 공격, 판정 | — |
| 👩 페코린느 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 페코린느 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, heal, skill | — |
| 👩 페코린느 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 페코린느 → 스킬 습득 | possible | Skill | — |
| 👩 페코린느 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 페코린느 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 페코린느 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 페코린느 → 👩 헬름 | possible | Helm | — |
| 👩 루시퍼 → 던전 | possible | boss | — |
| 👩 루시퍼 → 던전 서사형 GM 가이드 | possible | boss, hidden | — |
| 👩 루시퍼 → 마나 시스템 규칙 | possible | 키스, mana, kiss | — |
| 👩 루시퍼 → 허기 시스템 규칙 | possible | eat | — |
| 👩 루시퍼 → 가챠 규칙 | possible | Gacha | — |
| 👩 루시퍼 → 섬 환경 | possible | Island | — |
| 👩 루시퍼 → 시스템 태그 출력 형식 | possible | MANA, GACHA | — |
| 👩 루시퍼 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 👩 루시퍼 → 전투 판정 시스템 | possible | 공격 | — |
| 👩 루시퍼 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 루시퍼 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 루시퍼 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 루시퍼 → 스킬 습득 | possible | Skill | — |
| 👩 루시퍼 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 루시퍼 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 루시퍼 → 👩 루시엘라 R. 사워크림 | possible | 루, Lu | — |
| 👩 난천 → 마나 시스템 규칙 | possible | mana | — |
| 👩 난천 → 허기 시스템 규칙 | possible | eat | — |
| 👩 난천 → 가챠 규칙 | possible | Summon | — |
| 👩 난천 → 시스템 태그 출력 형식 | possible | MANA, DEFEAT | — |
| 👩 난천 → 시스템 태그 - 가챠 & 이벤트 | possible | DEFEAT | — |
| 👩 난천 → 전투 판정 시스템 | possible | 공격, combat, battle | — |
| 👩 난천 → 변수 & 액티브 활용 가이드 | possible | 액티브 | — |
| 👩 난천 → 스킬·아이템·유물·시설 효과 설명 | possible | use, skill | — |
| 👩 난천 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 난천 → 스킬 습득 | possible | Skill | — |
| 👩 난천 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 난천 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 난천 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 다크니스 → 던전 서사형 GM 가이드 | possible | hidden | — |
| 👩 다크니스 → 마나 시스템 규칙 | possible | mana | — |
| 👩 다크니스 → 허기 시스템 규칙 | possible | eat | — |
| 👩 다크니스 → 가챠 규칙 | possible | Draw | — |
| 👩 다크니스 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, ITEM | — |
| 👩 다크니스 → 전투 판정 시스템 | possible | combat, attack, monster | — |
| 👩 다크니스 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 👩 다크니스 → 스킬·아이템·유물·시설 효과 설명 | possible | use, activate, equip, effect, skill, item | — |
| 👩 다크니스 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 다크니스 → 스킬 습득 | possible | Skill, Ability | — |
| 👩 다크니스 → 보급품 | possible | Item | — |
| 👩 다크니스 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 다크니스 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 다크니스 → 👩 츠카츠키 리오 | possible | Rio | — |
| 👩 나오 → 던전 | possible | guardian | — |
| 👩 나오 → 던전 서사형 GM 가이드 | possible | guardian | — |
| 👩 나오 → 마나 시스템 규칙 | possible | mana | — |
| 👩 나오 → 허기 시스템 규칙 | possible | eat | — |
| 👩 나오 → 최대 스탯 규칙 | possible | MAX | — |
| 👩 나오 → 가챠 규칙 | possible | Sanctuary | — |
| 👩 나오 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA | — |
| 👩 나오 → 전투 판정 시스템 | possible | battle | — |
| 👩 나오 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 👩 나오 → 스킬·아이템·유물·시설 효과 설명 | possible | use, heal, effect, skill | — |
| 👩 나오 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 나오 → 스킬 습득 | possible | Skill | — |
| 👩 나오 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 나오 → 👩 시라누이 마이 | possible | Mai | — |
| 👩 나오 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 게임마스터 → 마나 시스템 규칙 | possible | mana | — |
| 👩 게임마스터 → 허기 시스템 규칙 | possible | eat | — |
| 👩 게임마스터 → 최대 스탯 규칙 | possible | MAX | — |
| 👩 게임마스터 → 가챠 규칙 | possible | Gacha, Summon, Sanctuary, Gacha Machine | — |
| 👩 게임마스터 → 섬 환경 | possible | Island | — |
| 👩 게임마스터 → 시스템 태그 출력 형식 | possible | SYSTEM, HP, MANA, ITEM, GACHA, STATUS_PANEL | — |
| 👩 게임마스터 → 시스템 태그 - 가챠 & 이벤트 | possible | GACHA | — |
| 👩 게임마스터 → 전투 판정 시스템 | possible | combat, battle, monster | — |
| 👩 게임마스터 → 변수 & 액티브 활용 가이드 | possible | 액티브, cv_ | — |
| 👩 게임마스터 → 스킬·아이템·유물·시설 효과 설명 | possible | use, equip, effect, skill, item, building | — |
| 👩 게임마스터 → Stat System (ATK / DEF / LUCK) | possible | DEF | — |
| 👩 게임마스터 → 동료 소환 | possible | 동료 소환 | — |
| 👩 게임마스터 → 시설 건설 | possible | Build | — |
| 👩 게임마스터 → 스킬 습득 | possible | Skill | — |
| 👩 게임마스터 → 보급품 | possible | Item | — |
| 👩 게임마스터 → 👩 라이덴 쇼군 | possible | Ei | — |
| 👩 게임마스터 → 👩 루시엘라 R. 사워크림 | possible | Lu | — |
| 👩 게임마스터 → 👩 츠카츠키 리오 | possible | Rio | — |


---

## 미매핑 변수

하나의 요소 유형에만 나타나는 변수:

| 변수 | 요소 | 읽기/쓰기 |
|----------|---------|--------------|
| ... | lorebook | read |
| cv_* | lorebook | read |
| cv_activeDungeonType | lua | write |
| cv_attack | lua | write |
| cv_attack_base | lua | write |
| cv_combatRate | lua | write |
| cv_combatResult | lua | write |
| cv_combatResultBasic | lua | write |
| cv_combatResultUlti | lua | write |
| cv_combatRoll | lua | write |
| cv_companionPoolCache | lua | write |
| cv_companionsEng | lua | write |
| cv_companionsGridKey | lua | write |
| cv_currentMonsters | lua | write |
| cv_currentRound | lua | write |
| cv_darknessFortressUsedRound | lua | write |
| cv_defense | lua | write |
| cv_defense_base | lua | write |
| cv_forgePickListFacility1 | regex | read |
| cv_forgePickListFacility2 | regex | read |
| cv_forgePickListFacility3 | regex | read |
| cv_forgePickListRelic1 | regex | read |
| cv_forgePickListRelic2 | regex | read |
| cv_forgePickListRelic3 | regex | read |
| cv_forgePickListSkill1 | regex | read |
| cv_forgePickListSkill2 | regex | read |
| cv_forgePickListSkill3 | regex | read |
| cv_gmAdminUsedRound | lua | write |
| cv_hungerDrainAppliedRound | lua | write |
| cv_lastCompanionMsg | lua | write |
| cv_lastDayMsg | lua | write |
| cv_lastDungeonType | lua | write |
| cv_lastFallbackTip | lua | write |
| cv_lastGachaPick | lua | write |
| cv_luck | lua | write |
| cv_luck_base | lua | write |
| cv_maxHp_base | lua | write |
| cv_maxHunger_base | lua | write |
| cv_maxMana_base | lua | write |
| cv_maxRelicSlots | lua | write |
| cv_maxSkillSlots | lua | write |
| cv_mazeEscapeCount | lua | write |
| cv_mazeFailStreak | lua | write |
| cv_nextFloorCondition | lua | write |
| cv_panelStayOnce | lua | write |
| cv_pendingMonsterSpawn | lua | write |
| cv_prevDungeonType | lua | write |
| cv_relicDetails | lua | write |
| cv_relics | lua | write |
| cv_roundClearRejectCount | lua | write |
| cv_roundEvents | lua | write |
| cv_sanctuaryConsumed | lua | write |
| cv_sanctuarySpawnedMsg | lua | write |
| cv_saveSeedGcCounter | lua | write |
| cv_saveSeedStore | lua | write |
| cv_seedCounter | lua | write |
| cv_skillDetails | lua | write |
| cv_skipNextRerollPoint | lua | write |
| cv_stage5MaxApplied | lua | write |
| cv_totalRounds | lua | write |
| cv_varEditOpen | lua | write |
| cv_varEditTarget | lua | write |
| cv_yorEvasionUsedRound | lua | write |
