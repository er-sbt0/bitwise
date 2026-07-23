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
import { MOCK_LESSON, BUILD_SYSTEM } from "../app/api/generate/prompts/build";
import { buildScope } from "../sandbox/sdk";
import {
  liveTopLevelNames,
  livePlotMembers,
  plannedTopLevelNames,
  plannedPlotMembers,
} from "../sdk/surface";

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
    name: "planned primitive — <Geometry> declared but not implemented",
    plan: noAssess,
    code: skeleton("", `<Geometry bounds={[-5, 5, 5, -5]}><Prose>{\`x\`}</Prose></Geometry>`),
    expect: { ok: false, gates: ["allowlist"] },
  },
  {
    name: "planned Plot mark — <Plot.OfY> declared but not implemented",
    plan: noAssess,
    code: skeleton("", `<Plot x={[-5, 5]} y={[-5, 5]}><Plot.OfY x={(y) => y} /></Plot>`),
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

// ── drift gate: contract ⟺ runtime ⟺ prompt ──────────────────────────────────
// The standing proof that sdk/sdk.d.ts is a TRUTHFUL single source of truth.
// A `@status live` name must be exactly what the runtime renders, and the
// authoring prompt must never advertise a `@status planned` primitive. Any
// disagreement here is drift — the class of bug this whole surface exists to
// kill — so it fails the release gate.

/** Names buildScope() injects that aren't SDK-declared (React plumbing). */
const NON_SDK_SCOPE = new Set(["React"]);

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

function runDriftGate(): number {
  console.log(`Drift gate — contract ⟺ runtime ⟺ prompt\n`);
  const problems: string[] = [];
  const check = (label: string, issues: string[]) => {
    const pass = issues.length === 0;
    console.log(`  ${pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${label}`);
    for (const i of issues) {
      console.log(`      ${DIM}${i}${RESET}`);
      problems.push(`${label}: ${i}`);
    }
  };

  const scope = buildScope();
  const runtimeTop = new Set(Object.keys(scope).filter((k) => !NON_SDK_SCOPE.has(k)));
  const liveTop = liveTopLevelNames();
  check("top-level: every runtime primitive is @status live in the contract", [
    ...diff(runtimeTop, liveTop).map(
      (n) => `runtime injects "${n}" but the contract does not mark it @status live (add the tag, or stop injecting it).`,
    ),
  ]);
  check("top-level: every @status live primitive exists in the runtime", [
    ...diff(liveTop, runtimeTop).map(
      (n) => `contract marks "${n}" @status live but the runtime doesn't implement it (implement it, or set @status planned).`,
    ),
  ]);

  const runtimePlot = new Set(Object.keys((scope.Plot ?? {}) as object));
  const livePlot = livePlotMembers();
  check("Plot marks: runtime ⟺ @status live", [
    ...diff(runtimePlot, livePlot).map((n) => `runtime has Plot.${n} but contract doesn't mark it @status live.`),
    ...diff(livePlot, runtimePlot).map((n) => `contract marks Plot.${n} @status live but the runtime lacks it.`),
  ]);

  // The prompt may describe only live primitives — never advertise a planned one.
  const advertised = (name: string, member = false) => {
    const pat = member
      ? new RegExp(`Plot\\.${name}\\b`)
      : new RegExp(`<${name}\\b|\\b${name}\\s*\\(|\\b${name}=`);
    return pat.test(BUILD_SYSTEM);
  };
  check("prompt advertises no @status planned primitive", [
    ...[...plannedTopLevelNames()].filter((n) => advertised(n)).map((n) => `BUILD_SYSTEM advertises "${n}", which is @status planned.`),
    ...[...plannedPlotMembers()].filter((n) => advertised(n, true)).map((n) => `BUILD_SYSTEM advertises "Plot.${n}", which is @status planned.`),
  ]);

  const total = 4;
  const failed = problems.length ? 1 : 0; // any drift fails the gate
  console.log(`\n${problems.length ? RED : GREEN}${total - (problems.length ? 1 : 0)}/${total} drift checks passed${RESET}\n`);
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
  let failed = runDriftGate() + runFixtures();
  const liveIdx = argv.indexOf("--live");
  if (liveIdx !== -1) {
    const n = Number(argv[liveIdx + 1]) || LIVE_CONCEPTS.length;
    failed += await runLive(n);
  }
  return failed === 0 ? 0 : 1;
}
