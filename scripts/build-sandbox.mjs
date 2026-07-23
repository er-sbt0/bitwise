// Bundles the sandbox runtime (React + the Bitwise SDK + an in-frame Babel
// transform + the mount harness) into a single self-contained script served
// from /public. Run automatically before `dev` and `build`.
import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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
//
// The fonts, though, cannot be *fetched* by the sandbox: the iframe runs with
// `allow-scripts` and no `allow-same-origin`, so it is an opaque origin and a
// same-origin `url(fonts/…)` request is CORS-blocked — math silently falls back
// to a system face. So we inline each face as a `data:` URI (which the sandbox
// CSP explicitly permits via `font-src 'self' data:`) and drop the woff/ttf
// alternates, since every browser we target reads woff2.
await mkdir(join(root, "public"), { recursive: true });
const katexCss = require.resolve("katex/dist/katex.min.css");
const fontsDir = join(dirname(katexCss), "fonts");

let css = await readFile(katexCss, "utf8");
let inlined = 0;
css = css.replace(/src:[^;}]+/g, (decl) => {
  const woff2 = decl.match(/url\(fonts\/([\w-]+\.woff2)\)/);
  if (!woff2 || !existsSync(join(fontsDir, woff2[1]))) return decl;
  inlined++;
  const b64 = readFileSync(join(fontsDir, woff2[1])).toString("base64");
  return `src:url(data:font/woff2;base64,${b64}) format("woff2")`;
});
await writeFile(join(root, "public/katex.min.css"), css);

console.log(
  `[build:sandbox] wrote public/sandbox-runtime.js + katex.min.css (${inlined} fonts inlined, ${(css.length / 1024) | 0} kB)`,
);
