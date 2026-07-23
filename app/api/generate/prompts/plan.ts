// Stage 1 of the M1 pipeline: the PLAN. Before any code is written, the model
// acts as a lecturer deciding *how to teach* the concept — the essence, the
// through-line, the intuition to leave behind. This is where pedagogy is
// decided; build.ts merely renders it. The plan is the LLM being the brain.

export interface LessonPlan {
  /** Stable-ish slug for the concept, e.g. "why-derivative-is-slope". */
  concept: string;
  /** Human-readable lesson title. */
  title: string;
  /** The single core idea, in one sentence. If a learner keeps only one thing. */
  essence: string;
  /** The hook: why this matters / the tension that makes the idea worth having. */
  motivate: string;
  /** The argument, as an ordered list of beats — the lecture's through-line. */
  develop: string[];
  /** The payoff: the essence made vivid once the argument lands. */
  reveal: string;
  /** The mental image to leave the learner holding. */
  intuition: string;
  /** The wrong idea this lesson should dissolve. */
  misconception: string;
  /** The ONE explore-to-see-why interaction that best illustrates the aha. */
  interaction: string;
  prerequisites?: string[];
  difficulty?: 1 | 2 | 3 | 4 | 5;
}

export const PLAN_SYSTEM = `You are a gifted university lecturer designing ONE short interactive math lesson for the Bitwise engine.

You are NOT writing the lesson yet. You are deciding HOW TO TEACH it — the pedagogy. Think like a professor who cares about conveying the *essence* of an idea, not about quizzing banal answers. A great lesson motivates a question, develops one clean line of reasoning, and leaves the learner with an intuition they did not have before.

Output ONLY a JSON object (no prose, no markdown fences) with this shape:
{
  "concept": "kebab-case-slug",
  "title": "Human-readable title",
  "essence": "The single core idea in one sentence.",
  "motivate": "The hook — the tension or question that makes this idea worth having.",
  "develop": ["ordered beat 1", "beat 2", "beat 3", "..."],   // the through-line of the argument/derivation
  "reveal": "The payoff — the essence made vivid once the argument lands.",
  "intuition": "The mental image to leave the learner holding.",
  "misconception": "A common wrong idea this lesson should dissolve.",
  "interaction": "ONE explore-to-see-why interaction (a slider/plot/movable point) that makes the aha visible.",
  "prerequisites": ["concept-slug", "..."],
  "difficulty": 1
}

PRINCIPLES
- Essence over coverage. One idea, taught deeply, beats five ideas listed.
- Develop a real argument. "develop" should read like a derivation or a chain of reasoning, not a table of contents.
- The interaction must *illustrate the reasoning* — something you move to SEE why the idea is true — not a quiz.
- Difficulty 1 (intro) to 5 (advanced). Keep the scope small enough to teach well in a few minutes.`;

export function planPrompt(concept: string): string {
  return `Design the lesson for this concept: "${concept}".
Return only the JSON plan.`;
}

/** Offline mock so the pipeline runs without an API key. */
export const MOCK_PLAN: LessonPlan = {
  concept: "vertex-form-parabolas",
  title: "Vertex form: reading a parabola's turning point straight off",
  essence:
    "In $f(x)=a(x-h)^2+k$, the pair $(h,k)$ is literally the vertex — the algebra hands you the turning point with no work.",
  motivate:
    "Given $x^2-6x+11$ you can't see where the parabola bottoms out. Vertex form makes the turning point impossible to miss.",
  develop: [
    "A squared term $(x-h)^2$ is never negative and is zero only at $x=h$ — so it is smallest exactly there.",
    "Adding $k$ shifts the whole curve up by $k$, so the lowest point sits at height $k$.",
    "Therefore the turning point is $(h,k)$, read directly off the form — before any arithmetic.",
    "The coefficient $a$ only stretches and (if negative) flips; it never moves the vertex.",
  ],
  reveal:
    "The vertex isn't something you compute — in vertex form it's something you *read*.",
  intuition:
    "$(x-h)^2$ is a valley pinned to the ground at $x=h$; $+k$ lifts the valley floor to height $k$.",
  misconception:
    "That you must complete the square or use $-b/2a$ every time — vertex form already shows the answer.",
  interaction:
    "Drag sliders for $a$, $h$, $k$ and watch the vertex marker track $(h,k)$ exactly while $a$ only reshapes the curve.",
  prerequisites: ["parabolas", "function-transformations"],
  difficulty: 2,
};
