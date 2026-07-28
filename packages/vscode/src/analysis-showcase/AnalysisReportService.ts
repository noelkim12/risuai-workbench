import * as vscode from 'vscode';
import { isSafeAnalysisReportFileName } from '@risuai-workbench/core';
import { serveRemoteAnalysisReport } from './RemoteAnalysisReportServer';

export type AnalysisReportOpenResult =
  | { readonly kind: 'opened'; readonly uri: vscode.Uri }
  | { readonly kind: 'missing'; readonly uri: vscode.Uri }
  | { readonly kind: 'unsafe' }
  | { readonly kind: 'not-opened'; readonly uri: vscode.Uri };

export class AnalysisReportService {
  async open(rootUri: vscode.Uri, reportFileName: string): Promise<AnalysisReportOpenResult> {
    const reportUri = this.createReportUri(rootUri, reportFileName);
    if (reportUri === null) {
      return { kind: 'unsafe' };
    }

    if (!(await this.reportExists(reportUri))) {
      return { kind: 'missing', uri: reportUri };
    }

    const isRemote = vscode.env.remoteName !== undefined || reportUri.scheme !== 'file';
    const remoteReport = isRemote ? await serveRemoteAnalysisReport(reportUri) : null;
    const opened = await vscode.env.openExternal(remoteReport?.uri ?? reportUri);
    if (opened) {
      return { kind: 'opened', uri: reportUri };
    }

    remoteReport?.close();

    return { kind: 'not-opened', uri: reportUri };
  }

  async exists(rootUri: vscode.Uri, reportFileName: string): Promise<boolean> {
    const reportUri = this.createReportUri(rootUri, reportFileName);
    if (reportUri === null) {
      return false;
    }

    return this.reportExists(reportUri);
  }

  async reveal(uri: vscode.Uri): Promise<void> {
    await vscode.commands.executeCommand('revealFileInOS', uri);
  }

  private createReportUri(rootUri: vscode.Uri, reportFileName: string): vscode.Uri | null {
    if (!isSafeAnalysisReportFileName(reportFileName)) {
      return null;
    }

    return vscode.Uri.joinPath(rootUri, 'analysis', reportFileName);
  }

  private async reportExists(uri: vscode.Uri): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      return stat.type === vscode.FileType.File;
    } catch (error) {
      if (error instanceof Error) {
        return false;
      }
      throw error;
    }
  }
}
