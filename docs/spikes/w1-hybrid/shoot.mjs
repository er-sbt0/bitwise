// Drives the built spike in headless Chrome and captures the evidence:
// initial / mid-animation / final / after-drag / reset, plus render counts,
// Motion tick rates, resolved SVG attributes and any console noise.
import puppeteer from "puppeteer-core";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const url = "file://" + join(here, "index.html");

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  defaultViewport: { width: 820, height: 780, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`${m.type()}: ${m.text()}`));
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: "load" });
await page.waitForSelector(".MafsView svg");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = () =>
  page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const attrs = (el, names) =>
      el ? Object.fromEntries(names.map((n) => [n, el.getAttribute(n)])) : null;
    const line = q('[data-layer="pixel-space"] line');
    const mCircle = q('[data-layer="pixel-space"] circle:nth-of-type(1)');
    const manual = q('[data-layer="pixel-space"] circle:nth-of-type(2)');
    const mathNss = q('[data-layer="math-space"] line:nth-of-type(1)');
    return {
      renders: { ...window.__spike.renders },
      ticks: { ...window.__spike.ticks },
      values: { ...window.__spike.values },
      errors: [...window.__spike.errors],
      L1_line: attrs(line, ["x1", "y1", "x2", "y2", "pathLength", "stroke-dasharray", "stroke-dashoffset", "style"]),
      L2_motionCircle: attrs(mCircle, ["cx", "cy", "fill"]),
      L3_manualCircle: attrs(manual, ["cx", "cy", "fill"]),
      L4_mathLineNSS: attrs(mathNss, ["x1", "y1", "x2", "y2", "pathLength", "stroke-dasharray", "stroke-dashoffset"]),
      svgViewBox: q(".MafsView svg")?.getAttribute("viewBox"),
      svgChildTags: [...(q(".MafsView svg")?.children ?? [])].map(
        (c) => c.tagName + (c.getAttribute("data-layer") ? `[${c.getAttribute("data-layer")}]` : ""),
      ),
      viewTransformCss: q(".MafsView svg")?.style.getPropertyValue("--mafs-view-transform"),
      ptLabel: q("#ptlabel")?.textContent,
    };
  });

const shots = {};
const shot = async (name) => {
  await page.screenshot({ path: join(here, `${name}.png`) });
  shots[name] = await probe();
};

await shot("1-initial");

// --- play -------------------------------------------------------------
await page.click("#play");
await sleep(600);
await shot("2-mid");
await sleep(1400);
await shot("3-final");

// --- Mafs interactivity under React 19: drag the MovablePoint ---------
const box = await page.evaluate(() => {
  const el = document.querySelector(".mafs-movable-point-point");
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(box.x, box.y);
await page.mouse.down();
await page.mouse.move(box.x - 140, box.y - 40, { steps: 12 });
await page.mouse.up();
await sleep(120);
await shot("4-after-drag");

// --- replay then reset -------------------------------------------------
await page.click("#play");
await sleep(500);
await shot("5-replay-mid");
await page.click("#reset");
await sleep(150);
await shot("6-reset");

// --- viewTransform change (resize) mid-animation -----------------------
await page.click("#play");
await sleep(500);
await page.click("#resize");
await sleep(250);
await shot("7-resized-mid");
await sleep(1200);
await shot("8-resized-final");

const report = { consoleMsgs, shots };
await writeFile(join(here, "measurements.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
