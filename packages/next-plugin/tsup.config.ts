import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/observability.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: ["next"],
  splitting: false,
  sourcemap: true,
});
