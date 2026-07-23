// Regenerates the BUILD prompt's few-shot from the golden lesson.
//
// The few-shot in prompts/build.ts must be the golden lesson verbatim: it is the
// same artifact wearing three hats (API contract, prompt example, acceptance
// test), and an example that drifts from the runtime teaches the model to write
// lessons that no longer mount. Editing the lesson therefore means regenerating
// here — by machine, because the escaping has a trap (see below).
//
//   node scripts/sync-fewshot.mjs           # rewrite build.ts from the lesson
//   node scripts/sync-fewshot.mjs --check   # exit 1 if they disagree
//
// `npm run eval` enforces the same invariant, so a forgotten sync fails CI.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const LESSON = join(root, "sdk/examples/newton.lesson.tsx");
const BUILD = join(root, "app/api/generate/prompts/build.ts");

const OPEN = "const FEWSHOT = `";
const CLOSE = "`;";

/** The lesson minus its header block comment — the part that is actual lesson. */
export function lessonBody(src) {
  return src.replace(/^\/\*[\s\S]*?\*\/\s*/, "").trimEnd();
}

/** Escape for embedding in a TS template literal. Order matters: backslashes
 *  first, or we would re-escape the ones we just introduced. */
function escapeForTemplate(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

const body = lessonBody(await readFile(LESSON, "utf8"));
const build = await readFile(BUILD, "utf8");

const start = build.indexOf(OPEN);
if (start === -1) throw new Error("build.ts: could not find the FEWSHOT opening");
const from = start + OPEN.length;
const end = build.indexOf(CLOSE, from);
if (end === -1) throw new Error("build.ts: could not find the FEWSHOT terminator");

const current = build.slice(from, end);
const wanted = escapeForTemplate(body);

if (current === wanted) {
  console.log("[sync-fewshot] already in sync");
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.error("[sync-fewshot] OUT OF SYNC — the few-shot no longer matches the golden lesson.");
  console.error("  run: node scripts/sync-fewshot.mjs");
  process.exit(1);
}

// NB: build the output by slicing, NOT String.replace — in a replacement string
// `$$` means "a literal $", so every $$…$$ display-math delimiter in the lesson
// would silently collapse to a single $.
await writeFile(BUILD, build.slice(0, from) + wanted + build.slice(end));
console.log(`[sync-fewshot] rewrote the few-shot from the golden lesson (${body.length} chars)`);
