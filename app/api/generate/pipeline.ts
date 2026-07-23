// The M1 authoring pipeline. Replaces M0's single-shot call with staged
// authoring: plan -> build -> compile-gate -> critic -> refine. The LLM is the
// brain; the critic is the primary quality gate (it *improves* the lesson, it
// does not hard-block). The only hard gate is "does it compile", so a broken
// draft gets repaired before it ever reaches the sandbox. Runtime errors are
// still caught by the sandbox and repaired client-side (see app/page.tsx).

import Anthropic from "@anthropic-ai/sdk";
import * as Babel from "@babel/standalone";
import { PLAN_SYSTEM, planPrompt, MOCK_PLAN, type LessonPlan } from "./prompts/plan";
import { BUILD_SYSTEM, buildPrompt, repairPrompt, MOCK_LESSON } from "./prompts/build";
import {
  CRITIC_SYSTEM,
  criticPrompt,
  refinePrompt,
  MOCK_CRITIC,
  type CriticReport,
} from "./prompts/critic";

const MAX_COMPILE_REPAIRS = 2;
const MAX_REFINES = 1;

export type StageStatus = "ok" | "repair" | "revise" | "skip" | "error";
export interface StageEvent {
  stage: "plan" | "build" | "compile" | "critic" | "refine";
  status: StageStatus;
  detail?: string;
}

export interface PipelineReport {
  source: "model" | "mock";
  model?: string;
  stages: StageEvent[];
  plan: LessonPlan | null;
  critic: CriticReport | null;
  repairs: number;
}

export interface PipelineResult {
  code: string;
  report: PipelineReport;
}

// ── text utilities ───────────────────────────────────────────────────────────

/** Strip a leading/enclosing ```lang fence, if the model added one. */
export function stripFences(text: string): string {
  const fenced = text.match(/```(?:tsx?|jsx?|javascript|json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

/** Tolerant JSON extraction — models sometimes wrap or preface the object. */
function parseJSON<T>(text: string): T {
  const stripped = stripFences(text);
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("model did not return valid JSON");
  }
}

// ── model calls ──────────────────────────────────────────────────────────────

const model = process.env.BITWISE_MODEL || "claude-opus-4-8";

async function callText(client: Anthropic, system: string, user: string): Promise<string> {
  const msg = await client.messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// ── compile gate (syntax only; the sandbox does the full evaluate + runtime) ──

/** Returns a compile error string, or null if the lesson transpiles. Mirrors the
 *  in-frame transpile in sandbox/runtime.tsx so the gate agrees with the mount. */
function compileError(code: string): string | null {
  try {
    Babel.transform(code, {
      filename: "lesson.tsx",
      presets: [
        ["react", { runtime: "classic" }],
        ["typescript", { isTSX: true, allExtensions: true }],
      ],
      plugins: ["transform-modules-commonjs"],
    });
    return null;
  } catch (e: any) {
    return String(e?.message || e);
  }
}

// ── the pipeline ─────────────────────────────────────────────────────────────

/** Full authoring pass for a fresh concept. */
export async function runPipeline(concept: string): Promise<PipelineResult> {
  if (!process.env.ANTHROPIC_API_KEY) return mockResult();

  const client = new Anthropic();
  const stages: StageEvent[] = [];
  let repairs = 0;

  // 1 — PLAN the pedagogy.
  let plan: LessonPlan;
  try {
    plan = parseJSON<LessonPlan>(await callText(client, PLAN_SYSTEM, planPrompt(concept)));
    stages.push({ stage: "plan", status: "ok", detail: plan.essence });
  } catch (e: any) {
    stages.push({ stage: "plan", status: "error", detail: String(e?.message || e) });
    throw e;
  }

  // 2 — BUILD the lesson from the plan.
  let code = stripFences(await callText(client, BUILD_SYSTEM, buildPrompt(plan)));
  stages.push({ stage: "build", status: "ok" });

  // 3 — COMPILE gate, repairing until it transpiles (bounded).
  code = await ensureCompiles(client, code, stages, () => (repairs += 1));

  // 4 — CRITIC: the primary quality gate.
  let critic: CriticReport | null = null;
  try {
    critic = parseJSON<CriticReport>(await callText(client, CRITIC_SYSTEM, criticPrompt(plan, code)));
    stages.push({ stage: "critic", status: "ok", detail: critic.summary });
  } catch (e: any) {
    // A critic failure is non-fatal — the lesson still teaches; just note it.
    stages.push({ stage: "critic", status: "skip", detail: String(e?.message || e) });
  }

  // 5 — REFINE on the critic's verdict (improve, don't block).
  if (critic && needsRevision(critic)) {
    for (let i = 0; i < MAX_REFINES; i++) {
      code = stripFences(await callText(client, BUILD_SYSTEM, refinePrompt(code, critic)));
      stages.push({ stage: "refine", status: "revise" });
      code = await ensureCompiles(client, code, stages, () => (repairs += 1));
    }
  }

  return { code, report: { source: "model", model, stages, plan, critic, repairs } };
}

/** Single build-only repair pass for a RUNTIME error the sandbox caught after
 *  mount (kept for the client-driven self-repair loop in app/page.tsx). */
export async function repairLesson(code: string, error: string): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) return MOCK_LESSON;
  const client = new Anthropic();
  return stripFences(await callText(client, BUILD_SYSTEM, repairPrompt(code, error)));
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function ensureCompiles(
  client: Anthropic,
  code: string,
  stages: StageEvent[],
  onRepair: () => void,
): Promise<string> {
  let err = compileError(code);
  if (!err) {
    stages.push({ stage: "compile", status: "ok" });
    return code;
  }
  for (let i = 0; i < MAX_COMPILE_REPAIRS && err; i++) {
    onRepair();
    stages.push({ stage: "compile", status: "repair", detail: err });
    code = stripFences(await callText(client, BUILD_SYSTEM, repairPrompt(code, `[compile] ${err}`)));
    err = compileError(code);
  }
  stages.push({ stage: "compile", status: err ? "error" : "ok", detail: err ?? undefined });
  return code;
}

function needsRevision(critic: CriticReport): boolean {
  return critic.verdict === "revise" || critic.findings.some((f) => f.severity === "must-fix");
}

function mockResult(): PipelineResult {
  return {
    code: MOCK_LESSON,
    report: {
      source: "mock",
      stages: [
        { stage: "plan", status: "ok", detail: MOCK_PLAN.essence },
        { stage: "build", status: "ok" },
        { stage: "compile", status: "ok" },
        { stage: "critic", status: "ok", detail: MOCK_CRITIC.summary },
      ],
      plan: MOCK_PLAN,
      critic: MOCK_CRITIC,
      repairs: 0,
    },
  };
}
