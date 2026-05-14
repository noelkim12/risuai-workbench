import path from 'path';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'risu-workbench-core/cbs-browser': path.resolve(__dirname, '../core/src/cbs-browser.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: true,
    hmr: {
      host: '127.0.0.1',
      port: 5173,
      protocol: 'ws',
    },
  },
  plugins: [
    svelte({
      preprocess: vitePreprocess(),
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
