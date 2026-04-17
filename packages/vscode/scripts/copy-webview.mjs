import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vscodeRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(vscodeRoot, '../webview/dist');
const targetDir = path.resolve(vscodeRoot, 'dist/webview');

if (!existsSync(sourceDir)) {
  throw new Error(`Webview build output not found: ${sourceDir}`);
}

rmSync(targetDir, { force: true, recursive: true });
mkdirSync(targetDir, { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });
