// Browser test harness — drives a lesson in a real Chrome, no LLM in the loop.
//
//   npm run dev                                  # in another shell
//   npm run test:browser -- --path "/dev?file=smoke.lesson.tsx" \
//                           --steps scripts/steps/smoke.json
//
// Loads the dev fixture route, waits for the sandbox to report a mounted
// lesson, then replays a declarative step script (clicks / drags / waits /
// screenshots / assertions). Steps target the *sandbox iframe* by default —
// that's where lesson DOM lives; pass "frame": "top" for the host page.
import { mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const base = arg("base", "http://localhost:3000");
const path = arg("path", "/dev");
const outDir = resolve(root, arg("out", ".bitwise-shots"));
const stepsFile = arg("steps", null);
const readyTimeout = Number(arg("timeout", 60000));
const keepOpen = argv.includes("--keep-open");
const strict = argv.includes("--strict");

const url = base + (path.startsWith("/") ? path : `/${path}`);

// ---- logging ----------------------------------------------------------------
// Two buckets: `problems` fail the run (mount, steps, uncaught exceptions);
// `noise` is console/network chatter — always printed, fatal only under
// --strict, because the sandbox's opaque origin makes some of it unavoidable
// (blocked font fetches, CSP denials).
const problems = [];
const noise = [];
const shots = [];
let shotN = 0;
const log = (...a) => console.log(...a);
const fail = (msg) => {
  problems.push(msg);
  console.error(`  ✗ ${msg}`);
};
const note = (msg) => {
  noise.push(msg);
  log(`  · ${msg}`);
};

// ---- preflight: dev server must already be up -------------------------------
try {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(
    `\n✗ no dev server at ${url} (${e.message}).\n` +
      `  Start one first:  npm run dev\n`,
  );
  process.exit(2);
}

if (!existsSync(CHROME)) {
  console.error(`\n✗ chrome not found at ${CHROME} (set CHROME_PATH to override)\n`);
  process.exit(2);
}

// ---- steps ------------------------------------------------------------------
let steps = [];
if (stepsFile) {
  const p = resolve(root, stepsFile);
  try {
    steps = JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    console.error(`\n✗ cannot read steps file ${p}: ${e.message}\n`);
    process.exit(2);
  }
  if (!Array.isArray(steps)) {
    console.error(`\n✗ steps file must be a JSON array\n`);
    process.exit(2);
  }
} else {
  steps = [{ screenshot: "initial" }];
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// ---- browser ----------------------------------------------------------------
const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    // Keep the sandboxed iframe in-process so its console/errors reach the page
    // target and its frame is drivable from here.
    "--disable-features=IsolateOrigins,site-per-process",
    "--disable-site-isolation-trials",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1200, deviceScaleFactor: 1 });

// Console + uncaught errors, from the top page and any frame (incl. sandbox).
const where = (src) => (String(src || "").includes("sandbox") ? "sandbox" : "page");
page.on("console", (m) => {
  const t = m.type();
  if (t !== "error" && t !== "warning") return;
  note(`[${where(m.location()?.url)}:console.${t}] ${m.text()}`);
});
page.on("pageerror", (e) => fail(`[${where(e.stack)}:pageerror] ${e.message}`));
page.on("requestfailed", (r) => note(`[requestfailed] ${r.url()} — ${r.failure()?.errorText}`));
browser.on("targetcreated", async (t) => {
  if (t.type() !== "iframe") return;
  const p = await t.page().catch(() => null);
  if (!p) return; // in-process frames already report through the page above
  p.on("console", (m) => m.type() === "error" && note(`[sandbox:console.error] ${m.text()}`));
  p.on("pageerror", (e) => fail(`[sandbox:pageerror] ${e.message}`));
});

