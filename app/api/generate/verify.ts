// The M1 verifier — the machinery that earns correctness. It runs AFTER the
// compile gate and BEFORE a learner ever sees a lesson, and enforces four
// independent gates on the built code:
//
//   1. allow-list   — only @tier SDK identifiers + JS built-ins + React.
//   2. answer-check  — every declarative <Exercise answer> is CAS-re-checked
//                      against the plan's canonical answer (and, where a
//                      derivation is given, independently recomputed).
//   3. custom-grader — `custom` graders can't be re-checked → flagged higher-risk.
//   4. dead-interaction — interactive state that is set up but never read.
//
// sdk/sdk.d.ts stays the single source of truth: the allow-list is parsed from
// it at load time, so adding an SDK primitive automatically permits it here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Babel from "@babel/standalone";
import {
  answersAgree,
  recheckDerivation,
  describeAnswer,
  type CanonicalAnswer,
  type AnswerSpec,
} from "./answers";
import type { LessonPlan, Assessment } from "./prompts/plan";

const parser = (Babel as any).packages.parser;
const traverse = (Babel as any).packages.traverse.default || (Babel as any).packages.traverse;
const t = (Babel as any).packages.types;

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

// ── allow-list, parsed from the SDK contract ─────────────────────────────────

/** JS globals a lesson may reference. Deliberately small and pure — no I/O, no
 *  clock, no randomness (lessons must be deterministic to be re-checkable). */
const JS_BUILTINS = new Set([
  "Math", "Number", "String", "Boolean", "Array", "Object", "JSON", "Symbol",
  "Map", "Set", "isFinite", "isNaN", "parseFloat", "parseInt", "Infinity",
  "NaN", "undefined", "RegExp", "Error", "console",
]);

/** React is injected into the sandbox as a global, along with its hooks. */
const REACT_GLOBALS = new Set(["React", "Fragment"]);

let sdkNamesCache: Set<string> | null = null;

/** Exported @tier identifiers, parsed from sdk/sdk.d.ts (the single source of
 *  truth). Falls back to a baked-in core set if the file can't be read. */
function sdkNames(): Set<string> {
  if (sdkNamesCache) return sdkNamesCache;
  const baked = [
    "useLessonState", "useTime", "track", "fmt", "math", "Section", "Prose",
    "Math", "Callout", "Steps", "Step", "Reveal", "Hint", "Plot", "NumberLine",
    "Geometry", "Chart", "Distribution", "Slider", "RangeSlider", "Toggle",
    "NumberInput", "Dropdown", "Exercise", "MultipleChoice", "Option", "Tween",
    "useState", "useEffect", "useMemo", "useRef", "useCallback",
  ];
  const names = new Set(baked);
  try {
    const src = readFileSync(join(process.cwd(), "sdk", "sdk.d.ts"), "utf8");
    const re = /export declare (?:function|const)\s+(\w+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) names.add(m[1]);
  } catch {
    /* keep baked set */
  }
  sdkNamesCache = names;
  return names;
}

function isAllowed(name: string): boolean {
  return sdkNames().has(name) || JS_BUILTINS.has(name) || REACT_GLOBALS.has(name);
}

// ── parsing ──────────────────────────────────────────────────────────────────

function parse(code: string) {
  return parser.parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });
}

/** Free identifiers referenced but not declared anywhere and not allow-listed. */
function checkAllowlist(ast: any): VerifyFinding[] {
  const bad = new Set<string>();
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
  });
  return [...bad].map((name) => ({
    gate: "allowlist" as const,
    severity: "hard" as const,
    detail: `"${name}" is not an SDK @tier identifier, a JS built-in, or React — lessons may only use the SDK.`,
  }));
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
