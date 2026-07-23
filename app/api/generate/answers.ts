// Shared answer model for the M1 verifier. The grading in the sandbox
// (sandbox/sdk.tsx) is what a learner is scored against; this module is a
// SECOND, independent implementation used server-side to re-check that the
// answer the lesson grades against actually agrees with the plan's canonical
// answer. Two implementations checking each other is the point — correctness is
// earned by machinery, not by trusting one model's output.

import { create, all } from "mathjs";

const math = create(all, {});

/** Declarative answer variants — the ones the verifier can re-check. Mirrors the
 *  `AnswerSpec` union in sdk/sdk.d.ts, minus the `custom` escape hatch. */
export type CanonicalAnswer =
  | { type: "numeric"; value: number; tolerance?: number; unit?: string }
  | { type: "expression"; value: string; vars?: string[] }
  | { type: "set"; values: (number | string)[]; ordered?: boolean }
  | { type: "interval"; from: number; to: number; openLeft?: boolean; openRight?: boolean }
  | { type: "point"; x: number; y: number; tolerance?: number }
  | { type: "text"; value: string | string[]; caseSensitive?: boolean };

/** What can actually appear on an `<Exercise answer={...}>` in built code. */
export type AnswerSpec = CanonicalAnswer | { type: "custom" };

/** An independent way to arrive at a canonical answer — lets the verifier
 *  RE-DERIVE the answer with the CAS instead of trusting the plan's stated value.
 *  Optional: not every answer is mechanically derivable. */
export interface Derivation {
  /** The premise expression the answer is computed from, e.g. "x^2 + 3x". */
  given: string;
  /** The operation that turns `given` into the answer. */
  op: "derivative" | "simplify" | "evaluate" | "identity";
  /** Variable for derivative/evaluate. Defaults to "x". */
  var?: string;
  /** Point to evaluate at, for op "evaluate". */
  at?: number;
}

// ── numeric / expression primitives ──────────────────────────────────────────

const numEqual = (a: number, b: number, tol = 1e-6) =>
  Math.abs(a - b) <= tol * (1 + Math.abs(b)) || Math.abs(a - b) <= tol;

/** Symbolic-then-numeric equivalence for two expressions in `vars`. */
export function exprEquivalent(a: string, b: string, vars: string[] = ["x"]): boolean {
  try {
    if (math.simplify(`(${a}) - (${b})`).toString() === "0") return true;
  } catch {
    /* fall through to sampling */
  }
  try {
    const ca = math.compile(a);
    const cb = math.compile(b);
    const samples = [-2.3, -1.1, 0.7, 1.9, 3.3, -0.5];
    let checked = 0;
    for (const base of samples) {
      const scope: Record<string, number> = {};
      vars.forEach((v, i) => (scope[v] = base + i * 0.41));
      const va = Number(ca.evaluate(scope));
      const vb = Number(cb.evaluate(scope));
      if (!isFinite(va) || !isFinite(vb)) continue;
      if (Math.abs(va - vb) > 1e-6 * (1 + Math.abs(va))) return false;
      checked++;
    }
    return checked > 0;
  } catch {
    return false;
  }
}

// ── answer agreement ─────────────────────────────────────────────────────────

export interface Agreement {
  agree: boolean;
  reason?: string;
}

/** Do two canonical answers denote the same thing? `a` is the code's spec, `b`
 *  the plan's canonical. Type mismatch is a disagreement. */
