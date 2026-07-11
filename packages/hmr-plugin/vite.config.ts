import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

type PackageMetadata = {
  readonly name: string;
  readonly displayName: string;
  readonly version: string;
  readonly description: string;
  readonly link: string;
};

const configRoot = dirname(fileURLToPath(import.meta.url));
const distRoot = resolve(configRoot, 'dist');
const windowsDriveOutputRoot = '/mnt/d/risu';

const sanitizeBannerValue = (value: string): string =>
  value.replace(/[\r\n]+/g, ' ').trim();

const getStringField = (source: object, key: string, fallback: string): string => {
  const value = Reflect.get(source, key);
  return typeof value === 'string' ? sanitizeBannerValue(value) : fallback;
};

const toBundleFileName = (packageName: string): string =>
  `${packageName.replace(/^@/, '').replace(/[\\/]/g, '-')}.js`;

const readPackageMetadata = (): PackageMetadata => {
  const parsedPackageJson: unknown = JSON.parse(
    readFileSync(resolve(configRoot, 'package.json'), 'utf8'),
  );

  if (typeof parsedPackageJson !== 'object' || parsedPackageJson === null) {
    throw new TypeError('package.json must contain an object');
  }

  const name = getStringField(parsedPackageJson, 'name', 'risu-plugin');
  const version = getStringField(parsedPackageJson, 'version', '0.0.0');
  const description = getStringField(parsedPackageJson, 'description', 'RisuAI plugin');
  const link = getStringField(
    parsedPackageJson,
    'homepage',
    `https://unpkg.com/${name}@${version}/dist/${toBundleFileName(name)}`,
  );

  return {
    name,
    displayName: getStringField(parsedPackageJson, 'displayName', name),
    version,
    description,
    link,
  };
};

const packageMetadata = readPackageMetadata();
const bundleFileName = toBundleFileName(packageMetadata.name);
const metadataBanner = `//@name ${packageMetadata.name}
//@display-name ${packageMetadata.displayName}
//@api 3.0
//@version ${packageMetadata.version}
//@description ${packageMetadata.description}
//@link ${packageMetadata.link}
`;

const singleBundlePlugin = (): Plugin => ({
  name: 'risu-single-plugin-bundle',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const cssBlocks: string[] = [];

    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type === 'asset' && fileName.endsWith('.css')) {
        cssBlocks.push(String(output.source));
        delete bundle[fileName];
      }
    }

    const cssRuntime = cssBlocks.length > 0
      ? `const style = document.createElement("style");style.textContent = ${JSON.stringify(cssBlocks.join('\n'))};document.head.append(style);\n`
      : '';

    for (const output of Object.values(bundle)) {
      if (output.type === 'chunk') {
        output.code = `${metadataBanner}${cssRuntime}${output.code}`;
      }
    }
  },
});

const copyBundleToWindowsDrivePlugin = (): Plugin => ({
  name: 'risu-copy-plugin-bundle-to-windows-drive',
  closeBundle() {
    mkdirSync(windowsDriveOutputRoot, { recursive: true });
    cpSync(distRoot, windowsDriveOutputRoot, { recursive: true });
  },
});

export default defineConfig({
  build: {
    lib: {
      entry: resolve(configRoot, 'src/main.ts'),
      name: packageMetadata.name,
      fileName: () => bundleFileName,
      formats: ['es'],
    },
    outDir: distRoot,
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    minify: 'esbuild',
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  plugins: [
    svelte({
      compilerOptions: {
        runes: true,
      },
      emitCss: false,
    }),
    singleBundlePlugin(),
    copyBundleToWindowsDrivePlugin(),
  ],
});
