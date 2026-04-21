/**
 * Layer 1 workspace incremental rebuilder.
 * @file packages/cbs-lsp/src/indexer/incremental-rebuilder.ts
 */

import { existsSync, readFileSync } from 'node:fs'

import type { TextDocument } from 'vscode-languageserver-textdocument'

import { CbsLspPathHelper } from '../helpers/path-helper'
import { buildWorkspaceScanResult, createWorkspaceScanFileFromText, type WorkspaceScanFile, type WorkspaceScanResult } from './file-scanner'
import { ElementRegistry } from './element-registry'
import { buildOccurrencesForUri, UnifiedVariableGraph } from './unified-variable-graph'

export interface IncrementalRebuilderCreateOptions {
  scanResult: WorkspaceScanResult
  registry?: ElementRegistry
  graph?: UnifiedVariableGraph
}

export interface IncrementalRebuildOptions {
  changedUris: readonly string[]
  resolveOpenDocument?: (uri: string) => TextDocument | null
}

export interface IncrementalRebuildResult {
  scanResult: WorkspaceScanResult
  registry: ElementRegistry
  graph: UnifiedVariableGraph
  changedUris: readonly string[]
  removedUris: readonly string[]
}

/**
 * IncrementalRebuilder 클래스.
 * workspace scan/registry/graph를 파일 단위 dirty update로 유지함.
 */
export class IncrementalRebuilder {
  private readonly rootPath: string

  private scanFilesByUri: Map<string, WorkspaceScanFile>

  private readonly registry: ElementRegistry

  private readonly graph: UnifiedVariableGraph

  constructor(options: IncrementalRebuilderCreateOptions) {
    this.rootPath = options.scanResult.rootPath
    this.scanFilesByUri = new Map(options.scanResult.files.map((file) => [file.uri, file]))
    this.registry = options.registry ?? ElementRegistry.fromScanResult(options.scanResult)
    this.graph = options.graph ?? UnifiedVariableGraph.fromRegistry(this.registry)
  }

  /**
   * getScanResult 함수.
   * rebuilder가 보유한 최신 workspace scan result를 돌려줌.
   *
   * @returns 최신 scan result
   */
  getScanResult(): WorkspaceScanResult {
    return buildWorkspaceScanResult(this.rootPath, [...this.scanFilesByUri.values()])
  }

  /**
   * getRegistry 함수.
   * 현재 incremental registry 인스턴스를 조회함.
   *
   * @returns 현재 registry
   */
  getRegistry(): ElementRegistry {
    return this.registry
  }

  /**
   * getGraph 함수.
   * 현재 incremental graph 인스턴스를 조회함.
   *
   * @returns 현재 graph
   */
  getGraph(): UnifiedVariableGraph {
    return this.graph
  }

  /**
   * rebuild 함수.
   * 변경된 URI만 다시 스캔해 registry/graph를 부분 갱신함.
   *
   * @param options - 변경 URI와 open-document resolver
   * @returns 갱신된 Layer 1 상태 묶음
   */
  rebuild(options: IncrementalRebuildOptions): IncrementalRebuildResult {
    const changedUris = [...new Set(options.changedUris)].sort((left, right) => left.localeCompare(right))
    const removedUris = new Set<string>()

    for (const uri of changedUris) {
      const nextFile = this.readWorkspaceFile(uri, options.resolveOpenDocument)
      if (!nextFile) {
        this.scanFilesByUri.delete(uri)
        this.registry.removeFile(uri)
        this.graph.removeUri(uri)
        removedUris.add(uri)
        continue
      }

      this.scanFilesByUri.set(uri, nextFile)
      this.registry.upsertFile(nextFile)
      this.graph.replaceOccurrencesForUri(uri, buildOccurrencesForUri(this.registry, uri))
    }

    return {
      scanResult: this.getScanResult(),
      registry: this.registry,
      graph: this.graph,
      changedUris,
      removedUris: [...removedUris].sort((left, right) => left.localeCompare(right)),
    }
  }

  /**
   * readWorkspaceFile 함수.
   * open document overlay 또는 filesystem에서 최신 scan file 한 건을 만듦.
   *
   * @param uri - 다시 읽을 file URI
   * @param resolveOpenDocument - optional open document resolver
   * @returns 최신 scan file 또는 삭제/미지원이면 null
   */
  private readWorkspaceFile(
    uri: string,
    resolveOpenDocument?: (uri: string) => TextDocument | null,
  ): WorkspaceScanFile | null {
      const absolutePath = CbsLspPathHelper.getFilePathFromUri(uri)
    const openDocument = resolveOpenDocument?.(uri) ?? null
    const text = openDocument?.getText() ?? this.readFileFromDisk(absolutePath)

    if (text === null) {
      return null
    }

    try {
      return createWorkspaceScanFileFromText({
        workspaceRoot: this.rootPath,
        absolutePath,
        text,
      })
    } catch {
      return null
    }
  }

  /**
   * readFileFromDisk 함수.
   * 파일이 존재할 때만 동기적으로 텍스트를 읽음.
   *
   * @param absolutePath - 읽을 파일 절대 경로
   * @returns 파일 텍스트 또는 null
   */
  private readFileFromDisk(absolutePath: string): string | null {
    if (!existsSync(absolutePath)) {
      return null
    }

    try {
      return readFileSync(absolutePath, 'utf8')
    } catch {
      return null
    }
  }
}