export function answersAgree(a: CanonicalAnswer, b: CanonicalAnswer): Agreement {
  if (a.type !== b.type)
    return { agree: false, reason: `answer type "${a.type}" ≠ canonical type "${b.type}"` };

  switch (b.type) {
    case "numeric": {
      const av = (a as typeof b).value;
      const tol = Math.max(b.tolerance ?? 1e-6, (a as typeof b).tolerance ?? 0);
      return numEqual(av, b.value, tol)
        ? { agree: true }
        : { agree: false, reason: `graded value ${av} ≠ canonical ${b.value}` };
    }
    case "expression": {
      const av = String((a as typeof b).value);
      const vars = b.vars ?? (a as typeof b).vars ?? ["x"];
      return exprEquivalent(av, String(b.value), vars)
        ? { agree: true }
        : { agree: false, reason: `graded "${av}" not equivalent to canonical "${b.value}"` };
    }
    case "point": {
      const ap = a as typeof b;
      const tol = Math.max(b.tolerance ?? 1e-6, ap.tolerance ?? 0);
      return numEqual(ap.x, b.x, tol) && numEqual(ap.y, b.y, tol)
        ? { agree: true }
        : { agree: false, reason: `graded (${ap.x}, ${ap.y}) ≠ canonical (${b.x}, ${b.y})` };
    }
    case "interval": {
      const ai = a as typeof b;
      const same =
        numEqual(ai.from, b.from) &&
        numEqual(ai.to, b.to) &&
        !!ai.openLeft === !!b.openLeft &&
        !!ai.openRight === !!b.openRight;
      return same
        ? { agree: true }
        : { agree: false, reason: `graded interval ≠ canonical [${b.from}, ${b.to}]` };
    }
    case "set": {
      const norm = (vals: (number | string)[]) => {
        const nums = vals.map((v) => Number(v));
        const arr = nums.every((n) => isFinite(n)) ? nums : vals.map(String);
        return b.ordered ? arr : [...arr].sort();
      };
      const A = norm((a as typeof b).values);
      const B = norm(b.values);
      const same = A.length === B.length && A.every((v, i) => v === B[i] || numEqual(Number(v), Number(B[i])));
      return same ? { agree: true } : { agree: false, reason: `graded set ≠ canonical {${b.values.join(", ")}}` };
    }
    case "text": {
      const setOf = (v: string | string[]) => new Set((Array.isArray(v) ? v : [v]).map((s) => s.trim().toLowerCase()));
      const A = setOf((a as typeof b).value);
      const B = setOf(b.value);
      const overlap = [...A].some((v) => B.has(v));
      return overlap ? { agree: true } : { agree: false, reason: `graded text ≠ canonical "${b.value}"` };
    }
  }
}

// ── independent re-derivation ────────────────────────────────────────────────

export interface Rederivation {
  ok: boolean;
  /** The answer the CAS independently computed, when representable. */
  computed?: CanonicalAnswer;
  reason?: string;
}

/** Recompute the canonical answer from its derivation and confirm it matches the
 *  plan's stated canonical. Catches a plan that committed to a WRONG answer —
 *  the deepest form of the check, since neither model authored this result. */
export function recheckDerivation(d: Derivation, canonical: CanonicalAnswer): Rederivation {
  const v = d.var ?? "x";
  try {
    switch (d.op) {
      case "derivative": {
        const computed = math.derivative(d.given, v).toString();
        const target = canonical.type === "expression" ? String(canonical.value) : null;
        if (target == null) return { ok: false, reason: `derivative expects an expression canonical, got ${canonical.type}` };
        return exprEquivalent(computed, target, [v])
          ? { ok: true, computed: { type: "expression", value: computed, vars: [v] } }
          : { ok: false, computed: { type: "expression", value: computed, vars: [v] }, reason: `CAS derivative "${computed}" ≠ canonical "${target}"` };
      }
      case "simplify": {
        const computed = math.simplify(d.given).toString();
        if (canonical.type !== "expression") return { ok: false, reason: `simplify expects an expression canonical, got ${canonical.type}` };
        return exprEquivalent(computed, String(canonical.value), canonical.vars ?? [v])
          ? { ok: true, computed: { type: "expression", value: computed } }
          : { ok: false, computed: { type: "expression", value: computed }, reason: `CAS simplify "${computed}" ≠ canonical "${canonical.value}"` };
      }
      case "evaluate": {
        const scope = d.at != null ? { [v]: d.at } : {};
        const computed = Number(math.evaluate(d.given, scope));
        if (canonical.type !== "numeric") return { ok: false, reason: `evaluate expects a numeric canonical, got ${canonical.type}` };
        return numEqual(computed, canonical.value, canonical.tolerance ?? 1e-6)
          ? { ok: true, computed: { type: "numeric", value: computed } }
          : { ok: false, computed: { type: "numeric", value: computed }, reason: `CAS evaluate = ${computed} ≠ canonical ${canonical.value}` };
      }
      case "identity":
        return { ok: true };
    }
  } catch (e: any) {
    return { ok: false, reason: `re-derivation failed: ${String(e?.message || e)}` };
  }
}

/** Human summary of an answer, for prompts. */
export function describeAnswer(a: CanonicalAnswer): string {
  switch (a.type) {
    case "numeric":
      return `${a.value}${a.unit ? " " + a.unit : ""}${a.tolerance ? ` (±${a.tolerance})` : ""}`;
    case "expression":
      return `${a.value}${a.vars ? ` in ${a.vars.join(",")}` : ""}`;
    case "point":
      return `(${a.x}, ${a.y})`;
    case "interval":
      return `${a.openLeft ? "(" : "["}${a.from}, ${a.to}${a.openRight ? ")" : "]"}`;
    case "set":
      return `{${a.values.join(", ")}}`;
    case "text":
      return Array.isArray(a.value) ? a.value.join(" | ") : a.value;
  }
}
