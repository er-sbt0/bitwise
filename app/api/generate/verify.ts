// The M1 verifier — the machinery that earns correctness. It runs AFTER the
// compile gate and BEFORE a learner ever sees a lesson, and enforces four
// independent gates on the built code:
//
//   1. allow-list   — only LIVE SDK identifiers (+ live Plot marks) + JS
//                      built-ins + React. Declared-but-unimplemented (@status
//                      planned) primitives are rejected, not silently allowed.
//   2. answer-check  — every declarative <Exercise answer> is CAS-re-checked
//                      against the plan's canonical answer (and, where a
//                      derivation is given, independently recomputed).
//   3. custom-grader — `custom` graders can't be re-checked → flagged higher-risk.
//   4. dead-interaction — interactive state that is set up but never read.
//
// sdk/sdk.d.ts stays the single source of truth: sdk/surface.ts parses its
// @status tags, and this allow-list is the LIVE set — so flipping a primitive to
// @status live (once the runtime implements it) automatically permits it here.

import Babel from "@babel/standalone";
import {
  answersAgree,
  recheckDerivation,
  describeAnswer,
  type CanonicalAnswer,
  type AnswerSpec,
} from "./answers";
import type { LessonPlan, Assessment } from "./prompts/plan";
import {
  liveTopLevelNames,
  livePlotMembers,
  plannedTopLevelNames,
  plannedPlotMembers,
} from "../../../sdk/surface";

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

export type VerifyGate = "allowlist" | "answer" | "custom-grader" | "dead-interaction";

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

// ── allow-list, derived from the SDK contract (via sdk/surface.ts) ───────────

/** JS globals a lesson may reference. Deliberately small and pure — no I/O, no
 *  clock, no randomness (lessons must be deterministic to be re-checkable). */
const JS_BUILTINS = new Set([
  "Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "Symbol",
  "Map", "Set", "isFinite", "isNaN", "parseFloat", "parseInt", "Infinity",
  "NaN", "undefined", "RegExp", "Error", "console",
]);

/** React is injected into the sandbox as a global, along with its hooks. */
const REACT_GLOBALS = new Set(["React", "Fragment"]);

/** A lesson may reference an SDK name only if the runtime renders it TODAY
 *  (@status live). A `planned` primitive is declared in the contract but not yet
 *  implemented — permitting it would let a lesson pass verify and then crash at
 *  mount, which is exactly the drift this gate exists to stop. */
function isAllowed(name: string): boolean {
  return liveTopLevelNames().has(name) || JS_BUILTINS.has(name) || REACT_GLOBALS.has(name);
}

// ── parsing ──────────────────────────────────────────────────────────────────

function parse(code: string) {
  const { parser } = babel();
  return parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

/** Free identifiers referenced but not declared anywhere and not allow-listed,
 *  plus `Plot.*` marks the runtime doesn't render. Both are truthfulness gates:
 *  a name is permitted only if it maps to something the sandbox can actually
 *  mount today. */
function checkAllowlist(ast: any): VerifyFinding[] {
  const { traverse, t } = babel();
  const bad = new Set<string>();
  const badPlot = new Set<string>();
  const planned = plannedTopLevelNames();
  const liveMembers = livePlotMembers();
  const plannedMembers = plannedPlotMembers();

  traverse(ast, {
    ReferencedIdentifier(path: any) {
      const { node, parent } = path;
      const name = node.name;
      // JSX intrinsic tags (lowercase) are always fine.
      if (t.isJSXIdentifier(node) && /^[a-z]/.test(name)) return;
      // Only care about true free references (no binding in scope).
      if (path.scope.getBinding(name)) return;
      if (isAllowed(name)) return;
      // Skip member/property positions that aren't the object.
      if (t.isMemberExpression(parent) && parent.property === node && !parent.computed) return;
      bad.add(name);
    },
    // `Plot.OfX(...)` — the property side is skipped above, so check it here.
    MemberExpression(path: any) {
      const { node } = path;
      if (node.computed) return;
      if (!t.isIdentifier(node.object) || node.object.name !== "Plot") return;
      if (path.scope.getBinding("Plot")) return; // shadowed local, not the SDK global
      if (!t.isIdentifier(node.property)) return;
      if (!liveMembers.has(node.property.name)) badPlot.add(node.property.name);
    },
    // `<Plot.OfX/>` — marks are used as JSX, a distinct node type from the above.
    JSXMemberExpression(path: any) {
      const { node } = path;
      if (!t.isJSXIdentifier(node.object) || node.object.name !== "Plot") return;
      if (path.scope.getBinding("Plot")) return;
      if (!t.isJSXIdentifier(node.property)) return;
      if (!liveMembers.has(node.property.name)) badPlot.add(node.property.name);
    },
  });

  const findings: VerifyFinding[] = [...bad].map((name) => ({
    gate: "allowlist" as const,
    severity: "hard" as const,
    detail: planned.has(name)
      ? `"${name}" is declared in the SDK but not implemented yet (@status planned) — it would crash at mount. Use a live primitive instead.`
      : `"${name}" is not an SDK identifier, a JS built-in, or React — lessons may only use the SDK.`,
  }));
  for (const member of badPlot) {
    findings.push({
      gate: "allowlist",
      severity: "hard",
      detail: plannedMembers.has(member)
        ? `"Plot.${member}" is declared but not implemented yet (@status planned) — it would crash at mount. Use a live Plot mark instead.`
        : `"Plot.${member}" is not a Plot mark — check the SDK for available marks.`,
    });
  }
  return findings;
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

/** Interactive state (useLessonState) that is set up but never read. */
function checkDeadInteractions(ast: any): VerifyFinding[] {
  const { traverse, t } = babel();
  const findings: VerifyFinding[] = [];
  traverse(ast, {
    VariableDeclarator(path: any) {
      const init = path.node.init;
      if (!t.isCallExpression(init) || init.callee?.name !== "useLessonState") return;
      if (!t.isArrayPattern(path.node.id)) return;
      const valueId = path.node.id.elements[0];
      if (!valueId || !t.isIdentifier(valueId)) return;
      const binding = path.scope.getBinding(valueId.name);
      if (binding && binding.references === 0) {
        findings.push({
          gate: "dead-interaction",
          severity: "soft",
          detail: `state "${valueId.name}" is created with useLessonState but never read — the interaction changes nothing the learner can see.`,
        });
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
      findings: [{ gate: "allowlist", severity: "hard", detail: `could not parse lesson: ${String(e?.message || e)}` }],
    };
  }

  const answers = extractAnswers(code, ast);
  const findings = [
    ...checkAllowlist(ast),
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

Use ONLY SDK primitives and JS built-ins — no imports, no external identifiers.

CURRENT CODE:
${code}`;
}
