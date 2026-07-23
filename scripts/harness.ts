// Eval harness v1 — the automated release gate for generated lessons. It proves
// the M1 verifier actually catches the failures it exists to catch, on a fixed
// battery of planted defects, and (with --live) that freshly generated lessons
// clear every gate before mount. It exits non-zero on any regression, so CI can
// block release. Content here is never hand-reviewed in production — this battery
// is the standing proof the machinery works.
//
// Run via `npm run eval` (esbuild bundles this TS + deps, see scripts/eval.mjs).

import { verify, type VerifyGate } from "../app/api/generate/verify";
import { MOCK_PLAN, type LessonPlan } from "../app/api/generate/prompts/plan";
import { MOCK_LESSON } from "../app/api/generate/prompts/build";

interface Fixture {
  name: string;
  plan: LessonPlan;
  code: string;
  /** Expected outcome: does it pass all hard gates, and which gates must fire. */
  expect: { ok: boolean; gates?: VerifyGate[] };
}

const noAssess: LessonPlan = { ...MOCK_PLAN, assessments: [] };

// A minimal valid lesson skeleton for targeted single-defect fixtures.
const skeleton = (body: string, exercise = "") => `export const meta = { concept: "t", difficulty: 1 }
export default function Lesson() {
  ${body}
  return (
    <Section title="t">
      <Prose>{\`Body.\`}</Prose>
      ${exercise}
    </Section>
  )
}`;

const FIXTURES: Fixture[] = [
  {
    name: "good — mock lesson passes every gate",
    plan: MOCK_PLAN,
    code: MOCK_LESSON,
    expect: { ok: true, gates: [] },
  },
  {
    name: "wrong graded answer (grades 6, canonical is 5)",
    plan: MOCK_PLAN,
    code: MOCK_LESSON.replace("value: 5, tolerance: 0.001", "value: 6, tolerance: 0.001"),
    expect: { ok: false, gates: ["answer"] },
  },
  {
    name: "wrong CANONICAL — plan's own answer fails re-derivation",
    // Plan claims the minimum is 7; the derivation recomputes 5. Code grades 7 to
    // match the (wrong) canonical, so only the independent re-derivation catches it.
    plan: {
      ...MOCK_PLAN,
      assessments: [
        {
          ask: "min value",
          answer: { type: "numeric", value: 7, tolerance: 0.001 },
          derivation: { given: "2*(x-3)^2 + 5", op: "evaluate", var: "x", at: 3 },
        },
      ],
    },
    code: skeleton(
      `const f = (x) => 2 * (x - 3) ** 2 + 5`,
      `<Exercise prompt={<Prose>{\`min?\`}</Prose>} answer={{ type: "numeric", value: 7, tolerance: 0.001 }} input="number" />`,
    ),
    expect: { ok: false, gates: ["answer"] },
  },
  {
    name: "grades an answer the plan never committed to",
    plan: noAssess,
    code: skeleton(
      "",
      `<Exercise prompt={<Prose>{\`q\`}</Prose>} answer={{ type: "numeric", value: 3 }} input="number" />`,
    ),
    expect: { ok: false, gates: ["answer"] },
  },
  {
    name: "disallowed identifier (network access)",
    plan: noAssess,
    code: skeleton(`const data = fetch("https://x")`),
    expect: { ok: false, gates: ["allowlist"] },
  },
  {
    name: "disallowed identifier (DOM access)",
    plan: noAssess,
    code: skeleton(`const w = window.innerWidth`),
    expect: { ok: false, gates: ["allowlist"] },
  },
  {
    name: "dead interaction — state set up but never read",
    plan: noAssess,
    code: skeleton(`const [a, setA] = useLessonState("a", 1)`, `<Slider value={1} onChange={setA} min={0} max={5} />`),
    expect: { ok: true, gates: ["dead-interaction"] }, // soft: reported, not blocking
  },
  {
    name: "custom grader — flagged as unverifiable",
    plan: noAssess,
    code: skeleton(
      "",
      `<Exercise prompt={<Prose>{\`q\`}</Prose>} answer={{ type: "custom", grade: (x) => ({ correct: x === "3" }) }} />`,
    ),
    expect: { ok: true, gates: ["custom-grader"] }, // soft
  },
];

// ── runner ───────────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", RESET = "\x1b[0m";

function runFixtures(): number {
  let failed = 0;
  console.log(`\nVerifier gate battery (${FIXTURES.length} fixtures)\n`);
  for (const fx of FIXTURES) {
    const report = verify(fx.plan, fx.code);
    const firedGates = new Set(report.findings.map((f) => f.gate));
    const wantGates = new Set(fx.expect.gates ?? []);

    const okMatch = report.ok === fx.expect.ok;
    const gatesMatch =
      [...wantGates].every((g) => firedGates.has(g)) &&
      // no UNEXPECTED hard finding beyond the ones we asked for
      report.findings.filter((f) => f.severity === "hard").every((f) => wantGates.has(f.gate));

    const pass = okMatch && gatesMatch;
    if (!pass) failed++;
    const mark = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${mark} ${fx.name}`);
    if (!pass) {
      console.log(`      ${DIM}expected ok=${fx.expect.ok} gates=[${[...wantGates]}]${RESET}`);
      console.log(`      ${DIM}got      ok=${report.ok} findings=${JSON.stringify(report.findings.map((f) => `${f.gate}:${f.severity}`))}${RESET}`);
      for (const f of report.findings) console.log(`      ${DIM}· ${f.detail}${RESET}`);
    }
  }
  console.log(`\n${failed ? RED : GREEN}${FIXTURES.length - failed}/${FIXTURES.length} fixtures passed${RESET}\n`);
  return failed;
}

// ── optional: live batch generation (--live [N]) ─────────────────────────────

const LIVE_CONCEPTS = [
  "the derivative of x squared is 2x",
  "why the area of a triangle is one half base times height",
  "adding fractions requires a common denominator",
  "the slope between two points",
];

async function runLive(n: number): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${RED}--live requires ANTHROPIC_API_KEY${RESET}`);
    return 1;
  }
  const { runPipeline } = await import("../app/api/generate/pipeline");
  const concepts = LIVE_CONCEPTS.slice(0, n);
  let failed = 0;
  console.log(`\nLive generation gate (${concepts.length} concepts)\n`);
  for (const c of concepts) {
    try {
      const { report } = await runPipeline(c);
      const v = report.verify;
      const pass = !!v?.ok;
      if (!pass) failed++;
      const mark = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
      console.log(`  ${mark} ${c} ${DIM}(${v?.checked ?? 0} checked, ${report.repairs} repairs)${RESET}`);
      if (!pass) for (const f of v?.findings ?? []) console.log(`      ${DIM}${f.gate}:${f.severity} — ${f.detail}${RESET}`);
    } catch (e: any) {
      failed++;
      console.log(`  ${RED}✗${RESET} ${c} ${DIM}— pipeline threw: ${String(e?.message || e)}${RESET}`);
    }
  }
  console.log(`\n${failed ? RED : GREEN}${concepts.length - failed}/${concepts.length} live generations passed${RESET}\n`);
  return failed;
}

export async function run(argv: string[]): Promise<number> {
  let failed = runFixtures();
  const liveIdx = argv.indexOf("--live");
  if (liveIdx !== -1) {
    const n = Number(argv[liveIdx + 1]) || LIVE_CONCEPTS.length;
    failed += await runLive(n);
  }
  return failed === 0 ? 0 : 1;
}
