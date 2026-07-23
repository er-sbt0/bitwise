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

// Mafs' core.css is MANDATORY, not cosmetic: `.MafsView` is where every
// `--mafs-*` custom property and every `.mafs-movable-point-*` rule is defined,
// so without it a draggable point renders invisible and unstyled.
//
// `font.css` is deliberately NOT shipped — it `@import`s the computer-modern
// webfont over the network, which the sandbox CSP blocks (connect-src 'none').
// core.css itself references no external asset today; the assert below is what
// tells us if a future version starts to, since a url() would be CORS-blocked
// from the sandbox's opaque origin and would need the same data: inlining.
let mafsCss = await readFile(require.resolve("mafs/core.css"), "utf8");
const external = mafsCss.match(/url\((?!['"]?data:)[^)]*\)|@import[^;]*/g);
if (external) throw new Error(`mafs/core.css references external assets, inline them: ${external}`);

// One rule has to go. `.MafsView path { stroke: var(--mafs-fg) }` is a default
// for paths that don't set a stroke — but a CSS rule outranks a *presentation
// attribute*, so it also overrides `stroke="#e08a2f"` / `stroke="none"` on every
// path a lesson draws through <Custom>, silently outlining fills and recoloring
// arrowheads. Mafs' own paths all set an inline `style.stroke`, so nothing of
// Mafs' depends on it. Assert it exists: a version that renames it should make
// us re-check rather than fail silently.
const FG_PATH_RULE = /\.MafsView path \{\s*stroke: var\(--mafs-fg\);\s*\}\n*/;
if (!FG_PATH_RULE.test(mafsCss)) throw new Error("mafs/core.css: `.MafsView path` rule not found — re-check the override");
mafsCss = mafsCss.replace(FG_PATH_RULE, "");

await writeFile(join(root, "public/mafs-core.css"), mafsCss);

console.log(
  `[build:sandbox] wrote public/sandbox-runtime.js + katex.min.css (${inlined} fonts inlined, ` +
    `${(css.length / 1024) | 0} kB) + mafs-core.css (${(mafsCss.length / 1024) | 0} kB)`,
);
