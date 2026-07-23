// Bundles the W1 hybrid spike into a standalone html+js in this directory.
// Mirrors scripts/build-sandbox.mjs (iife / es2022 / automatic JSX / NODE_ENV
// define) except `minify` is off so the bundle stays readable while spiking.
import { build } from "esbuild";
import { copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

const result = await build({
  entryPoints: [join(here, "spike.tsx")],
  outfile: join(here, "spike.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  define: { "process.env.NODE_ENV": '"production"' },
  minify: false,
  sourcemap: false, // a 3 MB map is not evidence; regenerate with true if debugging
  metafile: true,
  logLevel: "info",
  absWorkingDir: root,
});

// Mafs needs its stylesheet; the sandbox will copy this the way KaTeX's is.
await copyFile(require.resolve("mafs/core.css"), join(here, "core.css"));

const bytes = Object.values(result.metafile.outputs).find((o) => o.entryPoint)?.bytes ?? 0;
console.log(`[spike] wrote spike.js (${(bytes / 1024).toFixed(0)} kB unminified) + core.css`);
