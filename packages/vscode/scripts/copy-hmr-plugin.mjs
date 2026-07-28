import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const vscodeRoot = path.resolve(__dirname, '..');
const sourceFile = path.resolve(vscodeRoot, '../hmr-plugin/dist/risuai-hmr-provider.js');
const targetFile = path.resolve(vscodeRoot, 'dist/risuai-hmr-provider.js');

if (!existsSync(sourceFile)) {
  throw new Error(`HMR plugin build output not found: ${sourceFile}`);
}

copyFileSync(sourceFile, targetFile);
