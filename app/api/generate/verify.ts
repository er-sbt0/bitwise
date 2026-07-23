// The verifier — the machinery that earns ANSWER correctness. It runs AFTER the
// compile gate and BEFORE a learner ever sees a lesson.
//
// Under the freeform-creative-runtime pivot the ALLOW-LIST is RETIRED: a lesson
// may write arbitrary JS/JSX composing the injected std-lib, so a gate that
// rejected unfamiliar constructs would reject the whole point. What used to be
// the allow-list's real job — "no imports, no network, no DOM escape" — is
// enforced by ISOLATION, not by this file: the cross-origin iframe, the CSP
// (`connect-src 'none'`), and the `require` stub in sandbox/runtime.tsx.
//
// What still gates here:
//
//   1. parse           — the code must be parseable at all (hard).
//   2. undefined-name  — a reference that cannot resolve to ANYTHING at mount
//                        (hard). Note what this is NOT: it does not ask whether
//                        a name is approved, only whether it exists. Every name
//                        it rejects is a guaranteed ReferenceError, so it costs
//                        the author no freedom at all.
//   3. answer-check    — every declarative <Exercise answer> is CAS-re-checked
//                        against the plan's canonical answer (and, where a
//                        derivation is given, independently recomputed). This is
//                        the whole correctness story now (hard).
//   4. custom-grader   — `custom` graders can't be re-checked → flagged (soft).
//   5. dead-interaction — a store set up but never read: the interaction changes
//                        nothing the learner can see (soft).
//
// The determinism boundary this rests on: visual/animation code may use the
// clock and randomness, but an answer spec must stay a static object literal —
// `evalObjectLiteral` below reads it without executing the lesson.

// NAMESPACE import, not a default one. @babel/standalone is CJS, and under
// Next's server runtime `import Babel from …` resolves to undefined — so
// `Babel.packages` threw, verify() reported a bogus `parse` finding, and the
// CAS answer gate silently never ran on a live generation (checked=0). The eval
// harness didn't catch it because esbuild's interop hands back the real module.
import * as Babel from "@babel/standalone";
import {
  answersAgree,
  recheckDerivation,
  describeAnswer,
  type CanonicalAnswer,
  type AnswerSpec,
} from "./answers";
import type { LessonPlan, Assessment } from "./prompts/plan";
import { liveTopLevelNames } from "../../../sdk/surface";

// Resolved lazily on first use, not at module load. Next.js's build-time
// "Collecting page data" step imports this route to read its config exports;
// touching `Babel.packages` at top level crashes there because the property is
// undefined in that evaluation context. Deferring to request time avoids it.
let _babel: { parser: any; traverse: any; t: any } | null = null;

/** Thrown when the verifier itself is broken, as opposed to the lesson being
 *  bad. These must never be reported as findings: blaming the lesson for our
 *  own fault sends the repair loop chasing a defect that isn't there, and — far
 *  worse — lets the run finish with the CAS gate having checked nothing. */
export class VerifierUnavailable extends Error {}

function babel() {
  if (!_babel) {
    const pkgs = (Babel as any)?.packages;
    if (!pkgs?.parser || !pkgs?.types || !pkgs?.traverse) {
      throw new VerifierUnavailable(
        "@babel/standalone did not expose .packages — the verifier cannot parse, so no answer can be re-checked.",
      );
    }
    _babel = {
      parser: pkgs.parser,
      traverse: pkgs.traverse.default || pkgs.traverse,
      t: pkgs.types,
    };
  }
  return _babel;
}

// ── findings ──────────────────────────────────────────────────────────────────

export type VerifyGate = "parse" | "undefined-name" | "answer" | "custom-grader" | "dead-interaction";

export interface VerifyFinding {
  gate: VerifyGate;
  /** hard findings must be repaired; soft findings are reported but don't block. */
  severity: "hard" | "soft";
  detail: string;
}

export interface VerifyReport {
  ok: boolean; // true when there are no HARD findings
  findings: VerifyFinding[];
  /** answers extracted from the built code, for tracing. */
  checked: number;
}

