import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "./src/index.ts",
  },
  dts: true,
  format: ["esm"],
  sourcemap: false,
  clean: true,
  outDir: "dist",
});
