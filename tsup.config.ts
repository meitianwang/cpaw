import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  dts: true,
  sourcemap: true,
  external: ["bun:sqlite", "@larksuiteoapi/node-sdk"],
  loader: {
    ".md": "text",
    ".txt": "text",
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
});
