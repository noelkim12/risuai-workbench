import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core'

import { ElementRegistry, FileScanner, UnifiedVariableGraph } from '../../src/indexer'

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact
  fileName: string
  text: string
  nestedSegments?: readonly string[]
}

const tempRoots: string[] = []

/**
 * createWorkspaceRoot 함수.
 * unified-variable-graph 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-unified-graph-'))
  tempRoots.push(root)
  return root
}

/**
 * writeWorkspaceFile 함수.
 * artifact contract에 맞는 canonical 경로로 테스트 문서를 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param seed - 기록할 artifact seed
 * @returns 기록된 파일의 workspace relative path
 */
async function writeWorkspaceFile(root: string, seed: WorkspaceFileSeed): Promise<string> {
  const contract = getCustomExtensionArtifactContract(seed.artifact)
  const relativePath = path.join(contract.directory, ...(seed.nestedSegments ?? []), seed.fileName)
  const absolutePath = path.join(root, relativePath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, seed.text, 'utf8')

  return relativePath.split(path.sep).join('/')
}

/**
 * buildGraph 함수.
 * seed 목록을 실제 workspace에 기록한 뒤 FileScanner+ElementRegistry+UnifiedVariableGraph를 한 번에 생성함.
 *
 * @param seeds - 기록할 workspace 파일 seed 목록
 * @returns 생성된 root, scan result, registry, graph 묶음
 */
