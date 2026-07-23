// Stage 2 of the M1 pipeline: BUILD. Turn the pedagogical plan into one React
// lesson component against the SDK core tier. Lecture-first: the lesson is a
// taught argument (motivate -> develop -> reveal), interactions ILLUSTRATE the
// reasoning, and exercises are optional rather than the point.

import type { LessonPlan } from "./plan";

export const BUILD_SYSTEM = `You author ONE interactive math lesson as a single React component for the Bitwise engine.

You are given a PEDAGOGICAL PLAN. Your job is to render it as a lecture — a taught argument that conveys the essence — NOT a definition wrapped around a quiz. Teach the way a great professor lectures: motivate the question, develop one clean line of reasoning, reveal the essence, and let the learner *see why* by moving something.

OUTPUT CONTRACT
- Output ONLY the component source code. No prose, no explanation, no markdown fences.
- A default-exported function component: export default function Lesson() { ... }
- Also: export const meta = { concept, prerequisites?, objectives?, difficulty? }.
- NO import statements. The SDK below is already in scope as globals. There is no network, no DOM access.

THE SDK (these names are in scope — compose them, don't invent widgets)
Hooks:
  useLessonState(key, initial) -> [value, setValue]   // persisted; use for anything the learner changes
  useState/useEffect/useMemo/useRef/useCallback       // standard React
Prose & structure:
  <Section title="...">...</Section>                  // lessons are a sequence of Sections
  <Prose>{\`markdown string with $inline$ and $$block$$ LaTeX\`}</Prose>
  <Callout kind="note|tip|warning|key-idea" title?>...</Callout>   // use "key-idea" to state the essence
  <Steps><Step title?>...</Step><Step>...</Step></Steps>          // ordered derivation, revealed one beat at a time
  <Reveal label?>...</Reveal>                          // "try it before you see it"
  <Math block?>{\`LaTeX\`}</Math>                        // a standalone display equation
Math/format:
  fmt(number, digits?) -> string                       // interpolate computed values into Prose with \${fmt(x)}
  math.evaluate/simplify/derivative(expr, var?)
Plot (interactive coordinate plane; marks are CHILDREN):
  <Plot x={[-5,5]} y={[-5,5]} height?>
    <Plot.OfX y={x => f(x)} color?/>                   // color: "blue"|"coral"|"green"|"violet"|"orange"
    <Plot.Point x={} y={} color? label?/>
    <Plot.MovablePoint x={} y={} onMove={p => ...} color?/>   // wire onMove to state
  </Plot>
Controls (the explore-to-see-why surface):
  <Slider value={} onChange={} min={} max={} step? label?/>
  <Toggle checked={} onChange={} label?/>
  <NumberInput value={} onChange={} min? max? step? label?/>
Assessment (OPTIONAL — at most one light reflective check, never the focus):
  <Exercise prompt={<Prose>{...}</Prose>} answer={ANSWER} input?="text|number|point" solution?={...}>
    <Hint>...</Hint>
  </Exercise>
  <MultipleChoice prompt={...} correct={indexOrArray} shuffle? solution?><Option>...</Option>...</MultipleChoice>
  ANSWER shapes: {type:"numeric",value,tolerance?} | {type:"expression",value,vars?} | {type:"point",x,y,tolerance?} | {type:"text",value}

LECTURE-FIRST RULES
- Open by MOTIVATING — a tension or question, not a definition. Earn the idea.
- DEVELOP the argument with <Steps>: one beat per <Step>, so reasoning unfolds line by line instead of dumping algebra.
- Include exactly one interaction that lets the learner *see why* the idea is true (a Slider driving a Plot, or a MovablePoint). It must illustrate the reasoning, not test recall.
- REVEAL the essence explicitly, ideally in a <Callout kind="key-idea">.
- Prose children is a single template-literal STRING. Do NOT nest JSX inside <Prose>. Put math as $...$ / $$...$$.
- Never write a computed number as a prose literal. Compute in JS and interpolate with \${fmt(...)} — JS does the arithmetic, not you.
- Plot.OfX 'y' is a real JS function of x; keep it total (avoid dividing by zero across the domain).
- Use ONLY the components listed. Nothing else is defined.

Write the lesson you would be proud to give as a lecture.`;

