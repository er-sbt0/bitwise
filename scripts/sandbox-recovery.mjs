// Regression guard for the SILENT failure mode: after a lesson throws, the next
// lesson must still mount and still report back.
//
//   npm run dev                    # in another shell
//   npm run test:recover
//
// Why this has its own script. The self-repair loop is only as good as the
// sandbox's ability to mount a *second* lesson after a first one blew up — and
// when that broke, it broke quietly: React keeps one error-boundary instance
// across renders into the same root, and a boundary that has caught once renders
// null forever. The repaired lesson then produced no output, no `mounted` and no
// `error`, so the host sat on a blank frame with nothing to repair. Nothing else
// in the test suite posts two lessons in a row, so nothing else can see it.
import puppeteer from "puppeteer-core";

const CHROME = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const base = process.env.BASE || "http://localhost:3000";
const url = `${base}/sandbox.html`;

const BAD = `export const meta = { concept: "bad" }
export default function Lesson() {
  return <Section title="Boom"><Prose>{\`x\`}</Prose>{thisIdentifierDoesNotExist}</Section>
}`;

const GOOD = `export const meta = { concept: "good" }
export default function Lesson() {
  const s = useStage({ a: 1 })
  return (
    <Section title="Recovered">
      <Prose>{\`It works: a = \${fmt(s.a)}\`}</Prose>
      <Plot x={[-3, 3]} y={[-3, 3]} height={200}><Plot.OfX y={(x) => s.a * x} color="blue" /></Plot>
      <Slider value={s.a} onChange={(a) => s.set({ a })} min={-2} max={2} step={0.1} label="a" />
    </Section>
  )
}`;

try {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`✗ ${url} is not reachable (${e.message}). Start the dev server first: npm run dev`);
  process.exit(1);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__msgs = [];
  window.addEventListener("message", (e) => window.__msgs.push(e.data));
});
await page.goto(url, { waitUntil: "networkidle2" });

const post = async (id, code) => {
  await page.evaluate((m) => window.postMessage(m, "*"), { type: "render", id, code });
  await new Promise((r) => setTimeout(r, 1400));
};

await post("bad-1", BAD);
await post("good-1", GOOD);

const msgs = await page.evaluate(() => window.__msgs.filter((m) => m && m.type !== "telemetry" && m.type !== "size"));
const root = await page.evaluate(() => ({
  text: document.getElementById("root").innerText,
  svgs: document.querySelectorAll("svg").length,
}));
await browser.close();

const problems = [];
if (!msgs.some((m) => m.type === "error" && m.id === "bad-1")) problems.push("the broken lesson did not report an error");
if (!msgs.some((m) => m.type === "mounted" && m.id === "good-1")) problems.push("the following lesson never reported `mounted`");
if (!root.text.includes("Recovered") || root.svgs === 0) problems.push("the following lesson rendered nothing");

console.log(msgs.map((m) => `  · ${m.type}${m.id ? " " + m.id : ""}${m.phase ? ` (${m.phase})` : ""}`).join("\n"));
if (problems.length) {
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  process.exit(1);
}
console.log("\n✓ the sandbox recovers from a failed lesson");