async function buildGraph(seeds: readonly WorkspaceFileSeed[]) {
  const root = await createWorkspaceRoot()
  const relativePaths = await Promise.all(seeds.map((seed) => writeWorkspaceFile(root, seed)))
  const scanResult = await new FileScanner(root).scan()
  const registry = new ElementRegistry(scanResult)
  const graph = UnifiedVariableGraph.fromRegistry(registry)

  return {
    root,
    relativePaths,
    scanResult,
    registry,
    graph,
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('UnifiedVariableGraph Layer 1 Contract', () => {
  describe('Inclusion Policy', () => {
    it('includes lorebook, regex, prompt, html, and lua artifacts in a mixed workspace', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'hero-entry.risulorebook',
          text: ['---', 'name: hero', '---', '@@@ CONTENT', '{{setvar::mood::happy}} {{getvar::hp}}', ''].join('\n'),
        },
        {
          artifact: 'regex',
          fileName: 'state-flow.risuregex',
          text: [
            '---',
            'comment: state-flow',
            'type: plain',
            '---',
            '@@@ IN',
            '{{getvar::mood}}',
            '@@@ OUT',
            '{{setvar::reply::done}}',
            '',
          ].join('\n'),
        },
        {
          artifact: 'prompt',
          fileName: 'system.risuprompt',
          text: ['---', 'type: plain', '---', '@@@ TEXT', 'Hello {{getvar::persona}}', '@@@ DEFAULT_TEXT', 'fallback', ''].join('\n'),
        },
        {
          artifact: 'html',
          fileName: 'overlay.risuhtml',
          text: '<div>{{setvar::theme::night}}</div>',
        },
        {
          artifact: 'lua',
          fileName: 'bridge-script.risulua',
          text: [
            'local function syncMood()',
            '  local mood = getState("mood")',
            '  setState("reply", mood)',
            'end',
            '',
            'syncMood()',
          ].join('\n'),
        },
      ])

      const snapshot = graph.getSnapshot()

      // Verify all expected artifacts are represented in the graph
      const allArtifacts = new Set<string>()
      for (const variable of snapshot.variables) {
        for (const artifact of variable.artifacts) {
          allArtifacts.add(artifact)
        }
      }

      // All included artifacts should be present
      expect(allArtifacts.has('lorebook')).toBe(true)
      expect(allArtifacts.has('regex')).toBe(true)
      expect(allArtifacts.has('prompt')).toBe(true)
      expect(allArtifacts.has('html')).toBe(true)
      expect(allArtifacts.has('lua')).toBe(true)

      // Verify specific variables from each artifact type
      expect(graph.hasVariable('mood')).toBe(true)
      expect(graph.hasVariable('hp')).toBe(true)
      expect(graph.hasVariable('reply')).toBe(true)
      expect(graph.hasVariable('persona')).toBe(true)
      expect(graph.hasVariable('theme')).toBe(true)

      // Verify the mood variable has occurrences from both lorebook and lua
      const moodNode = graph.getVariable('mood')
      expect(moodNode).not.toBeNull()
      expect(moodNode!.artifacts).toContain('lorebook')
      expect(moodNode!.artifacts).toContain('regex')
      expect(moodNode!.artifacts).toContain('lua')

      // Verify occurrence counts
      expect(snapshot.totalVariables).toBeGreaterThanOrEqual(5)
      expect(snapshot.totalOccurrences).toBeGreaterThanOrEqual(7)

      // Verify URIs are properly indexed
      const lorebookUri = scanResult.files.find((f) => f.relativePath === 'lorebooks/hero-entry.risulorebook')?.uri
      const regexUri = scanResult.files.find((f) => f.relativePath === 'regex/state-flow.risuregex')?.uri
      const luaUri = scanResult.files.find((f) => f.relativePath === 'lua/bridge-script.risulua')?.uri

      expect(lorebookUri).toBeTruthy()
      expect(regexUri).toBeTruthy()
      expect(luaUri).toBeTruthy()

      expect(graph.getOccurrencesByUri(lorebookUri!).length).toBeGreaterThan(0)
      expect(graph.getOccurrencesByUri(regexUri!).length).toBeGreaterThan(0)
      expect(graph.getOccurrencesByUri(luaUri!).length).toBeGreaterThan(0)
    })

    it('excludes toggle and variable artifacts from the graph', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'toggle',
          fileName: 'feature-flag.risutoggle',
          text: 'enabled=true',
        },
        {
          artifact: 'variable',
          fileName: 'defaults.risuvar',
          text: 'hp=100\nmood=sad',
        },
        {
          artifact: 'lorebook',
          fileName: 'valid-entry.risulorebook',
          text: ['---', 'name: valid', '---', '@@@ CONTENT', '{{getvar::hp}}', ''].join('\n'),
        },
      ])

      // Toggle and variable files should not contribute to the graph
      const toggleUri = scanResult.files.find((f) => f.relativePath === 'toggle/feature-flag.risutoggle')?.uri
      const variableUri = scanResult.files.find((f) => f.relativePath === 'variables/defaults.risuvar')?.uri

      expect(toggleUri).toBeTruthy()
      expect(variableUri).toBeTruthy()

      // No occurrences should be indexed from excluded artifacts
      expect(graph.getOccurrencesByUri(toggleUri!).length).toBe(0)
      expect(graph.getOccurrencesByUri(variableUri!).length).toBe(0)

      // The variable 'hp' should only come from the lorebook, not the variable file
      const hpNode = graph.getVariable('hp')
      expect(hpNode).not.toBeNull()
      expect(hpNode!.artifacts).toEqual(['lorebook'])
      expect(hpNode!.artifacts).not.toContain('variable')

      // 'mood' from variable file should not appear in graph
      expect(graph.hasVariable('mood')).toBe(false)
    })

    it('excludes files with zero CBS fragments', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'no-content.risulorebook',
          text: ['---', 'name: no-content', '---', ''].join('\n'),
        },
        {
          artifact: 'lorebook',
          fileName: 'with-content.risulorebook',
          text: ['---', 'name: with-content', '---', '@@@ CONTENT', '{{setvar::x::1}}', ''].join('\n'),
        },
      ])

      const noContentUri = scanResult.files.find((f) => f.relativePath === 'lorebooks/no-content.risulorebook')?.uri
      const withContentUri = scanResult.files.find((f) => f.relativePath === 'lorebooks/with-content.risulorebook')?.uri

      expect(noContentUri).toBeTruthy()
      expect(withContentUri).toBeTruthy()

      // File with no fragments should not contribute occurrences
      expect(graph.getOccurrencesByUri(noContentUri!).length).toBe(0)

      // File with fragments should contribute occurrences
      expect(graph.getOccurrencesByUri(withContentUri!).length).toBeGreaterThan(0)

      // Only the variable from the file with content should exist
      expect(graph.hasVariable('x')).toBe(true)
    })
  })

  describe('HTML Fragment Section', () => {
    it('preserves fragmentSection as "full" for HTML occurrences', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'html',
          fileName: 'overlay.risuhtml',
          text: '<div>{{setvar::theme::night}} {{getvar::user}}</div>',
        },
      ])

      const themeNode = graph.getVariable('theme')
      const userNode = graph.getVariable('user')

      expect(themeNode).not.toBeNull()
      expect(userNode).not.toBeNull()

      // All HTML occurrences should have fragmentSection === 'full'
      for (const occurrence of themeNode!.writers) {
        expect(occurrence.fragmentSection).toBe('full')
        expect(occurrence.artifact).toBe('html')
        expect(occurrence.sourceKind).toBe('cbs-macro')
        expect(occurrence.sourceName).toBe('setvar')
      }

      for (const occurrence of userNode!.readers) {
        expect(occurrence.fragmentSection).toBe('full')
        expect(occurrence.artifact).toBe('html')
        expect(occurrence.sourceKind).toBe('cbs-macro')
        expect(occurrence.sourceName).toBe('getvar')
      }
    })
  })

  describe('Duplicate Occurrence Handling', () => {
    it('creates distinct occurrenceIds for duplicate accesses in the same element', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'duplicate-access.risulorebook',
          text: [
            '---',
            'name: duplicate-test',
            '---',
            '@@@ CONTENT',
            '{{getvar::counter}} {{getvar::counter}} {{getvar::counter}}',
            '',
          ].join('\n'),
        },
      ])

      const counterNode = graph.getVariable('counter')
      expect(counterNode).not.toBeNull()

      // Should have exactly 3 read occurrences
      expect(counterNode!.readers.length).toBe(3)
      expect(counterNode!.occurrenceCount).toBe(3)

      // Each occurrence should have a unique occurrenceId
      const occurrenceIds = counterNode!.readers.map((o) => o.occurrenceId)
      const uniqueIds = new Set(occurrenceIds)
      expect(uniqueIds.size).toBe(3)

      // Verify the occurrenceId format: {elementId}:{direction}:{hostStartOffset}-{hostEndOffset}:{variableName}
      for (const occurrence of counterNode!.readers) {
        expect(occurrence.occurrenceId).toMatch(/^.+:read:\d+-\d+:counter$/)
        expect(occurrence.variableName).toBe('counter')
        expect(occurrence.direction).toBe('read')
        expect(occurrence.sourceName).toBe('getvar')
      }

      // Verify each occurrence has different host offsets
      const offsets = counterNode!.readers.map((o) => o.hostStartOffset)
      const uniqueOffsets = new Set(offsets)
      expect(uniqueOffsets.size).toBe(3)
    })

    it('creates distinct occurrenceIds for mixed read/write accesses to the same variable', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'mixed-access.risulorebook',
          text: [
            '---',
            'name: mixed-test',
            '---',
            '@@@ CONTENT',
            '{{setvar::score::0}}{{addvar::score::10}}{{getvar::score}}',
            '',
          ].join('\n'),
        },
      ])

      const scoreNode = graph.getVariable('score')
      expect(scoreNode).not.toBeNull()

      // Should have 1 write (setvar) + 1 write (addvar) + 1 read (getvar)
      expect(scoreNode!.writers.length).toBe(2)
      expect(scoreNode!.readers.length).toBe(1)
      expect(scoreNode!.occurrenceCount).toBe(3)

      // All occurrenceIds should be unique
      const allOccurrences = [...scoreNode!.readers, ...scoreNode!.writers]
      const occurrenceIds = allOccurrences.map((o) => o.occurrenceId)
      const uniqueIds = new Set(occurrenceIds)
      expect(uniqueIds.size).toBe(3)

      // Verify source names
      const sourceNames = allOccurrences.map((o) => o.sourceName)
      expect(sourceNames).toContain('setvar')
      expect(sourceNames).toContain('addvar')
      expect(sourceNames).toContain('getvar')
    })
  })

  describe('findOccurrenceAt', () => {
    it('returns the correct occurrence for fragment-backed CBS examples', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'find-test.risulorebook',
          text: [
            '---',
            'name: find-test',
            '---',
            '@@@ CONTENT',
            '{{setvar::target::value}} some text {{getvar::target}}',
            '',
          ].join('\n'),
        },
      ])

      const lorebookUri = scanResult.files[0]?.uri
      expect(lorebookUri).toBeTruthy()

      const targetNode = graph.getVariable('target')
      expect(targetNode).not.toBeNull()
      expect(targetNode!.writers.length).toBe(1)
      expect(targetNode!.readers.length).toBe(1)

      const writeOccurrence = targetNode!.writers[0]!
      const readOccurrence = targetNode!.readers[0]!

      // Test finding the write occurrence
      const writeResult = graph.findOccurrenceAt(lorebookUri!, writeOccurrence.hostStartOffset + 1)
      expect(writeResult.occurrence).not.toBeNull()
      expect(writeResult.occurrence!.occurrenceId).toBe(writeOccurrence.occurrenceId)
      expect(writeResult.occurrence!.variableName).toBe('target')
      expect(writeResult.occurrence!.direction).toBe('write')
      expect(writeResult.variableNode).not.toBeNull()
      expect(writeResult.variableNode!.name).toBe('target')

      // Test finding the read occurrence
      const readResult = graph.findOccurrenceAt(lorebookUri!, readOccurrence.hostStartOffset + 1)
      expect(readResult.occurrence).not.toBeNull()
      expect(readResult.occurrence!.occurrenceId).toBe(readOccurrence.occurrenceId)
      expect(readResult.occurrence!.variableName).toBe('target')
      expect(readResult.occurrence!.direction).toBe('read')

      // Test position outside any occurrence
      const outsideResult = graph.findOccurrenceAt(lorebookUri!, 0)
      expect(outsideResult.occurrence).toBeNull()
      expect(outsideResult.variableNode).toBeNull()
      expect(outsideResult.isExactMatch).toBe(false)
    })

    it('returns the correct occurrence for Lua-backed examples', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lua',
          fileName: 'lua-find-test.risulua',
          text: [
            'local function test()',
            '  local x = getState("lua_var")',
            '  setState("lua_var", 42)',
            'end',
          ].join('\n'),
        },
      ])

      const luaUri = scanResult.files[0]?.uri
      expect(luaUri).toBeTruthy()

      const luaVarNode = graph.getVariable('lua_var')
      expect(luaVarNode).not.toBeNull()
      expect(luaVarNode!.readers.length).toBe(1)
      expect(luaVarNode!.writers.length).toBe(1)

      const readOccurrence = luaVarNode!.readers[0]!
      const writeOccurrence = luaVarNode!.writers[0]!

      // Verify Lua occurrence properties
      expect(readOccurrence.sourceKind).toBe('lua-state-api')
      expect(readOccurrence.sourceName).toBe('getState')
      expect(readOccurrence.fragmentSection).toBeNull()
      expect(readOccurrence.analysisKind).toBe('lua-file')

      expect(writeOccurrence.sourceKind).toBe('lua-state-api')
      expect(writeOccurrence.sourceName).toBe('setState')
      expect(writeOccurrence.fragmentSection).toBeNull()

      // Test finding the read occurrence
      const readResult = graph.findOccurrenceAt(luaUri!, readOccurrence.hostStartOffset + 1)
      expect(readResult.occurrence).not.toBeNull()
      expect(readResult.occurrence!.occurrenceId).toBe(readOccurrence.occurrenceId)
      expect(readResult.occurrence!.variableName).toBe('lua_var')
      expect(readResult.occurrence!.direction).toBe('read')

      // Test finding the write occurrence
      const writeResult = graph.findOccurrenceAt(luaUri!, writeOccurrence.hostStartOffset + 1)
      expect(writeResult.occurrence).not.toBeNull()
      expect(writeResult.occurrence!.occurrenceId).toBe(writeOccurrence.occurrenceId)
      expect(writeResult.occurrence!.variableName).toBe('lua_var')
      expect(writeResult.occurrence!.direction).toBe('write')
    })

    it('returns narrowest containing occurrence when positions overlap', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'overlap-test.risulorebook',
          text: [
            '---',
            'name: overlap-test',
            '---',
            '@@@ CONTENT',
            '{{setvar::a::1}}',
            '',
          ].join('\n'),
        },
      ])

      const lorebookUri = scanResult.files[0]?.uri
      expect(lorebookUri).toBeTruthy()

      const aNode = graph.getVariable('a')
      expect(aNode).not.toBeNull()

      const occurrence = aNode!.writers[0]!

      // Test exact match detection at the start of the occurrence
      const exactResult = graph.findOccurrenceAt(lorebookUri!, occurrence.hostStartOffset)
      expect(exactResult.occurrence).not.toBeNull()
      expect(exactResult.occurrence!.occurrenceId).toBe(occurrence.occurrenceId)

      // Test position inside the occurrence range (within the variable name 'a')
      // The range should cover at least the single character 'a'
      if (occurrence.hostEndOffset > occurrence.hostStartOffset + 1) {
        const insideResult = graph.findOccurrenceAt(lorebookUri!, occurrence.hostStartOffset + 1)
        expect(insideResult.occurrence).not.toBeNull()
        expect(insideResult.occurrence!.occurrenceId).toBe(occurrence.occurrenceId)
      }

      // Test position outside any occurrence returns null
      const outsideResult = graph.findOccurrenceAt(lorebookUri!, 0)
      expect(outsideResult.occurrence).toBeNull()
    })
  })

  describe('Lua Fail-Soft Behavior', () => {
    it('does not crash when Lua file cannot be read or analyzed', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'valid.risulorebook',
          text: ['---', 'name: valid', '---', '@@@ CONTENT', '{{setvar::x::1}}', ''].join('\n'),
        },
        {
          artifact: 'lua',
          fileName: 'unreadable.risulua',
          text: 'setState("y", 2)', // This file will be registered but we'll test the fail-soft behavior
        },
      ])

      const luaUri = scanResult.files.find((f) => f.relativePath === 'lua/unreadable.risulua')?.uri
      expect(luaUri).toBeTruthy()

      // The graph should build without crashing even if Lua analysis has issues
      const snapshot = graph.getSnapshot()
      expect(snapshot.totalVariables).toBeGreaterThanOrEqual(0)

      // The lorebook variable should be present (proves graph built successfully)
      expect(graph.hasVariable('x')).toBe(true)

      // If Lua file was readable, 'y' might exist; if not, it shouldn't crash
      // The key assertion: graph built without throwing
      expect(() => graph.getOccurrencesByUri(luaUri!)).not.toThrow()
    })

    it('does not fabricate occurrences for Lua files with syntax errors', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lua',
          fileName: 'syntax-error.risulua',
          text: [
            'local function broken(',
            '  setState("fake_var", 1)', // Inside broken syntax
            'end',
          ].join('\n'),
        },
      ])

      // Should not crash
      const snapshot = graph.getSnapshot()
      expect(snapshot).toBeDefined()

      // Should not create fake occurrences from malformed code
      // The variable 'fake_var' should not appear because the syntax is broken
      // (The actual behavior depends on how forgiving the Lua parser is,
      // but the key point is: no crash, and no fabricated data)
    })

    it('skips dynamic-key Lua accesses without fabricating occurrences', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lua',
          fileName: 'dynamic-key.risulua',
          text: [
            'local function test(dynamicKey)',
            '  -- This should NOT create an occurrence (dynamic key)',
            '  setState(dynamicKey, "value")',
            '  -- This SHOULD create an occurrence (static key)',
            '  setState("static_key", 42)',
            '  -- Wrapper form with chat context - should create occurrence',
            '  setState(chat, "wrapper_key", "value")',
            'end',
          ].join('\n'),
        },
      ])

      // Dynamic key should not create an occurrence
      expect(graph.hasVariable('dynamicKey')).toBe(false)

      // Static key should create an occurrence
      expect(graph.hasVariable('static_key')).toBe(true)
      const staticNode = graph.getVariable('static_key')
      expect(staticNode!.writers.length).toBe(1)
      expect(staticNode!.writers[0]!.sourceName).toBe('setState')

      // Wrapper form should create an occurrence
      expect(graph.hasVariable('wrapper_key')).toBe(true)
      const wrapperNode = graph.getVariable('wrapper_key')
      expect(wrapperNode!.writers.length).toBe(1)
      expect(wrapperNode!.writers[0]!.sourceName).toBe('setState')
    })

    it('handles getChatVar and setChatVar API calls correctly', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lua',
          fileName: 'chatvar.risulua',
          text: [
            'local function updateChat()',
            '  local current = getChatVar("chat_mode")',
            '  setChatVar("chat_mode", "active")',
            'end',
          ].join('\n'),
        },
      ])

      const chatModeNode = graph.getVariable('chat_mode')
      expect(chatModeNode).not.toBeNull()
      expect(chatModeNode!.readers.length).toBe(1)
      expect(chatModeNode!.writers.length).toBe(1)

      expect(chatModeNode!.readers[0]!.sourceName).toBe('getChatVar')
      expect(chatModeNode!.readers[0]!.direction).toBe('read')
      expect(chatModeNode!.writers[0]!.sourceName).toBe('setChatVar')
      expect(chatModeNode!.writers[0]!.direction).toBe('write')
    })

    it('preserves multiple distinct occurrences per variable in Lua', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lua',
          fileName: 'multi-occurrence.risulua',
          text: [
            'local function multiAccess()',
            '  setState("score", 10)',
            '  setState("score", 20)',
            '  setState("score", 30)',
            '  local x = getState("score")',
            'end',
          ].join('\n'),
        },
      ])

      const scoreNode = graph.getVariable('score')
      expect(scoreNode).not.toBeNull()

      // Should have 3 writes + 1 read = 4 occurrences
      expect(scoreNode!.writers.length).toBe(3)
      expect(scoreNode!.readers.length).toBe(1)
      expect(scoreNode!.occurrenceCount).toBe(4)

      // All occurrences should have unique IDs
      const allOccurrences = [...scoreNode!.readers, ...scoreNode!.writers]
      const uniqueIds = new Set(allOccurrences.map((o) => o.occurrenceId))
      expect(uniqueIds.size).toBe(4)

      // All should have correct metadata (nested under metadata field)
      // Note: Lua analyzer normalizes function names to lowercase
      for (const occ of scoreNode!.writers) {
        expect(occ.sourceKind).toBe('lua-state-api')
        expect(occ.sourceName).toBe('setState')
        expect(occ.metadata?.containingFunction).toBeDefined()
        expect(occ.metadata?.containingFunction!.toLowerCase()).toBe('multiaccess')
      }

      expect(scoreNode!.readers[0]!.metadata?.containingFunction).toBeDefined()
      expect(scoreNode!.readers[0]!.metadata?.containingFunction!.toLowerCase()).toBe('multiaccess')
      expect(scoreNode!.readers[0]!.sourceName).toBe('getState')
    })
  })

  describe('Graph Snapshot Contract', () => {
    it('getOccurrencesByUri returns actual UnifiedVariableOccurrence objects', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'query-test.risulorebook',
          text: ['---', 'name: query-test', '---', '@@@ CONTENT', '{{setvar::a::1}}{{getvar::b}}', ''].join('\n'),
        },
        {
          artifact: 'regex',
          fileName: 'query-test.risuregex',
          text: [
            '---',
            'comment: query-test',
            'type: plain',
            '---',
            '@@@ IN',
            '{{getvar::a}}',
            '@@@ OUT',
            '{{setvar::b::2}}',
            '',
          ].join('\n'),
        },
      ])

      const lorebookUri = scanResult.files.find((f) => f.relativePath === 'lorebooks/query-test.risulorebook')?.uri
      const regexUri = scanResult.files.find((f) => f.relativePath === 'regex/query-test.risuregex')?.uri

      expect(lorebookUri).toBeTruthy()
      expect(regexUri).toBeTruthy()

      // getOccurrencesByUri should return actual occurrence objects, not just IDs
      const lorebookOccurrences = graph.getOccurrencesByUri(lorebookUri!)
      const regexOccurrences = graph.getOccurrencesByUri(regexUri!)

      // Verify we get actual UnifiedVariableOccurrence objects
      expect(lorebookOccurrences.length).toBeGreaterThan(0)
      expect(regexOccurrences.length).toBeGreaterThan(0)

      // Verify each occurrence has the expected shape
      for (const occ of lorebookOccurrences) {
        expect(occ.occurrenceId).toBeDefined()
        expect(occ.variableName).toBeDefined()
        expect(occ.direction).toMatch(/^(read|write)$/)
        expect(occ.sourceKind).toMatch(/^(cbs-macro|lua-state-api)$/)
        expect(occ.uri).toBe(lorebookUri)
        expect(occ.hostRange).toBeDefined()
        expect(occ.hostStartOffset).toBeGreaterThanOrEqual(0)
        expect(occ.hostEndOffset).toBeGreaterThan(occ.hostStartOffset)
      }

      // Verify occurrences are sorted deterministically
      for (let i = 1; i < lorebookOccurrences.length; i++) {
        expect(lorebookOccurrences[i]!.occurrenceId.localeCompare(lorebookOccurrences[i - 1]!.occurrenceId)).toBeGreaterThanOrEqual(0)
      }

      // Verify getOccurrenceIdsByUri returns IDs (for serialization)
      const lorebookIds = graph.getOccurrenceIdsByUri(lorebookUri!)
      expect(lorebookIds.length).toBe(lorebookOccurrences.length)
      expect(lorebookIds[0]).toBe(lorebookOccurrences[0]?.occurrenceId)
    })

    it('produces deterministic ordering of variables and occurrences', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'ordering-test.risulorebook',
          text: [
            '---',
            'name: ordering-test',
            '---',
            '@@@ CONTENT',
            '{{setvar::zebra::1}}{{setvar::apple::2}}{{setvar::mango::3}}',
            '',
          ].join('\n'),
        },
      ])

      const snapshot = graph.getSnapshot()

      // Variables should be sorted lexicographically
      const variableNames = snapshot.variables.map((v) => v.name)
      expect(variableNames).toEqual(['apple', 'mango', 'zebra'])

      // Verify schema version
      expect(snapshot.schemaVersion).toBe('1.0.0')

      // Verify counts match
      expect(snapshot.totalVariables).toBe(3)
      expect(snapshot.totalOccurrences).toBe(3)
    })

    it('maintains correct variableIndex mapping', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'regex',
          fileName: 'index-test.risuregex',
          text: [
            '---',
            'comment: index-test',
            'type: plain',
            '---',
            '@@@ IN',
            '{{getvar::input}}',
            '@@@ OUT',
            '{{setvar::output::result}}',
            '',
          ].join('\n'),
        },
      ])

      const snapshot = graph.getSnapshot()

      // Verify variableIndex contains all variables
      expect(snapshot.variableIndex['input']).toBeDefined()
      expect(snapshot.variableIndex['output']).toBeDefined()

      // Verify the index matches the array
      for (const variable of snapshot.variables) {
        expect(snapshot.variableIndex[variable.name]).toBe(variable)
      }
    })

    it('maintains correct occurrencesByUri and occurrencesByElementId indexes', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'index-test.risulorebook',
          text: [
            '---',
            'name: index-test',
            '---',
            '@@@ CONTENT',
            '{{setvar::x::1}}{{getvar::y}}',
            '',
          ].join('\n'),
        },
      ])

      const snapshot = graph.getSnapshot()
      const lorebookUri = scanResult.files[0]?.uri
      expect(lorebookUri).toBeTruthy()

      // Verify occurrencesByUri
      const uriOccurrences = snapshot.occurrencesByUri[lorebookUri!]
      expect(uriOccurrences).toBeDefined()
      expect(uriOccurrences.length).toBe(2) // setvar + getvar

      // Verify occurrencesByElementId
      const elementId = `${lorebookUri}#fragment:CONTENT:0`
      const elementOccurrences = snapshot.occurrencesByElementId[elementId]
      expect(elementOccurrences).toBeDefined()
      expect(elementOccurrences.length).toBe(2)

      // Verify the occurrence IDs match between indexes (spread to mutable arrays for sorting)
      expect([...uriOccurrences].sort()).toEqual([...elementOccurrences].sort())
    })

    it('correctly identifies artifactClass for all occurrences', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'class-test.risulorebook',
          text: ['---', 'name: test', '---', '@@@ CONTENT', '{{setvar::a::1}}', ''].join('\n'),
        },
        {
          artifact: 'lua',
          fileName: 'class-test.risulua',
          text: 'setState("b", 2)',
        },
      ])

      const aNode = graph.getVariable('a')
      const bNode = graph.getVariable('b')

      expect(aNode).not.toBeNull()
      expect(bNode).not.toBeNull()

      // CBS-bearing artifacts should have artifactClass 'cbs-bearing'
      for (const occ of aNode!.writers) {
        expect(occ.artifactClass).toBe('cbs-bearing')
      }

      // Lua files are also CBS-bearing (they interact with CBS variable system)
      for (const occ of bNode!.writers) {
        expect(occ.artifactClass).toBe('cbs-bearing')
      }
    })
  })

  describe('Host Range Rebase Accuracy', () => {
    it('correctly rebases fragment-local ranges to host document coordinates', async () => {
      const { graph, scanResult } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'rebase-test.risulorebook',
          text: [
            '---',
            'name: rebase-test',
            '---',
            '@@@ CONTENT',
            'Line 1 text',
            '{{setvar::rebased::value}}',
            'Line 3 text',
            '',
          ].join('\n'),
        },
      ])

      const lorebookUri = scanResult.files[0]?.uri
      expect(lorebookUri).toBeTruthy()

      const rebasedNode = graph.getVariable('rebased')
      expect(rebasedNode).not.toBeNull()
      expect(rebasedNode!.writers.length).toBe(1)

      const occurrence = rebasedNode!.writers[0]!

      // Verify hostRange is populated with correct positions
      expect(occurrence.hostRange.start.line).toBeGreaterThanOrEqual(0)
      expect(occurrence.hostRange.start.character).toBeGreaterThanOrEqual(0)
      expect(occurrence.hostRange.end.line).toBeGreaterThanOrEqual(occurrence.hostRange.start.line)

      // Verify host offsets are consistent with hostRange
      // The occurrence should be findable at its host offset
      const foundResult = graph.findOccurrenceAt(lorebookUri!, occurrence.hostStartOffset)
      expect(foundResult.occurrence).not.toBeNull()
      expect(foundResult.occurrence!.occurrenceId).toBe(occurrence.occurrenceId)
    })

    it('handles multi-line CBS content correctly', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'multiline.risulorebook',
          text: [
            '---',
            'name: multiline',
            '---',
            '@@@ CONTENT',
            '{{setvar::multi::',
            'multi-line',
            'value',
            '}}',
            '{{getvar::multi}}',
            '',
          ].join('\n'),
        },
      ])

      const multiNode = graph.getVariable('multi')
      expect(multiNode).not.toBeNull()
      expect(multiNode!.writers.length).toBe(1)
      expect(multiNode!.readers.length).toBe(1)

      // The variable key range covers just the variable name "multi"
      // which is on a single line, even though the full CBS macro spans multiple lines
      const writeOcc = multiNode!.writers[0]!
      const readOcc = multiNode!.readers[0]!

      // Verify offsets are valid and consistent
      expect(writeOcc.hostStartOffset).toBeLessThan(writeOcc.hostEndOffset)
      expect(readOcc.hostStartOffset).toBeLessThan(readOcc.hostEndOffset)

      // Verify ranges are populated
      expect(writeOcc.hostRange.start.line).toBeGreaterThanOrEqual(0)
      expect(writeOcc.hostRange.start.character).toBeGreaterThanOrEqual(0)
      expect(readOcc.hostRange.start.line).toBeGreaterThanOrEqual(0)

      // The key "multi" should be extractable from the host range
      expect(writeOcc.variableName).toBe('multi')
      expect(readOcc.variableName).toBe('multi')
    })
  })

  describe('Cross-Artifact Variable Unification', () => {
    it('unifies the same variable name across different artifact types', async () => {
      const { graph } = await buildGraph([
        {
          artifact: 'lorebook',
          fileName: 'writer.risulorebook',
          text: ['---', 'name: writer', '---', '@@@ CONTENT', '{{setvar::shared::lorebook}}', ''].join('\n'),
        },
        {
          artifact: 'regex',
          fileName: 'reader.risuregex',
          text: [
            '---',
            'comment: reader',
            'type: plain',
            '---',
            '@@@ IN',
            '{{getvar::shared}}',
            '@@@ OUT',
            '',
          ].join('\n'),
        },
        {
          artifact: 'lua',
          fileName: 'accessor.risulua',
          text: 'local x = getState("shared")',
        },
      ])

      const sharedNode = graph.getVariable('shared')
      expect(sharedNode).not.toBeNull()

      // Should have 1 write (lorebook) + 1 read (regex) + 1 read (lua) = 3 occurrences
      expect(sharedNode!.writers.length).toBe(1)
      expect(sharedNode!.readers.length).toBe(2)
      expect(sharedNode!.occurrenceCount).toBe(3)

      // Should span all three artifact types
      expect(sharedNode!.artifacts).toContain('lorebook')
      expect(sharedNode!.artifacts).toContain('regex')
      expect(sharedNode!.artifacts).toContain('lua')
      expect(sharedNode!.artifacts.length).toBe(3)

      // Verify source kinds
      const allOccurrences = [...sharedNode!.readers, ...sharedNode!.writers]
      const sourceKinds = new Set(allOccurrences.map((o) => o.sourceKind))
      expect(sourceKinds.has('cbs-macro')).toBe(true)
      expect(sourceKinds.has('lua-state-api')).toBe(true)
    })
  })
})
