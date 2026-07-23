// Runner for the M1 eval harness. The harness is TypeScript that imports the
// verifier and prompt modules (extensionless imports, JSX, TS types), so we let
// esbuild bundle it — keeping npm packages external so mathjs/babel/anthropic
// resolve from node_modules at runtime — then import and run it.
//
//   npm run eval            # deterministic verifier gate battery
//   npm run eval -- --live  # also generate lessons live (needs ANTHROPIC_API_KEY)

import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const outfile = path.join(root, ".bitwise-eval.mjs");

await build({
  entryPoints: [path.join(root, "scripts/harness.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile,
  logLevel: "warning",
});

try {
  const mod = await import(pathToFileURL(outfile).href);
  const failures = await mod.run(process.argv.slice(2));
  process.exitCode = failures;
} finally {
  await rm(outfile, { force: true });
}