let exitCode = 0;
try {
  log(`→ ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // ---- wait for the fixture to report a mounted lesson ----------------------
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("#dev-status");
        return el && (el.getAttribute("data-status") === "ready" || el.getAttribute("data-status") === "error");
      },
      { timeout: readyTimeout, polling: 200 },
    );
  } catch {
    throw new Error(`#dev-status never left idle/mounting within ${readyTimeout}ms`);
  }
  const state = await page.$eval("#dev-status", (el) => ({
    status: el.getAttribute("data-status"),
    error: el.getAttribute("data-error"),
    file: el.getAttribute("data-file"),
  }));
  if (state.status !== "ready") {
    throw new Error(`lesson failed to mount (${state.file})\n---\n${state.error || "(no data-error)"}\n---`);
  }
  log(`  ✓ mounted ${state.file}`);

  // ---- frame handles --------------------------------------------------------
  const iframeEl = await page.$("#sandbox-frame");
  if (!iframeEl) throw new Error("no #sandbox-frame on the page");
  const sandbox = page.frames().find((f) => f.url().includes("sandbox.html"));
  if (!sandbox) throw new Error("sandbox iframe frame not found (frames: " + page.frames().map((f) => f.url()).join(", ") + ")");

  const box = async () => (await iframeEl.boundingBox()) || { x: 0, y: 0, width: 0, height: 0 };
  const ctxFor = async (step) =>
    step.frame === "top"
      ? { frame: page.mainFrame(), off: { x: 0, y: 0 } }
      : { frame: sandbox, off: await box() };

  // Viewport point of a selector, in whichever frame.
  const pointOf = async (ctx, selector) => {
    const r = await ctx.frame.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, selector);
    if (!r) throw new Error(`selector not found: ${selector}`);
    return { x: ctx.off.x + r.x + r.w / 2, y: ctx.off.y + r.y + r.h / 2 };
  };

  const pointOfText = async (ctx, text) => {
    const r = await ctx.frame.evaluate((t) => {
      const hits = [...document.querySelectorAll("*")].filter((el) => (el.textContent || "").trim() === t);
      const el = hits[hits.length - 1]; // deepest match wins over its ancestors
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    }, text);
    if (!r) throw new Error(`no element with text: ${JSON.stringify(text)}`);
    return { x: ctx.off.x + r.x + r.w / 2, y: ctx.off.y + r.y + r.h / 2 };
  };

  // ---- run the step script --------------------------------------------------
  for (const [i, step] of steps.entries()) {
    const label = JSON.stringify(step);
    try {
      const ctx = await ctxFor(step);

      if ("screenshot" in step) {
        const name = `${String(++shotN).padStart(2, "0")}-${step.screenshot}.png`;
        const file = join(outDir, name);
        if (step.frame === "top") await page.screenshot({ path: file, fullPage: true });
        else await iframeEl.screenshot({ path: file });
        shots.push(file);
        log(`  ✓ shot ${name}`);
      } else if ("click" in step) {
        const p = await pointOf(ctx, step.click);
        await page.mouse.click(p.x, p.y);
        log(`  ✓ click ${step.click}`);
      } else if ("clickText" in step) {
        const p = await pointOfText(ctx, step.clickText);
        await page.mouse.click(p.x, p.y);
        log(`  ✓ clickText ${JSON.stringify(step.clickText)}`);
      } else if ("wait" in step) {
        await new Promise((r) => setTimeout(r, step.wait));
        log(`  · wait ${step.wait}ms`);
      } else if ("drag" in step) {
        const { selector, dx = 0, dy = 0 } = step.drag;
        const p = await pointOf(ctx, selector);
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        // Several moves — one jump often reads as a no-op to drag handlers.
        for (let k = 1; k <= 10; k++) await page.mouse.move(p.x + (dx * k) / 10, p.y + (dy * k) / 10);
        await page.mouse.up();
        log(`  ✓ drag ${selector} by (${dx},${dy})`);
      } else if ("expectText" in step) {
        const found = await ctx.frame.evaluate((t) => (document.body.innerText || "").includes(t), step.expectText);
        if (!found) throw new Error(`expectText not found: ${JSON.stringify(step.expectText)}`);
        log(`  ✓ text ${JSON.stringify(step.expectText)}`);
      } else if ("eval" in step) {
        const v = await ctx.frame.evaluate(step.eval);
        log(`  ✓ eval ${step.eval} → ${JSON.stringify(v)}`);
      } else {
        throw new Error("unknown step");
      }
    } catch (e) {
      fail(`step ${i + 1} ${label}: ${e.message}`);
      break;
    }
  }
} catch (e) {
  fail(e.message);
} finally {
  if (!keepOpen) await browser.close();
}

// ---- summary ----------------------------------------------------------------
log("");
log(`screenshots: ${shots.length ? shots.join("\n             ") : "(none)"} → ${outDir}`);
if (noise.length) log(`console/network noise: ${noise.length} line(s)${strict ? " (fatal — --strict)" : ""}`);
if (strict) problems.push(...noise);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  exitCode = 1;
} else {
  log(`\n✓ ${steps.length} step(s) passed`);
}
process.exit(exitCode);