const FEWSHOT = `export const meta = { concept: "slope-is-constant-rate", objectives: ["See why a line has one unchanging steepness"], difficulty: 1 }

export default function Lesson() {
  const [m, setM] = useLessonState("m", 1)
  const f = (x) => m * x
  const step = 1
  return (
    <>
      <Section title="Why is a line 'straight'?">
        <Prose>{\`Everyone can draw a straight line. But what makes it *straight*? Here is the whole answer in one idea: a line rises by the **same amount** every time you step one unit to the right. Its steepness never changes. Let's see that.\`}</Prose>
        <Plot x={[-5, 5]} y={[-5, 5]}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Point x={1} y={f(1)} color="coral" />
          <Plot.Point x={2} y={f(2)} color="coral" />
        </Plot>
        <Slider value={m} onChange={setM} min={-3} max={3} step={0.5} label="m" />
        <Prose>{\`Drag $m$. Whatever you pick, stepping from $x=1$ to $x=2$ raises the line by exactly $m = \${fmt(m)}$ — and so does every other unit step. That single repeated rise is the slope.\`}</Prose>
      </Section>
      <Section title="Where the rule comes from">
        <Steps>
          <Step title="Take one unit step">
            <Prose>{\`Start at any $x$ and move to $x+1$. The height goes from $m x$ to $m(x+1)$.\`}</Prose>
          </Step>
          <Step title="Subtract to get the rise">
            <Prose>{\`The rise is $m(x+1) - m x = m$. The $x$ cancels — so the answer doesn't depend on where you started.\`}</Prose>
          </Step>
          <Step title="That's the essence">
            <Prose>{\`Every unit step adds the same $m$. Constant rise per step **is** what straightness means.\`}</Prose>
          </Step>
        </Steps>
        <Callout kind="key-idea" title="Slope is a promise">
          <Prose>{\`A line's slope $m$ is a promise it keeps everywhere: *"step right by 1, I rise by $m$."* No exceptions along the curve — that constancy is straightness.\`}</Prose>
        </Callout>
      </Section>
    </>
  )
}`;

export function buildPrompt(plan: LessonPlan): string {
  return `Here is the pedagogical plan to render, and a well-formed lecture-first example to match in spirit (not content):

EXAMPLE LESSON:
${FEWSHOT}

PLAN (teach exactly this — its essence, argument, and interaction):
${JSON.stringify(plan, null, 2)}

Author the lesson component now. Follow the plan's through-line: motivate with its "motivate", develop its "develop" beats (use <Steps>), build the "interaction" so the learner sees why, and reveal its "essence". Return only the component source.`;
}

export function repairPrompt(code: string, error: string): string {
  return `The lesson component below failed. Fix it and return the COMPLETE corrected component source only (no fences, no commentary).

ERROR:
${error}

CURRENT CODE:
${code}`;
}

/** Offline mock lesson (lecture-first, mirrors MOCK_PLAN). Uses only implemented
 *  core-tier components incl. the new <Steps>. */
export const MOCK_LESSON = `export const meta = { concept: "vertex-form-parabolas", objectives: ["Read a parabola's vertex straight off vertex form"], difficulty: 2 }

export default function Lesson() {
  const [a, setA] = useLessonState("a", 1)
  const [h, setH] = useLessonState("h", 0)
  const [k, setK] = useLessonState("k", 0)
  const f = (x) => a * (x - h) ** 2 + k
  return (
    <>
      <Section title="Where does a parabola turn around?">
        <Prose>{\`Look at $x^2 - 6x + 11$. Where does it bottom out? You genuinely can't tell by staring. Yet there's a way to write *the same curve* so the turning point is impossible to miss. That's what vertex form buys you.\`}</Prose>
        <Plot x={[-6, 6]} y={[-6, 6]}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Point x={h} y={k} color="coral" label="vertex" />
        </Plot>
        <Slider value={a} onChange={setA} min={-3} max={3} step={0.1} label="a" />
        <Slider value={h} onChange={setH} min={-4} max={4} step={0.5} label="h" />
        <Slider value={k} onChange={setK} min={-4} max={4} step={0.5} label="k" />
        <Prose>{\`Drag $h$ and $k$. The vertex marker sits at $(\${fmt(h)}, \${fmt(k)})$ — exactly the numbers in the form. Drag $a$: the curve stretches and can flip, but the vertex never moves.\`}</Prose>
      </Section>
      <Section title="Why (h, k) is forced to be the vertex">
        <Steps>
          <Step title="A square is never negative">
            <Prose>{\`$(x-h)^2 \\\\ge 0$ for every $x$, and it equals $0$ only when $x = h$. So the squared part is smallest exactly at $x = h$.\`}</Prose>
          </Step>
          <Step title="Adding k lifts the floor">
            <Prose>{\`$f(x) = a(x-h)^2 + k$. When the square is $0$, $f = k$. Everywhere else the square adds something, pushing $f$ away from $k$.\`}</Prose>
          </Step>
          <Step title="So the turning point is read, not computed">
            <Prose>{\`The extreme value happens at $x = h$ and its height is $k$. The vertex is $(h, k)$ — straight off the form.\`}</Prose>
          </Step>
        </Steps>
        <Callout kind="key-idea" title="The essence">
          <Prose>{\`In $f(x) = a(x-h)^2 + k$ the vertex isn't something you *calculate* — it's something you *read*. The form already points at it.\`}</Prose>
        </Callout>
      </Section>
    </>
  )
}`;
