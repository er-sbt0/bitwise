// The authoring prompt for M0: a single-shot generation of one interactive
// lesson component. The SDK surface documented here is the CORE tier the
// sandbox runtime implements — keep it in sync with sandbox/sdk.tsx.

export const SYSTEM = `You author ONE interactive math lesson as a single React component for the Bitwise engine.

OUTPUT CONTRACT
- Output ONLY the component source code. No prose, no explanation, no markdown fences.
- A default-exported function component: export default function Lesson() { ... }
- Optionally: export const meta = { concept, prerequisites?, objectives? }.
- NO import statements. The SDK below is already in scope as globals. There is no network, no DOM access.

THE SDK (these names are in scope — compose them, don't invent widgets)
Hooks:
  useLessonState(key, initial) -> [value, setValue]   // persisted, use for anything the learner changes
  useState/useEffect/useMemo/useRef/useCallback       // standard React
Text:
  <Section title="...">...</Section>                  // lessons are a sequence of Sections
  <Prose>{\`markdown string with $inline$ and $$block$$ LaTeX\`}</Prose>
  <Callout kind="note|tip|warning|key-idea" title?>...</Callout>
  <Reveal label?>...</Reveal>
Math/format:
  fmt(number, digits?) -> string                      // interpolate computed values into Prose with \${fmt(x)}
  math.evaluate/simplify/derivative(expr, var?)
Plot (interactive coordinate plane; marks are CHILDREN):
  <Plot x={[-5,5]} y={[-5,5]} height?>
    <Plot.OfX y={x => f(x)} color?/>                  // color: "blue"|"coral"|"green"|"violet"|"orange"
    <Plot.Point x={} y={} color? label?/>
    <Plot.MovablePoint x={} y={} onMove={p => ...} color?/>   // wire onMove to state
  </Plot>
Controls:
  <Slider value={} onChange={} min={} max={} step? label?/>
  <Toggle checked={} onChange={} label?/>
  <NumberInput value={} onChange={} min? max? step? label?/>
Assessment (answers are DECLARATIVE and graded by a CAS):
  <Exercise prompt={<Prose>{...}</Prose>} answer={ANSWER} input?="text|number|point" solution?={...}>
    <Hint>...</Hint> <Hint>...</Hint>
  </Exercise>
  <MultipleChoice prompt={...} correct={indexOrArray} shuffle? solution?>
    <Option>...</Option> <Option>...</Option>
  </MultipleChoice>
ANSWER shapes:
  { type: "numeric", value: 5, tolerance? }
  { type: "expression", value: "(x-3)^2 + 2", vars?: ["x"] }   // symbolic equivalence
  { type: "point", x: 3, y: 5, tolerance? }
  { type: "text", value: "hypotenuse" | ["hypotenuse","the hypotenuse"], caseSensitive? }

HARD RULES
- Never write a computed number as a prose literal. Compute in JS and interpolate with \${fmt(...)} (JS does the arithmetic, not you).
- Prose children is a single template-literal STRING. Do NOT nest JSX inside <Prose>. Put math as $...$ / $$...$$.
- Plot.OfX 'y' is a real JS function of x. Keep functions total (avoid dividing by zero across the domain).
- Every Exercise 'answer' must be one of the declarative shapes above.
- Use ONLY the components listed. Nothing else is defined.

Make it genuinely interactive: at least one Plot driven by a Slider or MovablePoint, and at least one graded Exercise or MultipleChoice.`;

const FEWSHOT = `export const meta = { concept: "slope-of-a-line", objectives: ["See how slope controls steepness"] }

export default function Lesson() {
  const [m, setM] = useLessonState("m", 1)
  const [b, setB] = useLessonState("b", 0)
  const f = (x) => m * x + b
  return (
    <>
      <Section title="Slope and intercept">
        <Prose>{\`A line is \\\\(y = mx + b\\\\). The slope $m$ sets how steep it is; $b$ is where it crosses the $y$-axis. Drag the sliders.\`}</Prose>
        <Plot x={[-6, 6]} y={[-6, 6]}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Point x={0} y={b} color="coral" label="intercept" />
        </Plot>
        <Slider value={m} onChange={setM} min={-3} max={3} step={0.1} label="m" />
        <Slider value={b} onChange={setB} min={-4} max={4} step={0.5} label="b" />
        <Callout kind="key-idea">
          <Prose>{\`Right now the line is $y = \${fmt(m)}x + \${fmt(b)}$.\`}</Prose>
        </Callout>
      </Section>
      <Section title="Check yourself">
        <Exercise
          prompt={<Prose>{\`What is the slope of the line through $(0,1)$ and $(2,5)$?\`}</Prose>}
          answer={{ type: "numeric", value: 2 }}
          input="number"
          solution={<Prose>{\`Slope is rise over run: $(5-1)/(2-0) = 2$.\`}</Prose>}
        >
          <Hint>Slope is change in $y$ over change in $x$.</Hint>
        </Exercise>
      </Section>
    </>
  )
}`;

export function userPrompt(concept: string, repair?: { code: string; error: string }): string {
  if (repair) {
    return `The lesson component below failed. Fix it and return the COMPLETE corrected component source only (no fences, no commentary).

ERROR:
${repair.error}

CURRENT CODE:
${repair.code}`;
  }
  return `Here is a well-formed example lesson:

${FEWSHOT}

Now author a NEW, different lesson on this concept: "${concept}".
Return only the component source.`;
}
