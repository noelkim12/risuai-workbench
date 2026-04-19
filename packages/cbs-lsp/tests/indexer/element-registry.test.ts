import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core'

import { ElementRegistry, FileScanner } from '../../src/indexer'

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact
  fileName: string
  text: string
  nestedSegments?: readonly string[]
}

const tempRoots: string[] = []

/**
 * createWorkspaceRoot 함수.
 * registry 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-element-registry-'))
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
 * buildRegistry 함수.
 * seed 목록을 실제 workspace에 기록한 뒤 FileScanner+ElementRegistry를 한 번에 생성함.
 *
 * @param seeds - 기록할 workspace 파일 seed 목록
 * @returns 생성된 root, scan result, registry 묶음
 */
async function buildRegistry(seeds: readonly WorkspaceFileSeed[]) {
  const root = await createWorkspaceRoot()
  const relativePaths = await Promise.all(seeds.map((seed) => writeWorkspaceFile(root, seed)))
  const scanResult = await new FileScanner(root).scan()

  return {
    root,
    relativePaths,
    scanResult,
    registry: new ElementRegistry(scanResult),
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('ElementRegistry', () => {
  it('indexes fragment-bearing artifacts into URI and artifact read models with normalized graph seeds', async () => {
    const { scanResult, registry } = await buildRegistry([
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
    ])

    const lorebookUri = scanResult.files.find((file) => file.relativePath === 'lorebooks/hero-entry.risulorebook')?.uri
    const regexUri = scanResult.files.find((file) => file.relativePath === 'regex/state-flow.risuregex')?.uri
    const promptUri = scanResult.files.find((file) => file.relativePath === 'prompt_template/system.risuprompt')?.uri
    const htmlUri = scanResult.files.find((file) => file.relativePath === 'html/overlay.risuhtml')?.uri

    expect(lorebookUri).toBeTruthy()
    expect(regexUri).toBeTruthy()
    expect(promptUri).toBeTruthy()
    expect(htmlUri).toBeTruthy()

    expect(registry.getSnapshot().summary).toEqual({
      totalFiles: 4,
      totalElements: 6,
      totalGraphSeeds: 6,
      byArtifact: {
        lorebook: { files: 1, elements: 1, graphSeeds: 1 },
        regex: { files: 1, elements: 2, graphSeeds: 2 },
        lua: { files: 0, elements: 0, graphSeeds: 0 },
        prompt: { files: 1, elements: 2, graphSeeds: 2 },
        toggle: { files: 0, elements: 0, graphSeeds: 0 },
        variable: { files: 0, elements: 0, graphSeeds: 0 },
        html: { files: 1, elements: 1, graphSeeds: 1 },
      },
    })

    expect(registry.getFileByUri(lorebookUri!)).toMatchObject({
      artifact: 'lorebook',
      analysisKind: 'cbs-fragments',
      elementIds: [`${lorebookUri}#fragment:CONTENT:0`],
      graphSeedCount: 1,
    })
    expect(registry.getElementsByUri(lorebookUri!)).toMatchObject([
      {
        id: `${lorebookUri}#fragment:CONTENT:0`,
        elementName: 'lorebooks/hero-entry.risulorebook#CONTENT',
        displayName: 'hero-entry.risulorebook#CONTENT',
        analysisKind: 'cbs-fragment',
        fragmentIndex: 0,
        fragment: {
          section: 'CONTENT',
          fragmentIndex: 0,
          content: '{{setvar::mood::happy}} {{getvar::hp}}',
          hostRange: { start: expect.any(Number), end: expect.any(Number) },
        },
        cbs: {
          reads: ['hp'],
          writes: ['mood'],
        },
      },
    ])

    expect(registry.getElementsByArtifact('regex')).toMatchObject([
      {
        id: `${regexUri}#fragment:IN:0`,
        fragmentIndex: 0,
        fragment: { section: 'IN', fragmentIndex: 0 },
        cbs: { reads: ['mood'], writes: [] },
      },
      {
        id: `${regexUri}#fragment:OUT:1`,
        fragmentIndex: 1,
        fragment: { section: 'OUT', fragmentIndex: 1 },
        cbs: { reads: [], writes: ['reply'] },
      },
    ])

    expect(registry.getGraphSeedsByUri(promptUri!)).toMatchObject([
      {
        artifact: 'prompt',
        fragmentSection: 'TEXT',
        fragmentIndex: 0,
        cbs: { reads: ['persona'], writes: [] },
        hostRange: { start: expect.any(Number), end: expect.any(Number) },
      },
      {
        artifact: 'prompt',
        fragmentSection: 'DEFAULT_TEXT',
        fragmentIndex: 1,
        cbs: { reads: [], writes: [] },
        hostRange: { start: expect.any(Number), end: expect.any(Number) },
      },
    ])
    expect(registry.getElementsByUri(htmlUri!)).toMatchObject([
      {
        artifact: 'html',
        fragmentIndex: 0,
        fragment: { section: 'full', fragmentIndex: 0 },
        cbs: { reads: [], writes: ['theme'] },
      },
    ])
    expect(registry.getAllElementCbsData().map((entry) => entry.elementName)).toEqual([
      'html/overlay.risuhtml#full',
      'lorebooks/hero-entry.risulorebook#CONTENT',
      'prompt_template/system.risuprompt#TEXT',
      'prompt_template/system.risuprompt#DEFAULT_TEXT',
      'regex/state-flow.risuregex#IN',
      'regex/state-flow.risuregex#OUT',
    ])
  })

  it('analyzes lua files as single registry elements and preserves raw Lua artifacts for later graph layers', async () => {
    const { scanResult, registry } = await buildRegistry([
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

    const luaUri = scanResult.files[0]?.uri
    expect(luaUri).toBeTruthy()

    expect(registry.getFileByUri(luaUri!)).toMatchObject({
      artifact: 'lua',
      analysisKind: 'lua-file',
      elementIds: [`${luaUri}#lua`],
      graphSeedCount: 1,
      analysisError: null,
    })
    expect(registry.getElementsByUri(luaUri!)).toMatchObject([
      {
        id: `${luaUri}#lua`,
        elementName: 'lua/bridge-script.risulua',
        displayName: 'bridge-script.risulua',
        analysisKind: 'lua-file',
        fragment: null,
        cbs: {
          reads: ['mood'],
          writes: ['reply'],
        },
        lua: {
          baseName: 'bridge-script',
          functionNames: ['syncMood'],
          stateVariableNames: ['mood', 'reply'],
        },
      },
    ])
    expect(registry.getGraphSeedsByUri(luaUri!)).toMatchObject([
      {
        artifact: 'lua',
        fragmentSection: null,
        analysisKind: 'lua-file',
        cbs: {
          reads: ['mood'],
          writes: ['reply'],
        },
      },
    ])
    expect(registry.getLuaArtifactByUri(luaUri!)).toMatchObject({
      baseName: 'bridge-script',
      totalLines: 6,
    })
    expect(registry.getAllElementCbsData()).toHaveLength(1)
    expect(registry.getAllElementCbsData()[0]).toMatchObject({
      elementType: 'lua',
      elementName: 'lua/bridge-script.risulua',
    })
    expect([...registry.getAllElementCbsData()[0]!.reads]).toEqual(['mood'])
    expect([...registry.getAllElementCbsData()[0]!.writes]).toEqual(['reply'])
  })

  it('keeps non-CBS and no-fragment files queryable without inventing fake elements', async () => {
    const { scanResult, registry } = await buildRegistry([
      {
        artifact: 'toggle',
        fileName: 'feature-flag.risutoggle',
        text: 'enabled=true',
      },
      {
        artifact: 'variable',
        fileName: 'defaults.risuvar',
        text: 'hp=100',
      },
      {
        artifact: 'lorebook',
        fileName: 'missing-content.risulorebook',
        text: ['---', 'name: missing', '---', ''].join('\n'),
      },
    ])

    const toggleUri = scanResult.files.find((file) => file.relativePath === 'toggle/feature-flag.risutoggle')?.uri
    const variableUri = scanResult.files.find((file) => file.relativePath === 'variables/defaults.risuvar')?.uri
    const lorebookUri = scanResult.files.find((file) => file.relativePath === 'lorebooks/missing-content.risulorebook')?.uri

    expect(registry.getFileByUri(toggleUri!)).toMatchObject({
      artifact: 'toggle',
      analysisKind: 'non-cbs-artifact',
      elementIds: [],
      graphSeedCount: 0,
    })
    expect(registry.getFileByUri(variableUri!)).toMatchObject({
      artifact: 'variable',
      analysisKind: 'non-cbs-artifact',
      elementIds: [],
      graphSeedCount: 0,
    })
    expect(registry.getFileByUri(lorebookUri!)).toMatchObject({
      artifact: 'lorebook',
      analysisKind: 'cbs-without-fragments',
      elementIds: [],
      graphSeedCount: 0,
    })
    expect(registry.getElementsByUri(toggleUri!)).toEqual([])
    expect(registry.getElementsByUri(variableUri!)).toEqual([])
    expect(registry.getElementsByUri(lorebookUri!)).toEqual([])
    expect(registry.getElementsByArtifact('toggle')).toEqual([])
    expect(registry.getElementsByArtifact('variable')).toEqual([])
    expect(registry.getGraphSeeds()).toEqual([])
    expect(registry.getSnapshot().summary).toEqual({
      totalFiles: 3,
      totalElements: 0,
      totalGraphSeeds: 0,
      byArtifact: {
        lorebook: { files: 1, elements: 0, graphSeeds: 0 },
        regex: { files: 0, elements: 0, graphSeeds: 0 },
        lua: { files: 0, elements: 0, graphSeeds: 0 },
        prompt: { files: 0, elements: 0, graphSeeds: 0 },
        toggle: { files: 1, elements: 0, graphSeeds: 0 },
        variable: { files: 1, elements: 0, graphSeeds: 0 },
        html: { files: 0, elements: 0, graphSeeds: 0 },
      },
    })
  })

  it('disambiguates duplicate fragment section names with deterministic index-based IDs', async () => {
    const { scanResult, registry } = await buildRegistry([
      {
        artifact: 'lorebook',
        fileName: 'duplicate-sections.risulorebook',
        text: [
          '---',
          'name: duplicate-test',
          '---',
          '@@@ CONTENT',
          '{{setvar::first::value1}}',
          '@@@ CONTENT',
          '{{setvar::second::value2}}',
          '@@@ CONTENT',
          '{{setvar::third::value3}}',
          '',
        ].join('\n'),
      },
    ])

    const lorebookUri = scanResult.files[0]?.uri
    expect(lorebookUri).toBeTruthy()

    const elements = registry.getElementsByUri(lorebookUri!)
    expect(elements).toHaveLength(3)

    // Each duplicate section gets a unique ID with index disambiguation
    expect(elements[0]).toMatchObject({
      id: `${lorebookUri}#fragment:CONTENT:0`,
      fragmentIndex: 0,
      elementName: 'lorebooks/duplicate-sections.risulorebook#CONTENT',
      fragment: {
        section: 'CONTENT',
        fragmentIndex: 0,
        hostRange: { start: expect.any(Number), end: expect.any(Number) },
      },
      cbs: { writes: ['first'] },
    })
    expect(elements[1]).toMatchObject({
      id: `${lorebookUri}#fragment:CONTENT:1`,
      fragmentIndex: 1,
      elementName: 'lorebooks/duplicate-sections.risulorebook#CONTENT',
      fragment: {
        section: 'CONTENT',
        fragmentIndex: 1,
        hostRange: { start: expect.any(Number), end: expect.any(Number) },
      },
      cbs: { writes: ['second'] },
    })
    expect(elements[2]).toMatchObject({
      id: `${lorebookUri}#fragment:CONTENT:2`,
      fragmentIndex: 2,
      elementName: 'lorebooks/duplicate-sections.risulorebook#CONTENT',
      fragment: {
        section: 'CONTENT',
        fragmentIndex: 2,
        hostRange: { start: expect.any(Number), end: expect.any(Number) },
      },
      cbs: { writes: ['third'] },
    })

    // Graph seeds include explicit metadata for consumers
    const seeds = registry.getGraphSeedsByUri(lorebookUri!)
    expect(seeds).toHaveLength(3)
    expect(seeds[0]).toMatchObject({
      elementId: `${lorebookUri}#fragment:CONTENT:0`,
      fragmentSection: 'CONTENT',
      fragmentIndex: 0,
      hostRange: { start: expect.any(Number), end: expect.any(Number) },
    })
    expect(seeds[1]).toMatchObject({
      elementId: `${lorebookUri}#fragment:CONTENT:1`,
      fragmentSection: 'CONTENT',
      fragmentIndex: 1,
      hostRange: { start: expect.any(Number), end: expect.any(Number) },
    })
    expect(seeds[2]).toMatchObject({
      elementId: `${lorebookUri}#fragment:CONTENT:2`,
      fragmentSection: 'CONTENT',
      fragmentIndex: 2,
      hostRange: { start: expect.any(Number), end: expect.any(Number) },
    })

    // Summary counts all elements correctly
    expect(registry.getSnapshot().summary).toMatchObject({
      totalFiles: 1,
      totalElements: 3,
      totalGraphSeeds: 3,
      byArtifact: {
        lorebook: { files: 1, elements: 3, graphSeeds: 3 },
      },
    })
  })

  it('exposes hostRange metadata for graph consumers to avoid elementName parsing', async () => {
    const { scanResult, registry } = await buildRegistry([
      {
        artifact: 'lorebook',
        fileName: 'host-range-test.risulorebook',
        text: ['---', 'name: test', '---', '@@@ CONTENT', '{{getvar::x}}', ''].join('\n'),
      },
    ])

    const lorebookUri = scanResult.files[0]?.uri
    const elements = registry.getElementsByUri(lorebookUri!)
    const seeds = registry.getGraphSeedsByUri(lorebookUri!)

    expect(elements).toHaveLength(1)
    expect(seeds).toHaveLength(1)

    const element = elements[0]!
    const seed = seeds[0]!

    // Graph consumers can use explicit metadata instead of parsing elementName
    expect(seed.fragmentSection).toBe('CONTENT')
    expect(seed.fragmentIndex).toBe(0)
    expect(seed.hostRange).toEqual({
      start: expect.any(Number),
      end: expect.any(Number),
    })

    // Host range matches fragment position
    expect(seed.hostRange).toEqual(element.fragment!.hostRange)

    // Lua files have null hostRange (entire file is the element)
    const { registry: luaRegistry } = await buildRegistry([
      {
        artifact: 'lua',
        fileName: 'test.risulua',
        text: 'local x = getState("y")',
      },
    ])
    const luaSeed = luaRegistry.getGraphSeeds()[0]!
    expect(luaSeed.fragmentSection).toBeNull()
    expect(luaSeed.fragmentIndex).toBe(-1)
    expect(luaSeed.hostRange).toBeNull()
  })
})
