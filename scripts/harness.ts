// Eval harness — the automated release gate for generated lessons. Content here
// is never hand-reviewed in production, so this battery is the standing proof the
// machinery works. It exits non-zero on any regression, so CI can block release.
//
// Two things to prove, post-pivot:
//   1. the verifier catches what it still exists to catch (parse + CAS answer
//      correctness) and stays SILENT on freeform code — the allow-list is gone,
//      and the freeform fixture is the regression test that it stays gone;
//   2. the SDK contract doesn't lie: everything the runtime injects is documented
//      and everything documented @status live actually exists (see the doc gate).
// With --live, that freshly generated lessons clear the hard gates before mount.
//
// Run via `npm run eval` (esbuild bundles this TS + deps, see scripts/eval.mjs).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verify, type VerifyGate } from "../app/api/generate/verify";
import { MOCK_PLAN, type LessonPlan } from "../app/api/generate/prompts/plan";
import { MOCK_LESSON, BUILD_SYSTEM, buildPrompt } from "../app/api/generate/prompts/build";
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

// The regression test for "the cage is gone". Custom helper functions, a local
// RNG closure, real `Math.random()` in visual code, the `<Custom>` SVG hatch and
// a director beat — none of it allow-list-shaped. Every one of these tripped a
// hard finding under the old gate; the freeform pivot says the correct verdict is
// now silence. If this fixture ever reports anything, a cage grew back.
const FREEFORM_LESSON = `export const meta = { concept: "random-walk", difficulty: 2 }

// Helpers the std-lib never provided — writing them is the point.
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
function walk(n, rand) {
  const pts = [[0, 0]]
  for (let i = 1; i <= n; i++) pts.push([i, pts[i - 1][1] + (rand() < 0.5 ? -1 : 1)])
  return pts
}

export default function Lesson() {
  const s = useStage({ steps: 24, seed: Math.floor(Math.random() * 1e6) })
  const trail = useMark()
  const dir = useDirector()
  const pts = useMemo(() => walk(s.steps, lcg(s.seed)), [s.steps, s.seed])
  const end = pts[pts.length - 1]

  useSimulation(s, (st) => (st.steps > 60 ? null : { ...st, steps: st.steps + 1 }), { rate: 3 })

  const replay = () =>
    dir.play(sequence([drawTo(trail, { duration: 0.6 }), call(() => s.set({ seed: Math.random() }))]))

  return (
    <Section title="Random walk">
      <Prose>{\`After \${fmt(s.steps)} steps the walker sits at \${fmt(end[1])}.\`}</Prose>
      <Plot x={[0, 64]} y={[-16, 16]}>
        <Plot.Segment mark={trail} from={[0, 0]} to={end} />
        <Custom
          draw={({ xToPx, yToPx }) => (
            <polyline
              points={pts.map(([x, y]) => \`\${xToPx(x)},\${yToPx(y)}\`).join(" ")}
              fill="none"
              stroke="#2f6df0"
              strokeWidth={2}
            />
          )}
        />
      </Plot>
      <Slider value={s.steps} onChange={(steps) => s.set({ steps })} min={4} max={64} label="steps" />
      <Toggle checked={dir.playing} onChange={replay} label="replay" />
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
    // A plan that writes `simplify` where it means "work this constant out" is
    // ORDINARY, and its canonical is right — 16 really is (8/2)². The verifier
    // used to reject the shape rather than the value, which sent the repair loop
    // twice round an error no lesson edit could fix. It must re-derive instead.
    name: "constant-valued derivation against a numeric canonical — re-derived, not rejected",
    plan: {
      ...MOCK_PLAN,
      assessments: [
        {
          ask: "What constant completes the square for x² + 8x?",
          answer: { type: "numeric", value: 16, tolerance: 0.001 },
          derivation: { given: "(8/2)^2", op: "simplify" },
        },
      ],
    },
    code: skeleton(
      "",
      `<Exercise prompt={<Prose>{\`constant?\`}</Prose>} answer={{ type: "numeric", value: 16, tolerance: 0.001 }} input="number" />`,
    ),
    expect: { ok: true, gates: [] },
  },
  {
    // …and it still CATCHES a wrong canonical through the same path.
    name: "constant-valued derivation disagrees with the canonical",
    plan: {
      ...MOCK_PLAN,
      assessments: [
        {
          ask: "What constant completes the square for x² + 8x?",
          answer: { type: "numeric", value: 64, tolerance: 0.001 },
          derivation: { given: "(8/2)^2", op: "simplify" },
        },
      ],
    },
    code: skeleton(
      "",
      `<Exercise prompt={<Prose>{\`constant?\`}</Prose>} answer={{ type: "numeric", value: 64, tolerance: 0.001 }} input="number" />`,
    ),
    expect: { ok: false, gates: ["answer"] },
  },
  {
    // Genuinely incomparable shapes are the PLAN's defect, not the lesson's:
    // reported so the run is honest about what went unchecked, but never a block.
    name: "unusable derivation (expression result, point canonical) — soft, not blocking",
    plan: {
      ...MOCK_PLAN,
      assessments: [
        {
          ask: "where is the vertex?",
          answer: { type: "point", x: 3, y: 5 },
          derivation: { given: "2*x + 1", op: "simplify" },
        },
      ],
    },
    code: skeleton(
      "",
      `<Exercise prompt={<Prose>{\`vertex?\`}</Prose>} answer={{ type: "point", x: 3, y: 5 }} input="point" />`,
    ),
    expect: { ok: true, gates: ["answer"] },
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
    // The failure this gate was built for, seen twice in live runs: LaTeX
    // written as JSX CHILDREN. JSX reads `{d}` and `{dx}` as expression
    // containers, so the lesson references two variables that were never
    // meant to be variables and dies with "ReferenceError: d is not defined".
    name: "LaTeX as JSX children — invents names that resolve to nothing",
    plan: noAssess,
    code: skeleton("", `<Hint>Use \\frac{d}{dx} a^x to differentiate</Hint>`),
    expect: { ok: false, gates: ["undefined-name"] },
  },
  {
    // Same gate, the plain-typo shape — and inside a HANDLER, which mounting
    // could never catch: the lesson renders fine and explodes on click.
    name: "undefined name reachable only from a handler",
    plan: noAssess,
    code: skeleton(
      `const s = useStage({ a: 1 })\n  const bump = () => s.set({ a: undeclaredHelper(s.a) })`,
      `<Slider value={s.a} onChange={bump} min={0} max={5} />`,
    ),
    expect: { ok: false, gates: ["undefined-name"] },
  },
  {
    // The gate must cost the author NO freedom: ordinary JS built-ins, custom
    // helpers and locally-bound names all resolve, so none of them fire it.
    name: "built-ins and custom helpers resolve — the gate isn't an allow-list",
    plan: noAssess,
    code: skeleton(
      `const rows = Array.from({ length: 4 }, (_, i) => i)\n` +
        `  const total = rows.reduce((a, b) => a + b, 0)\n` +
        `  const label = new Intl.NumberFormat().format(total) + JSON.stringify([Math.PI, Number.EPSILON, Date.now()])`,
      `<Prose>{\`\${label} \${fmt(total)}\`}</Prose>`,
    ),
    expect: { ok: true, gates: [] },
  },
  {
    // The only hard structural gate left. The compile step should catch this
    // first; verify() must not throw on it either way.
    name: "syntax error — unparseable code",
    plan: noAssess,
    code: skeleton(`const half = (`),
    expect: { ok: false, gates: ["parse"] },
  },
  {
    name: "freeform lesson — custom helpers, <Custom>, randomness, a director beat",
    plan: noAssess,
    code: FREEFORM_LESSON,
    expect: { ok: true, gates: [] },
  },
  {
    name: "dead interaction — useLessonState value never read",
    plan: noAssess,
    code: skeleton(`const [a, setA] = useLessonState("a", 1)`, `<Slider value={1} onChange={setA} min={0} max={5} />`),
    expect: { ok: true, gates: ["dead-interaction"] }, // soft: reported, not blocking
  },
  {
    // The Stage-era shape of the same smell: three drivers can write the store
    // all they like, but nothing renders from it, so the figure is inert.
    name: "dead interaction — useStage store never read",
    plan: noAssess,
    code: skeleton(
      `const s = useStage({ t: 0 })\n  const [v, setV] = useState(1)`,
      `<Slider value={v} onChange={setV} min={0} max={5} />`,
    ),
    expect: { ok: true, gates: ["dead-interaction"] }, // soft
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

function runFixtures(): { failed: number; total: number } {
  let failed = 0;
  console.log(`\nVerifier gate battery (${FIXTURES.length} fixtures)\n`);
  for (const fx of FIXTURES) {
    const report = verify(fx.plan, fx.code);
    const firedGates = new Set(report.findings.map((f) => f.gate));
    const wantGates = new Set(fx.expect.gates ?? []);

    // EXACT set equality, soft findings included — so `gates: []` really means
    // "the verifier had nothing to say", which is what the freeform fixture is
    // here to prove. A subset test would let a resurrected gate pass silently.
    const okMatch = report.ok === fx.expect.ok;
    const gatesMatch =
      [...wantGates].every((g) => firedGates.has(g)) && [...firedGates].every((g) => wantGates.has(g));

    const pass = okMatch && gatesMatch;
    if (!pass) failed++;
    const mark = pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const fired = [...firedGates].join(", ");
    console.log(`  ${mark} ${fx.name}${pass && fired ? ` ${DIM}→ ${fired}${RESET}` : ""}`);
    if (!pass) {
      console.log(`      ${DIM}expected ok=${fx.expect.ok} gates=[${[...wantGates]}]${RESET}`);
      console.log(`      ${DIM}got      ok=${report.ok} findings=${JSON.stringify(report.findings.map((f) => `${f.gate}:${f.severity}`))}${RESET}`);
      for (const f of report.findings) console.log(`      ${DIM}· ${f.detail}${RESET}`);
    }
  }
  console.log(`\n${failed ? RED : GREEN}${FIXTURES.length - failed}/${FIXTURES.length} fixtures passed${RESET}\n`);
  return { failed, total: FIXTURES.length };
}

// ── documentation gate: contract ⟺ runtime ⟺ prompt ──────────────────────────
// With the allow-list retired, sdk/sdk.d.ts fences nothing — but it is still the
// only thing that TELLS THE AUTHOR what exists, so truthfulness becomes a
// coverage problem, in both directions:
//
//   • an injected primitive nobody documented is a wasted capability — the model
//     can't reach for what it was never shown;
//   • a documented primitive the runtime lacks is worse — the model reaches for
//     it and the lesson crashes at mount.
//
// And the prompt must never advertise a `@status planned` name. Either kind of
// lie fails the release gate.

/** Names buildScope() injects that aren't SDK-declared (React plumbing). */
const NON_SDK_SCOPE = new Set(["React"]);

function diff(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

function runDocGate(): { failed: number; total: number } {
  console.log(`Documentation gate — contract ⟺ runtime ⟺ prompt\n`);
  let failed = 0;
  let total = 0;
  const check = (label: string, issues: string[]) => {
    total++;
    const pass = issues.length === 0;
    if (!pass) failed++;
    console.log(`  ${pass ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${label}`);
    for (const i of issues) console.log(`      ${DIM}${i}${RESET}`);
  };

  const scope = buildScope();
  const runtimeTop = new Set(Object.keys(scope).filter((k) => !NON_SDK_SCOPE.has(k)));
  const liveTop = liveTopLevelNames();
  check("coverage: every runtime primitive is documented @status live", [
    ...diff(runtimeTop, liveTop).map(
      (n) => `runtime injects "${n}" but the contract does not document it @status live — the author never learns it exists.`,
    ),
  ]);
  check("truth: every @status live primitive exists in the runtime scope", [
    ...diff(liveTop, runtimeTop).map(
      (n) => `contract documents "${n}" @status live but the runtime doesn't inject it — a lesson using it crashes at mount (implement it, or set @status planned).`,
    ),
  ]);

  const runtimePlot = new Set(Object.keys((scope.Plot ?? {}) as object));
  const livePlot = livePlotMembers();
  check("coverage: every runtime Plot mark is documented @status live", [
    ...diff(runtimePlot, livePlot).map((n) => `runtime has Plot.${n} but the contract doesn't document it @status live.`),
  ]);
  check("truth: every @status live Plot mark exists in the runtime", [
    ...diff(livePlot, runtimePlot).map((n) => `contract documents Plot.${n} @status live but the runtime lacks it.`),
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

  // The few-shot is the golden lesson wearing a second hat. If it drifts, the
  // prompt teaches an API the runtime no longer has — and the drift is silent,
  // because both files still compile. (Found the hard way: a `\*` that KaTeX
  // renders as a red error survived in both copies.)
  const goldenBody = readFileSync(join(process.cwd(), "sdk/examples/newton.lesson.tsx"), "utf8")
    .replace(/^\/\*[\s\S]*?\*\/\s*/, "")
    .trimEnd();
  check("few-shot is the golden lesson, verbatim", [
    ...(buildPrompt(MOCK_PLAN).includes(goldenBody)
      ? []
      : ["prompts/build.ts FEWSHOT has drifted from sdk/examples/newton.lesson.tsx — run: node scripts/sync-fewshot.mjs"]),
  ]);

  // The same truthfulness question asked of the ONE lesson the model imitates:
  // every name the golden lesson uses must actually resolve at mount. A
  // few-shot that references something the runtime lacks doesn't merely fail
  // itself — it teaches the model to write the same crash into every lesson.
  const goldenFindings = verify({ ...MOCK_PLAN, assessments: [] }, goldenBody).findings.filter(
    (f) => f.gate === "undefined-name",
  );
  check("the golden lesson resolves every name it uses", goldenFindings.map((f) => f.detail));

  console.log(`\n${failed ? RED : GREEN}${total - failed}/${total} documentation checks passed${RESET}\n`);
  return { failed, total };
}

// ── optional: live batch generation (--live [N]) ─────────────────────────────
// Asserts only `report.verify.ok` — i.e. no HARD finding (parse / answer). It
// deliberately does not care what the lesson composes, so freeform authoring
// can't fail it; soft findings are printed for the record, not scored.

const LIVE_CONCEPTS = [
  "the derivative of x squared is 2x",
  "why the area of a triangle is one half base times height",
  "adding fractions requires a common denominator",
  "the slope between two points",
];

async function runLive(n: number): Promise<{ failed: number; total: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${RED}--live requires ANTHROPIC_API_KEY${RESET}`);
    return { failed: 1, total: 1 };
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
      // Print soft findings too — they don't fail the run, but they are the
      // signal about what freeform authoring is producing.
      for (const f of v?.findings ?? []) console.log(`      ${DIM}${f.gate}:${f.severity} — ${f.detail}${RESET}`);
    } catch (e: any) {
      failed++;
      console.log(`  ${RED}✗${RESET} ${c} ${DIM}— pipeline threw: ${String(e?.message || e)}${RESET}`);
    }
  }
  console.log(`\n${failed ? RED : GREEN}${concepts.length - failed}/${concepts.length} live generations passed${RESET}\n`);
  return { failed, total: concepts.length };
}

export async function run(argv: string[]): Promise<number> {
  const sections: { name: string; failed: number; total: number; unit: string }[] = [];
  const doc = runDocGate();
  sections.push({ name: "documentation gate", unit: "checks", ...doc });
  const fx = runFixtures();
  sections.push({ name: "verifier battery", unit: "fixtures", ...fx });

  const liveIdx = argv.indexOf("--live");
  if (liveIdx !== -1) {
    const n = Number(argv[liveIdx + 1]) || LIVE_CONCEPTS.length;
    sections.push({ name: "live generation", unit: "concepts", ...(await runLive(n)) });
  }

  // One verdict, with the failing section named — CI reads the exit code, a
  // human reads this line and knows where to look.
  const failed = sections.reduce((n, s) => n + s.failed, 0);
  console.log("── summary ─────────────────────────────────────────────────");
  for (const s of sections) {
    const ok = s.failed === 0;
    console.log(`  ${ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`} ${s.name.padEnd(20)} ${s.total - s.failed}/${s.total} ${s.unit}`);
  }
  if (liveIdx === -1) console.log(`  ${DIM}·${RESET} live generation${" ".repeat(6)} ${DIM}skipped (pass --live)${RESET}`);
  console.log(
    failed
      ? `\n${RED}EVAL FAILED${RESET} — ${failed} failing ${failed === 1 ? "check" : "checks"}; exiting 1 (release blocked).\n`
      : `\n${GREEN}EVAL PASSED${RESET} — every gate green; exiting 0.\n`,
  );
  return failed === 0 ? 0 : 1;
}
