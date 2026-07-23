// Bundles the sandbox runtime (React + the Bitwise SDK + an in-frame Babel
// transform + the mount harness) into a single self-contained script served
// from /public. Run automatically before `dev` and `build`.
import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [join(root, "sandbox/runtime.tsx")],
  outfile: join(root, "public/sandbox-runtime.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  loader: { ".tsx": "tsx", ".ts": "ts" },
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  sourcemap: true,
  logLevel: "info",
});

// KaTeX ships its stylesheet separately; the sandbox HTML links it directly.
await mkdir(join(root, "public"), { recursive: true });
const katexCss = require.resolve("katex/dist/katex.min.css");
await copyFile(katexCss, join(root, "public/katex.min.css"));

// KaTeX fonts referenced by the CSS (url(fonts/...)) — copy the whole dir.
const fontsDir = join(dirname(katexCss), "fonts");
if (existsSync(fontsDir)) {
  const { readdir } = await import("node:fs/promises");
  await mkdir(join(root, "public/fonts"), { recursive: true });
  for (const f of await readdir(fontsDir)) {
    await copyFile(join(fontsDir, f), join(root, "public/fonts", f));
  }
}

console.log("[build:sandbox] wrote public/sandbox-runtime.js + katex assets");
