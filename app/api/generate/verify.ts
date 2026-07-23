// The verifier — the machinery that earns ANSWER correctness. It runs AFTER the
// compile gate and BEFORE a learner ever sees a lesson.
//
// Under the freeform-creative-runtime pivot the static allow-list is RETIRED: a
// lesson may write arbitrary JS/JSX composing the injected std-lib, so a gate
// that rejects unknown free identifiers would reject the whole point. What used
// to be the allow-list's real job — "no imports, no network, no DOM escape" — is
// enforced by ISOLATION, not by this file: the cross-origin iframe, the CSP
// (`connect-src 'none'`), and the `require` stub in sandbox/runtime.tsx. A name
// that isn't in scope simply crashes at mount and is caught by the compile /
// runtime-error gate plus the repair loop.
//
// What still gates here:
//
//   1. parse           — the code must be parseable at all (hard).
//   2. answer-check    — every declarative <Exercise answer> is CAS-re-checked
//                        against the plan's canonical answer (and, where a
//                        derivation is given, independently recomputed). This is
//                        the whole correctness story now (hard).
//   3. custom-grader   — `custom` graders can't be re-checked → flagged (soft).
//   4. dead-interaction — a store set up but never read: the interaction changes
//                        nothing the learner can see (soft).
//
// The determinism boundary this rests on: visual/animation code may use the
// clock and randomness, but an answer spec must stay a static object literal —
// `evalObjectLiteral` below reads it without executing the lesson.

import Babel from "@babel/standalone";
import {
  answersAgree,
  recheckDerivation,
  describeAnswer,
  type CanonicalAnswer,
  type AnswerSpec,
} from "./answers";
import type { LessonPlan, Assessment } from "./prompts/plan";

// Resolved lazily on first use, not at module load. Next.js's build-time
// "Collecting page data" step imports this route to read its config exports;
// touching `Babel.packages` at top level crashes there because the property is
// undefined in that evaluation context. Deferring to request time avoids it.
let _babel: { parser: any; traverse: any; t: any } | null = null;
function babel() {
  if (!_babel) {
    const pkgs = (Babel as any).packages;
    _babel = {
      parser: pkgs.parser,
      traverse: pkgs.traverse.default || pkgs.traverse,
      t: pkgs.types,
    };
  }
  return _babel;
}

// ── findings ──────────────────────────────────────────────────────────────────

export type VerifyGate = "parse" | "answer" | "custom-grader" | "dead-interaction";

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
        findings.push({
          gate: "answer",
          severity: "hard",
          detail: `canonical answer for "${assessment.ask}" fails independent re-derivation: ${red.reason}.`,
        });
      }
    }
  }
  return findings;
}

// ── entry point ──────────────────────────────────────────────────────────────

/** Run every gate over the built code. Never throws — a parse failure is itself
 *  a hard finding (the compile gate should have caught it first). */
export function verify(plan: LessonPlan, code: string): VerifyReport {
  let ast: any;
  try {
    ast = parse(code);
  } catch (e: any) {
    return {
      ok: false,
      checked: 0,
      findings: [{ gate: "parse", severity: "hard", detail: `could not parse lesson: ${String(e?.message || e)}` }],
    };
  }

  const answers = extractAnswers(code, ast);
  const findings = [
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
