// Stage 3 of the M1 pipeline: the CRITIC — the primary quality gate. It does not
// check banal answers; it judges whether the lesson conveys the essence the way a
// good lecture would. Its verdict drives the refine loop (it improves the lesson,
// it does not hard-block release).

import type { LessonPlan } from "./plan";

export interface CriticFinding {
  /** Which dimension of the lecture the note is about. */
  aspect: "motivation" | "argument" | "intuition" | "interaction" | "clarity" | "essence";
  severity: "note" | "should-fix" | "must-fix";
  comment: string;
}

export interface CriticReport {
  /** "revise" (or any must-fix finding) triggers one more build pass. */
  verdict: "ship" | "revise";
  summary: string;
  findings: CriticFinding[];
}

export const CRITIC_SYSTEM = `You are a demanding pedagogy reviewer for the Bitwise engine — the kind of professor who insists a lesson actually *teach*, not just be correct. You are given the lesson's PLAN and the LESSON CODE it produced. Judge whether the lesson conveys the essence the way a great lecture would.

Do NOT nitpick answer-checking or grading. Judge the teaching. Ask:
- MOTIVATION: does it open with a real question/tension, or just define-then-drill?
- ARGUMENT: does it develop one clean line of reasoning (ideally as visible steps), or list facts?
- INTUITION: does the learner leave with a mental image, not just a formula?
- INTERACTION: does the interactive part let them *see why* the idea is true — or is it decorative / a quiz?
- CLARITY: is the prose crisp and free of hand-waving? Are computed values interpolated, not asserted?
- ESSENCE: is the plan's core idea actually landed and named?

Output ONLY a JSON object (no prose, no fences):
{
  "verdict": "ship" | "revise",
  "summary": "one or two sentences on the lesson's teaching quality",
  "findings": [
    { "aspect": "motivation|argument|intuition|interaction|clarity|essence", "severity": "note|should-fix|must-fix", "comment": "specific, actionable" }
  ]
}

Use "revise" (and "must-fix") sparingly — only when the lesson genuinely fails to teach the essence. Minor polish is "note". Be specific enough that a reviser could act on each finding.`;

export function criticPrompt(plan: LessonPlan, code: string): string {
  return `PLAN:
${JSON.stringify(plan, null, 2)}

LESSON CODE:
${code}

Review the lesson. Return only the JSON report.`;
}

/** Refine directive fed back into build.ts when the critic asks for a revision. */
export function refinePrompt(code: string, report: CriticReport): string {
  const notes = report.findings
    .filter((f) => f.severity !== "note")
    .map((f) => `- [${f.aspect}] ${f.comment}`)
    .join("\n");
  return `A pedagogy reviewer read your lesson and asked for revisions. Improve the TEACHING per these notes — keep what works, do not start over — and return the COMPLETE revised component source only (no fences, no commentary).

REVIEWER SUMMARY: ${report.summary}

FIX:
${notes || "- Sharpen the motivation and make the essence land harder."}

CURRENT CODE:
${code}`;
}

/** Offline mock critic verdict. */
export const MOCK_CRITIC: CriticReport = {
  verdict: "ship",
  summary:
    "Opens with a genuine question, develops the 'a square is never negative' argument as visible steps, and the sliders let the learner see the vertex stay put. The essence is named explicitly.",
  findings: [
    {
      aspect: "intuition",
      severity: "note",
      comment: "Could add one line naming the mental image: a valley pinned to the ground at x = h.",
    },
  ],
};
