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
import { verify, verifyRepairPrompt, type VerifyReport } from "./verify";

const MAX_COMPILE_REPAIRS = 2;
const MAX_VERIFY_REPAIRS = 2;
const MAX_REFINES = 1;

export type StageStatus = "start" | "ok" | "repair" | "revise" | "skip" | "error";
export interface StageEvent {
  stage: "plan" | "build" | "compile" | "verify" | "critic" | "refine";
  status: StageStatus;
  detail?: string;
  /** Structured result a client can render while the run is still going — the
   *  plan lands ~40s in and carries the whole lecture outline. */
  payload?: unknown;
}

/** Sink for live progress. A full authoring pass is minutes long, so the stages
 *  are streamed as they happen rather than reported once at the end (route.ts).
 *  `start` events exist only on this channel — the stored report keeps just the
 *  outcomes, so a replayed report reads as a history, not a transcript. */
export type StageSink = (e: StageEvent) => void;

export interface PipelineReport {
  source: "model" | "mock";
  model?: string;
  stages: StageEvent[];
  plan: LessonPlan | null;
  critic: CriticReport | null;
  verify: VerifyReport | null;
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

/** Full authoring pass for a fresh concept. `onStage` receives every stage event
 *  as it happens, including `start` markers, so the wait can be shown as work. */
export async function runPipeline(concept: string, onStage?: StageSink): Promise<PipelineResult> {
  if (!process.env.ANTHROPIC_API_KEY) return mockResult(onStage);

  const client = new Anthropic();
  const stages: StageEvent[] = [];
  // Recorded events are the report; `start` markers are live-only.
  const emit = (e: StageEvent) => {
    if (e.status !== "start") stages.push(e);
    onStage?.(e);
  };
  let repairs = 0;

  // 1 — PLAN the pedagogy.
  let plan: LessonPlan;
  emit({ stage: "plan", status: "start" });
  try {
    plan = parseJSON<LessonPlan>(await callText(client, PLAN_SYSTEM, planPrompt(concept)));
    emit({ stage: "plan", status: "ok", detail: plan.essence, payload: plan });
  } catch (e: any) {
    emit({ stage: "plan", status: "error", detail: String(e?.message || e) });
    throw e;
  }

  // 2 — BUILD the lesson from the plan.
  emit({ stage: "build", status: "start" });
  let code = stripFences(await callText(client, BUILD_SYSTEM, buildPrompt(plan)));
  emit({ stage: "build", status: "ok" });

  // 3 — COMPILE gate, repairing until it transpiles (bounded).
  code = await ensureCompiles(client, code, emit, () => (repairs += 1));

  // 4 — VERIFY: the hard correctness gate. Re-check answers against the plan's
  //     canonical answers and flag dead interactions. (The SDK allow-list was
  //     retired with the freeform pivot — isolation, not static analysis, is
  //     what stops imports and network access now.)
  let vreport: VerifyReport;
  emit({ stage: "verify", status: "start" });
  ({ code, report: vreport } = await ensureVerifies(client, plan, code, emit, () => (repairs += 1)));

  // 5 — CRITIC: the pedagogy gate (improves, does not hard-block).
  let critic: CriticReport | null = null;
  emit({ stage: "critic", status: "start" });
  try {
    critic = parseJSON<CriticReport>(await callText(client, CRITIC_SYSTEM, criticPrompt(plan, code)));
    emit({ stage: "critic", status: "ok", detail: critic.summary, payload: critic });
  } catch (e: any) {
    // A critic failure is non-fatal — the lesson still teaches; just note it.
    emit({ stage: "critic", status: "skip", detail: String(e?.message || e) });
  }

  // 6 — REFINE on the critic's verdict, then RE-VERIFY: a pedagogy edit can
  //     change a graded answer, so correctness must be re-earned after it.
  if (critic && needsRevision(critic)) {
    for (let i = 0; i < MAX_REFINES; i++) {
      emit({ stage: "refine", status: "start" });
      code = stripFences(await callText(client, BUILD_SYSTEM, refinePrompt(code, critic)));
      emit({ stage: "refine", status: "revise" });
      code = await ensureCompiles(client, code, emit, () => (repairs += 1));
      ({ code, report: vreport } = await ensureVerifies(client, plan, code, emit, () => (repairs += 1)));
    }
  }

  return { code, report: { source: "model", model, stages, plan, critic, verify: vreport, repairs } };
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
  emit: StageSink,
  onRepair: () => void,
): Promise<string> {
  let err = compileError(code);
  if (!err) {
    emit({ stage: "compile", status: "ok" });
    return code;
  }
  for (let i = 0; i < MAX_COMPILE_REPAIRS && err; i++) {
    onRepair();
    emit({ stage: "compile", status: "repair", detail: err });
    code = stripFences(await callText(client, BUILD_SYSTEM, repairPrompt(code, `[compile] ${err}`)));
    err = compileError(code);
  }
  emit({ stage: "compile", status: err ? "error" : "ok", detail: err ?? undefined });
  return code;
}

/** Run the verifier, repairing HARD findings until they clear (bounded). Each
 *  repair is re-compiled before it's re-verified. Returns the last report even
 *  if findings remain, so the pipeline can surface them. */
async function ensureVerifies(
  client: Anthropic,
  plan: LessonPlan,
  code: string,
  emit: StageSink,
  onRepair: () => void,
): Promise<{ code: string; report: VerifyReport }> {
  let report = verify(plan, code);
  if (report.ok) {
    emit({ stage: "verify", status: "ok", detail: verifySummary(report), payload: report });
    return { code, report };
  }
  for (let i = 0; i < MAX_VERIFY_REPAIRS && !report.ok; i++) {
    onRepair();
    emit({ stage: "verify", status: "repair", detail: verifySummary(report), payload: report });
    code = stripFences(await callText(client, BUILD_SYSTEM, verifyRepairPrompt(code, report, plan)));
    code = await ensureCompiles(client, code, emit, onRepair);
    report = verify(plan, code);
  }
  emit({ stage: "verify", status: report.ok ? "ok" : "error", detail: verifySummary(report), payload: report });
  return { code, report };
}

function verifySummary(report: VerifyReport): string {
  const hard = report.findings.filter((f) => f.severity === "hard").length;
  const soft = report.findings.length - hard;
  if (report.ok && !soft) return `${report.checked} answer(s) verified`;
  return `${report.checked} checked · ${hard} hard · ${soft} soft`;
}

function needsRevision(critic: CriticReport): boolean {
  return critic.verdict === "revise" || critic.findings.some((f) => f.severity === "must-fix");
}

function mockResult(onStage?: StageSink): PipelineResult {
  // Genuinely run the verifier on the mock so the offline path exercises the
  // same correctness gate as a live generation.
  const vreport = verify(MOCK_PLAN, MOCK_LESSON);
  const stages: StageEvent[] = [
    { stage: "plan", status: "ok", detail: MOCK_PLAN.essence, payload: MOCK_PLAN },
    { stage: "build", status: "ok" },
    { stage: "compile", status: "ok" },
    { stage: "verify", status: vreport.ok ? "ok" : "error", detail: verifySummary(vreport), payload: vreport },
    { stage: "critic", status: "ok", detail: MOCK_CRITIC.summary, payload: MOCK_CRITIC },
  ];
  stages.forEach((e) => onStage?.(e));
  return {
    code: MOCK_LESSON,
    report: { source: "mock", stages, plan: MOCK_PLAN, critic: MOCK_CRITIC, verify: vreport, repairs: 0 },
  };
}