// ── parsing ──────────────────────────────────────────────────────────────────

function parse(code: string) {
  const { parser } = babel();
  return parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

/** An answer spec pulled off an <Exercise>. `spec` is null for custom/unparseable. */
interface ExtractedAnswer {
  spec: AnswerSpec | null;
  raw: string;
}

function evalObjectLiteral(src: string): AnswerSpec | null {
  // Refuse anything with a function — that's a `custom` grader, not re-checkable.
  if (/=>|function\b/.test(src)) return null;
  try {
    // Only `Math` is in scope; a literal referencing anything else is unparseable
    // for our purposes and treated as unverifiable.
    // eslint-disable-next-line no-new-func
    const value = new Function("Math", `"use strict"; return (${src});`)(Math);
    return value && typeof value === "object" ? (value as AnswerSpec) : null;
  } catch {
    return null;
  }
}

/** Pull every `<Exercise answer={...}>` spec out of the built code. */
function extractAnswers(code: string, ast: any): ExtractedAnswer[] {
  const { traverse, t } = babel();
  const out: ExtractedAnswer[] = [];
  traverse(ast, {
    JSXOpeningElement(path: any) {
      if (path.node.name?.name !== "Exercise") return;
      const attr = path.node.attributes.find(
        (a: any) => t.isJSXAttribute(a) && a.name?.name === "answer",
      );
      const expr = attr?.value?.expression;
      if (!expr) return;
      const raw = code.slice(expr.start, expr.end);
      out.push({ raw, spec: evalObjectLiteral(raw) });
    },
  });
  return out;
}

// ── names that cannot resolve at mount ───────────────────────────────────────
//
// The one failure this catches, in the author's words: LaTeX written as JSX
// CHILDREN. `<Hint>Use \frac{d}{dx} a^x</Hint>` looks like prose, but JSX reads
// `{d}` and `{dx}` as expression containers, so the lesson references two
// variables named `d` and `dx` and dies with "ReferenceError: d is not defined"
// — a stack trace pointing at a line of maths. Observed twice in live runs
// before this gate existed.
//
// Two properties make it worth blocking on rather than leaving to the sandbox:
//
//   · it is DECIDABLE. A name bound nowhere in the module and absent from the
//     injected scope resolves to nothing, no matter what the lesson does. This
//     is not a taste judgement, so it cannot wrongly reject good work the way
//     the old allow-list could.
//   · it catches what MOUNTING CANNOT. A bad name inside an onClick handler
//     mounts perfectly and then explodes under the learner's cursor. No amount
//     of rendering finds that; reading the code does.
//
// The known set is derived, never hand-written: the SDK contract's `live` names
// (which `npm run eval`'s doc gate proves equal to the runtime's injected scope,
// in BOTH directions) plus the JS built-ins, read off this process's own global
// object rather than listed here.

/** Bindings the CommonJS wrapper and the sandbox's `new Function` supply. */
const HOST_BINDINGS = ["React", "module", "exports", "require", "arguments", "globalThis"];

let _known: Set<string> | null = null;

/** Every name a lesson may reference and still resolve. Returns null when the
 *  SDK contract can't be read — the gate then declines to run rather than
 *  inventing a surface, and says so as a soft finding. */
function knownNames(): Set<string> | null {
  if (_known) return _known;
  let live: Set<string>;
  try {
    live = liveTopLevelNames();
  } catch {
    return null;
  }
  _known = new Set([...live, ...HOST_BINDINGS, ...Object.getOwnPropertyNames(globalThis)]);
  return _known;
}

/** References that resolve to nothing. Analysed on the TRANSPILED output, so
 *  type annotations (erased) and JSX (already function calls) can't masquerade
 *  as values — the input to this is exactly what the sandbox evaluates. */
function undefinedNames(code: string): string[] {
  const { traverse } = babel();
  let compiled: string;
  try {
    compiled = String(
      Babel.transform(code, {
        filename: "lesson.tsx",
        presets: [
          ["react", { runtime: "classic" }],
          ["typescript", { isTSX: true, allExtensions: true }],
        ],
        plugins: ["transform-modules-commonjs"],
      }).code ?? "",
    );
  } catch {
    // Unparseable — the compile gate owns that, and reporting it twice would
    // send the repair loop after a defect it is already fixing.
    return [];
  }

  const known = knownNames();
  if (!known) return [];

  const missing = new Set<string>();
  traverse(parse(compiled), {
    ReferencedIdentifier(path: any) {
      const name = path.node.name;
      if (missing.has(name)) return;
      if (path.scope.getBinding(name)) return;
      if (known.has(name)) return;
      missing.add(name);
    },
  });
  return [...missing];
}

function checkUndefinedNames(code: string): VerifyFinding[] {
  if (!knownNames()) {
    return [
      {
        gate: "undefined-name",
        severity: "soft",
        detail:
          "the scope gate could not read sdk/sdk.d.ts, so nothing checked that every name the lesson uses actually exists — a bad reference will now surface as a runtime error at mount instead.",
      },
    ];
  }
  const missing = undefinedNames(code);
  if (!missing.length) return [];
  return [
    {
      gate: "undefined-name",
      severity: "hard",
      detail:
        `the lesson references ${missing.map((n) => `"${n}"`).join(", ")}, which ${missing.length === 1 ? "is" : "are"} not defined anywhere — ` +
        `not declared in the lesson, not part of the standard library, not a JavaScript built-in. This throws a ReferenceError the moment that code runs. ` +
        `The usual cause is LaTeX written as JSX children (\`<Hint>\\frac{d}{dx}</Hint>\`), where JSX reads \`{d}\` as a variable: put the maths in a template string instead.`,
    },
  ];
}

/** State that is set up but never read — the same smell in both idioms:
 *  `useLessonState` (destructured pair, check the value binding) and `useStage`
 *  (a single store handle; if nothing ever reads it, nothing renders from it, so
 *  the figure is inert no matter how much the drivers write to it). Soft: it is
 *  a strong hint, not proof — the value could be read through an alias we don't
 *  follow. */
function checkDeadInteractions(ast: any): VerifyFinding[] {
  const { traverse, t } = babel();
  const findings: VerifyFinding[] = [];
  const dead = (name: string, hook: string, why: string) => {
    findings.push({
      gate: "dead-interaction",
      severity: "soft",
      detail: `state "${name}" is created with ${hook} but never read — ${why}`,
    });
  };
  traverse(ast, {
    VariableDeclarator(path: any) {
      const init = path.node.init;
      if (!t.isCallExpression(init)) return;
      const hook = init.callee?.name;

      if (hook === "useLessonState") {
        if (!t.isArrayPattern(path.node.id)) return;
        const valueId = path.node.id.elements[0];
        if (!valueId || !t.isIdentifier(valueId)) return;
        const binding = path.scope.getBinding(valueId.name);
        if (binding && binding.references === 0) {
          dead(valueId.name, "useLessonState", "the interaction changes nothing the learner can see.");
        }
        return;
      }

      if (hook === "useStage") {
        if (!t.isIdentifier(path.node.id)) return;
        const binding = path.scope.getBinding(path.node.id.name);
        if (binding && binding.references === 0) {
          dead(path.node.id.name, "useStage", "no mark or prose reads the store, so the figure can't respond to any driver.");
        }
      }
    },
  });
  return findings;
}

// ── answer re-check against the plan ─────────────────────────────────────────

function checkAnswers(plan: LessonPlan, answers: ExtractedAnswer[]): VerifyFinding[] {
  const findings: VerifyFinding[] = [];
  const canon: Assessment[] = plan.assessments ?? [];
  const used = new Set<number>();

  for (const { spec, raw } of answers) {
    if (!spec) {
      findings.push({
        gate: "custom-grader",
        severity: "soft",
        detail: `an <Exercise> uses a custom/opaque grader (${raw.slice(0, 60)}…) — not machine-verifiable; extra scrutiny required.`,
      });
      continue;
    }
    if (spec.type === "custom") {
      findings.push({
        gate: "custom-grader",
        severity: "soft",
        detail: "an <Exercise> uses a custom grader — not machine-verifiable against a canonical answer.",
      });
      continue;
    }

    // Match to an unused canonical assessment of the same answer type.
    const idx = canon.findIndex((a, i) => !used.has(i) && a.answer.type === spec.type);
    if (idx === -1) {
      findings.push({
        gate: "answer",
        severity: "hard",
        detail: `the lesson grades a ${spec.type} answer (${describeAnswer(spec as CanonicalAnswer)}) that the plan never committed to — add it to the plan's assessments so it can be verified.`,
      });
      continue;
    }
    used.add(idx);
    const assessment = canon[idx];

    // Gate 2a — the graded answer must agree with the plan's canonical answer.
    const agreement = answersAgree(spec as CanonicalAnswer, assessment.answer);
    if (!agreement.agree) {
      findings.push({
        gate: "answer",
        severity: "hard",
        detail: `grader disagrees with the canonical answer for "${assessment.ask}": ${agreement.reason}.`,
      });
      continue;
    }

    // Gate 2b — where the plan supplies a derivation, RE-DERIVE it with the CAS
    // and confirm the canonical itself is correct (catches a wrong canonical).
    if (assessment.derivation) {
      const red = recheckDerivation(assessment.derivation, assessment.answer);
      if (!red.ok) {
        // `unusable` means the PLAN's derivation doesn't line up with its own
        // canonical — the lesson is grading exactly what it was told to, so
        // there is nothing for a repair pass to fix. Hard-flagging it sent the
        // model round the repair loop twice for nothing and still ended the run
        // in `verify: error`. Report it, don't block on it.
        findings.push({
          gate: "answer",
          severity: red.unusable ? "soft" : "hard",
          detail: red.unusable
            ? `the plan's derivation for "${assessment.ask}" could not be used to re-check its canonical answer: ${red.reason}. The graded answer still matches the plan, but nothing independently confirmed it.`
            : `canonical answer for "${assessment.ask}" fails independent re-derivation: ${red.reason}.`,
        });
      }
    }
  }
  return findings;
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Run every gate over the built code. Never throws *about the lesson* — a parse
 *  failure is itself a hard finding (the compile gate should have caught it
 *  first). A broken VERIFIER does throw: shipping content whose answers were
 *  never checked is the one outcome this module exists to prevent. */
export function verify(plan: LessonPlan, code: string): VerifyReport {
  let ast: any;
  try {
    ast = parse(code);
  } catch (e: any) {
    if (e instanceof VerifierUnavailable) throw e;
    return {
      ok: false,
      checked: 0,
      findings: [{ gate: "parse", severity: "hard", detail: `could not parse lesson: ${String(e?.message || e)}` }],
    };
  }

  const answers = extractAnswers(code, ast);
  const findings = [
    ...checkUndefinedNames(code),
    ...checkAnswers(plan, answers),
    ...checkDeadInteractions(ast),
  ];

  return {
    ok: !findings.some((f) => f.severity === "hard"),
    findings,
    checked: answers.length,
  };
}

/** A repair directive built from hard verifier findings, fed back into build.ts. */
export function verifyRepairPrompt(code: string, report: VerifyReport, plan: LessonPlan): string {
  const hard = report.findings.filter((f) => f.severity === "hard");
  const notes = hard.map((f) => `- [${f.gate}] ${f.detail}`).join("\n");
  const canon = (plan.assessments ?? [])
    .map((a) => `- ${a.ask} → ${describeAnswer(a.answer)}`)
    .join("\n");
  return `The verifier rejected this lesson. Fix ONLY these problems and return the COMPLETE component source (no fences, no commentary):

${notes}

The lesson must grade against these canonical answers exactly:
${canon || "(none declared)"}

No \`import\` statements — nothing is resolvable inside the sandbox; the std-lib and React are already in scope. Otherwise you may write arbitrary JS/JSX composing that std-lib.

CURRENT CODE:
${code}`;
}
