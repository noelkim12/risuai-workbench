import { randomUUID } from 'node:crypto';
import { createServer, type Server, type ServerResponse } from 'node:http';
import * as vscode from 'vscode';

const SERVER_LIFETIME_MS = 60_000;

export type RemoteReportHandle = {
  readonly uri: vscode.Uri;
  close(): void;
};

export async function serveRemoteAnalysisReport(reportUri: vscode.Uri): Promise<RemoteReportHandle> {
  const token = randomUUID();
  const analysisUri = vscode.Uri.joinPath(reportUri, '..');
  const server = createServer((request, response) => {
    void serveRequest(analysisUri, token, request.url, response);
  });

  const port = await listen(server);
  server.unref();
  const timeout = setTimeout(() => server.close(), SERVER_LIFETIME_MS);
  timeout.unref();

  const localUri = vscode.Uri.parse(`http://127.0.0.1:${port}/${token}/${encodeURIComponent(reportUri.path.split('/').at(-1) ?? 'report.html')}`);
  const uri = vscode.env.remoteName === 'wsl' || vscode.env.remoteName === undefined
    ? localUri
    : await vscode.env.asExternalUri(localUri);
  return {
    uri,
    close: () => {
      clearTimeout(timeout);
      server.close();
    },
  };
}

async function serveRequest(
  analysisUri: vscode.Uri,
  token: string,
  requestUrl: string | undefined,
  response: ServerResponse,
): Promise<void> {
  const fileName = getRequestedFileName(requestUrl, token);
  if (fileName === null) {
    response.writeHead(404).end();
    return;
  }

  try {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(analysisUri, fileName));
    response.writeHead(200, {
      'Content-Type': contentType(fileName),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(bytes);
  } catch (error) {
    if (error instanceof Error) {
      response.writeHead(404).end();
      return;
    }
    throw error;
  }
}

function getRequestedFileName(requestUrl: string | undefined, token: string): string | null {
  if (requestUrl === undefined) return null;
  const prefix = `/${token}/`;
  if (!requestUrl.startsWith(prefix)) return null;

  try {
    const fileName = decodeURIComponent(requestUrl.slice(prefix.length).split('?')[0] ?? '');
    if (fileName.length === 0 || fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..') {
      return null;
    }
    return fileName;
  } catch (error) {
    if (error instanceof URIError) return null;
    throw error;
  }
}

function contentType(fileName: string): string {
  if (fileName.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fileName.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (fileName.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fileName.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('The analysis report server did not receive a TCP port.'));
        return;
      }
      resolve(address.port);
    });
  });
}
