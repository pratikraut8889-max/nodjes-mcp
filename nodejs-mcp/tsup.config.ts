import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  minify: true,
  // This is an executable MCP server, not a published TypeScript library.
  // Skip declaration bundling, which also avoids rollup-plugin-dts incompatibility.
  dts: false,
});
