import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
  },
  dts: false,
  format: ["esm"],
  sourcemap: false,
  clean: true,
  outDir: "dist",
  platform: "node",
  target: "node20",
  noExternal: ["@agentrules/core"],
});
