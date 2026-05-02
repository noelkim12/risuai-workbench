import os from 'node:os'
import path from 'node:path'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vitest'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { getCustomExtensionArtifactContract, type CustomExtensionArtifact } from 'risu-workbench-core'

import { IncrementalRebuilder, scanWorkspaceFilesSync } from '../../src/indexer'

type WorkspaceFileSeed = {
  artifact: CustomExtensionArtifact
  fileName: string
  text: string
  nestedSegments?: readonly string[]
}

const tempRoots: string[] = []

async function createWorkspaceRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cbs-lsp-incremental-rebuilder-'))
  tempRoots.push(root)
  return root
}

async function writeWorkspaceFile(root: string, seed: WorkspaceFileSeed): Promise<string> {
  const contract = getCustomExtensionArtifactContract(seed.artifact)
  const relativePath = path.join(contract.directory, ...(seed.nestedSegments ?? []), seed.fileName)
  const absolutePath = path.join(root, relativePath)

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, seed.text, 'utf8')

  return absolutePath
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('IncrementalRebuilder', () => {
  it('updates changed files, adds created files, and removes deleted files without rescanning the whole workspace', async () => {
    const root = await createWorkspaceRoot()
    const writerPath = await writeWorkspaceFile(root, {
      artifact: 'lorebook',
      fileName: 'writer.risulorebook',
      text: ['---', 'name: writer', '---', '@@@ CONTENT', '{{setvar::mood::happy}}', ''].join('\n'),
    })
    const readerPath = await writeWorkspaceFile(root, {
      artifact: 'regex',
      fileName: 'reader.risuregex',
      text: ['---', 'comment: reader', 'type: plain', '---', '@@@ IN', '{{getvar::mood}}', ''].join('\n'),
    })

    const rebuilder = new IncrementalRebuilder({
      scanResult: scanWorkspaceFilesSync(root),
    })
    const writerUri = rebuilder.getScanResult().files.find((file) => file.absolutePath === writerPath)?.uri
    const readerUri = rebuilder.getScanResult().files.find((file) => file.absolutePath === readerPath)?.uri

    expect(writerUri).toBeTruthy()
    expect(readerUri).toBeTruthy()
    expect(rebuilder.getGraph().getVariable('mood')?.occurrenceCount).toBe(2)

    const changedWriter = TextDocument.create(
      writerUri!,
      'cbs',
      2,
      ['---', 'name: writer', '---', '@@@ CONTENT', '{{setvar::energy::full}}', ''].join('\n'),
    )

    const changeResult = rebuilder.rebuild({
      changedUris: [writerUri!],
      resolveOpenDocument: (uri) => (uri === writerUri ? changedWriter : null),
    })

    expect(changeResult.removedUris).toEqual([])
    expect(changeResult.graph.getVariable('energy')).toMatchObject({
      writers: [expect.objectContaining({ uri: writerUri })],
    })
    expect(changeResult.graph.getVariable('mood')).toMatchObject({
      readers: [expect.objectContaining({ uri: readerUri })],
      writers: [],
    })

    const externalWriterPath = await writeWorkspaceFile(root, {
      artifact: 'prompt',
      fileName: 'fallback.risuprompt',
      text: ['---', 'type: plain', '---', '@@@ TEXT', '{{setvar::mood::return}}', ''].join('\n'),
    })
    const createResult = rebuilder.rebuild({
      changedUris: [pathToFileURL(externalWriterPath).href],
      resolveOpenDocument: () => null,
    })

    const createdUri = createResult.scanResult.files.find((file) => file.absolutePath === externalWriterPath)?.uri
    expect(createdUri).toBeTruthy()
    expect(createResult.graph.getVariable('mood')).toMatchObject({
      readers: [expect.objectContaining({ uri: readerUri })],
      writers: [expect.objectContaining({ uri: createdUri })],
    })

    await rm(readerPath)
    const deleteResult = rebuilder.rebuild({
      changedUris: [readerUri!],
      resolveOpenDocument: () => null,
    })

    expect(deleteResult.removedUris).toEqual([readerUri])
    expect(deleteResult.registry.getFileByUri(readerUri!)).toBeNull()
    expect(deleteResult.graph.getOccurrencesByUri(readerUri!)).toEqual([])
    expect(deleteResult.scanResult.summary.totalFiles).toBe(2)
  })
})
