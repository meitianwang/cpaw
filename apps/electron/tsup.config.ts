import { defineConfig } from 'tsup'

// watch 模式下不 clean，避免 dev 时清空 dist 让 electron 启动找不到入口
const isWatch = process.argv.includes('--watch') || process.argv.includes('-w')

export default defineConfig([
  // Main process
  {
    entry: { 'main/index': 'src/main/index.ts' },
    format: ['cjs'],
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    clean: !isWatch,
    sourcemap: true,
    banner: {
      // Shim import.meta.url for CJS bundle (used by engine's ripgrep.ts etc.)
      js: `if(typeof globalThis.__importMetaUrl==='undefined'){const{pathToFileURL}=require('url');globalThis.__importMetaUrl=pathToFileURL(__filename).href}`,
    },
    define: {
      'import.meta.url': 'globalThis.__importMetaUrl',
    },
    external: [
      'electron',
      'better-sqlite3',
      'node-mac-permissions',
      'bun:sqlite',
      'bun:ffi',
    ],
    // 只把 ESM-only 包打进 bundle，让 esbuild 转成 CJS，
    // 避免 Node CJS require(ESM) 报 ERR_REQUIRE_ESM
    noExternal: [
      'lodash-es',
      'execa',
      'chalk',
      'strip-ansi',
      'figures',
      'p-map',
      'env-paths',
      'chokidar',
      'unicorn-magic',
      'signal-exit',
      'marked',
      'cli-highlight',
      'image-size',
      'fuse.js',
      'type-fest',
      'turndown',
      'fflate',
      'diff',
      'ignore',
      'undici',
      'croner',
      'proper-lockfile',
      'lru-cache',
      'jsonc-parser',
      '@alcalzone/ansi-tokenize',
      '@modelcontextprotocol/sdk',
    ],
    loader: {
      '.md': 'text',
      '.txt': 'text',
    },
    alias: {
      'bun:bundle': './src/engine/shims/bun-bundle.ts',
    },
    // Copy bundled connector scripts (ESM .mjs spawned as child processes) to
    // dist/connectors/. They are NOT bundled by tsup — ConnectorManager
    // spawns them directly via process.execPath (+ ELECTRON_RUN_AS_NODE).
    // Also copy vendor/ripgrep next to main/index.js — engine's ripgrep.ts
    // resolves rg relative to its own dirname, which after bundling is dist/main/.
    onSuccess: 'mkdir -p dist/connectors && cp src/connectors/*.mjs dist/connectors/ && cp -R src/engine/utils/vendor dist/main/',
  },
  // Preload
  {
    entry: { 'preload/preload': 'src/preload/preload.ts' },
    format: ['cjs'], // Electron preload needs CJS
    target: 'node20',
    platform: 'node',
    outDir: 'dist',
    sourcemap: true,
    external: ['electron'],
  },
])
