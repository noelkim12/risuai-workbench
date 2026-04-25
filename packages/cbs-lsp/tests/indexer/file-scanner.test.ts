import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'

import { afterEach, describe, expect, it } from 'vitest'
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core'

import { FileScanner } from '../../src/indexer'
import { getFixtureCorpusEntry, type FixtureCorpusEntry } from '../fixtures/fixture-corpus'

type FixtureWriteOptions = {
  nestedSegments?: readonly string[]
  fileName?: string
}

const tempRoots: string[] = []

/**
 * createWorkspaceRoot 함수.
 * file-scanner 테스트마다 격리된 임시 workspace root를 만듦.
 *
 * @returns 새로 만든 임시 workspace root 경로
 */
async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-file-scanner-'))
  tempRoots.push(root)
  return root
}

/**
 * getCanonicalWorkspacePath 함수.
 * fixture artifact 계약에 맞는 workspace 상대 경로를 계산함.
 *
 * @param entry - 실제 파일로 쓸 fixture 한 건
 * @param options - nested 경로/파일명 override 옵션
 * @returns canonical workspace relative path
 */
function getCanonicalWorkspacePath(
  entry: FixtureCorpusEntry,
  options: FixtureWriteOptions = {},
): string {
  const artifact = entry.artifact as CustomExtensionArtifact
  const contract = getCustomExtensionArtifactContract(artifact)
  const fileName = options.fileName ?? path.basename(entry.relativePath)
  return path.join(contract.directory, ...(options.nestedSegments ?? []), fileName)
}

/**
 * writeFixtureToWorkspace 함수.
 * fixture corpus 문서를 canonical workspace 디렉토리에 실제 파일로 기록함.
 *
 * @param root - 테스트용 workspace root
 * @param entry - 기록할 fixture 한 건
 * @param options - nested 경로/파일명 override 옵션
 * @returns workspace relative path와 absolute path
 */
async function writeFixtureToWorkspace(
  root: string,
  entry: FixtureCorpusEntry,
  options: FixtureWriteOptions = {},
) {
  const relativePath = getCanonicalWorkspacePath(entry, options)
  const absolutePath = path.join(root, relativePath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, entry.text, 'utf8')

  return {
    relativePath: relativePath.split(path.sep).join('/'),
    absolutePath,
  }
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('FileScanner', () => {
  it('collects canonical artifacts and classifies CBS-bearing versus non-CBS files', async () => {
    const root = await createWorkspaceRoot()
    const entries = [
      getFixtureCorpusEntry('lorebook-basic'),
      getFixtureCorpusEntry('regex-basic'),
      getFixtureCorpusEntry('prompt-basic'),
      getFixtureCorpusEntry('html-basic'),
      getFixtureCorpusEntry('lua-basic'),
      getFixtureCorpusEntry('toggle-excluded'),
      getFixtureCorpusEntry('variable-excluded'),
    ]

    await Promise.all(entries.map((entry) => writeFixtureToWorkspace(root, entry)))

    const result = await new FileScanner(root).scan()

    expect(result.summary).toEqual({
      totalFiles: 7,
      cbsBearingFiles: 5,
      nonCbsFiles: 2,
      filesWithCbsFragments: 5,
      byArtifact: {
        lorebook: 1,
        regex: 1,
        lua: 1,
        prompt: 1,
        toggle: 1,
        variable: 1,
        html: 1,
      },
    })
    expect(result.cbsBearingFiles).toHaveLength(5)
    expect(result.nonCbsFiles).toHaveLength(2)
    expect(result.filesWithCbsFragments).toHaveLength(5)

    expect(result.filesByArtifact.get('lorebook')).toMatchObject([
      {
        artifact: 'lorebook',
        artifactClass: 'cbs-bearing',
        cbsBearingArtifact: true,
        hasCbsFragments: true,
        fragmentCount: 1,
        fragmentSections: ['CONTENT'],
      },
    ])
    expect(result.filesByArtifact.get('regex')).toMatchObject([
      {
        artifact: 'regex',
        fragmentSections: ['IN', 'OUT'],
      },
    ])
    expect(result.filesByArtifact.get('prompt')).toMatchObject([
      {
        artifact: 'prompt',
        fragmentSections: ['TEXT', 'DEFAULT_TEXT'],
      },
    ])
    expect(result.filesByArtifact.get('html')).toMatchObject([
      {
        artifact: 'html',
        fragmentSections: ['full'],
      },
    ])
    expect(result.filesByArtifact.get('lua')).toMatchObject([
      {
        artifact: 'lua',
        fragmentSections: ['full'],
      },
    ])
    expect(result.filesByArtifact.get('toggle')).toMatchObject([
      {
        artifact: 'toggle',
        artifactClass: 'non-cbs',
        cbsBearingArtifact: false,
        hasCbsFragments: false,
        fragmentCount: 0,
        fragmentSections: [],
      },
    ])
    expect(result.filesByArtifact.get('variable')).toMatchObject([
      {
        artifact: 'variable',
        artifactClass: 'non-cbs',
        cbsBearingArtifact: false,
        hasCbsFragments: false,
        fragmentCount: 0,
        fragmentSections: [],
      },
    ])
  })

  it('keeps CBS-bearing artifact classification even when a file currently has no fragments', async () => {
    const root = await createWorkspaceRoot()
    const entry = getFixtureCorpusEntry('lorebook-no-content-section')

    await writeFixtureToWorkspace(root, entry)

    const result = await new FileScanner(root).scan()

    expect(result.files).toMatchObject([
      {
        artifact: 'lorebook',
        artifactClass: 'cbs-bearing',
        cbsBearingArtifact: true,
        hasCbsFragments: false,
        fragmentCount: 0,
        fragmentSections: [],
      },
    ])
    expect(result.cbsBearingFiles).toHaveLength(1)
    expect(result.filesWithCbsFragments).toHaveLength(0)
    expect(result.summary).toEqual({
      totalFiles: 1,
      cbsBearingFiles: 1,
      nonCbsFiles: 0,
      filesWithCbsFragments: 0,
      byArtifact: {
        lorebook: 1,
        regex: 0,
        lua: 0,
        prompt: 0,
        toggle: 0,
        variable: 0,
        html: 0,
      },
    })
  })

  it('scans nested workspace directories with deterministic relative-path ordering', async () => {
    const root = await createWorkspaceRoot()

    await Promise.all([
      writeFixtureToWorkspace(root, getFixtureCorpusEntry('html-basic'), {
        nestedSegments: ['themes', 'day'],
      }),
      writeFixtureToWorkspace(root, getFixtureCorpusEntry('lorebook-basic'), {
        nestedSegments: ['chapter-1'],
      }),
      writeFixtureToWorkspace(root, getFixtureCorpusEntry('regex-basic')),
    ])

    const result = await new FileScanner(root).scan()

    expect(result.files.map((file) => file.relativePath)).toEqual([
      'html/themes/day/happy-background.risuhtml',
      'lorebooks/chapter-1/happy-entry.risulorebook',
      'regex/happy-script.risuregex',
    ])
    expect(result.files.every((file) => file.uri.startsWith('file://'))).toBe(true)
  })

  it('skips dependency and build output directories during recursive scans', async () => {
    const root = await createWorkspaceRoot()
    const entry = getFixtureCorpusEntry('lorebook-basic')
    const ignoredPath = path.join(root, 'node_modules', 'pkg', 'ignored.risulorebook')

    await writeFixtureToWorkspace(root, entry)
    await mkdir(path.dirname(ignoredPath), { recursive: true })
    await writeFile(ignoredPath, entry.text, 'utf8')

    const result = await new FileScanner(root).scan()

    expect(result.files.map((file) => file.relativePath)).toEqual([
      'lorebooks/happy-entry.risulorebook',
    ])
  })
})
