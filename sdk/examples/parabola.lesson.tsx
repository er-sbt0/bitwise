/**
 * Worked example — realistic model output for the SDK.
 *
 * Doubles as a few-shot example in the authoring prompt. Note what it never
 * does: it never writes a computed number as a prose literal (it interpolates
 * with `${fmt(...)}`), and every answer is a declarative, CAS-checkable spec.
 *
 * No imports — the SDK is injected in scope inside the sandbox.
 */

export const meta: LessonMeta = {
  concept: "vertex-form-parabolas",
  prerequisites: ["parabolas", "function-transformations"],
  objectives: [
    "Predict how a, h, and k move and shape the parabola",
    "Read the vertex directly off vertex form",
  ],
  difficulty: 2,
}

export default function Lesson() {
  const [a, setA] = useLessonState("a", 1)
  const [h, setH] = useLessonState("h", 0)
  const [k, setK] = useLessonState("k", 0)

  // Arithmetic in JS — correct by construction, never a hand-written literal.
  const f = (x: number) => a * (x - h) ** 2 + k

  return (
    <>
      <Section title="Vertex form">
        <Prose>{`Every parabola can be written in **vertex form**:

$$f(x) = a\\,(x - h)^2 + k$$

The point $(h, k)$ is the **vertex** — the turning point of the curve. Drag the
sliders and watch where the vertex goes.`}</Prose>

        <Plot x={[-6, 6]} y={[-6, 6]}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Point x={h} y={k} color="coral" label="vertex" />
        </Plot>

        <Slider value={a} onChange={setA} min={-3} max={3} step={0.1} label="a" />
        <Slider value={h} onChange={setH} min={-4} max={4} step={0.5} label="h" />
        <Slider value={k} onChange={setK} min={-4} max={4} step={0.5} label="k" />

        <Callout kind="key-idea" title="Read it straight off">
          <Prose>{`With the current sliders the vertex is at
$(h, k) = (${fmt(h)},\\ ${fmt(k)})$ — no algebra needed.`}</Prose>
        </Callout>
      </Section>

      <Section title="Check your intuition">
        <Prose>{`Set $a$ negative and notice the parabola opens **downward**.`}</Prose>

        <MultipleChoice
          prompt="What does making a negative do?"
          correct={1}
          shuffle
          solution={
            <Prose>{`The sign of $a$ sets the opening direction; its size sets how
narrow the curve is.`}</Prose>
          }
        >
          <Option>Shifts the vertex left</Option>
          <Option>Flips the parabola to open downward</Option>
          <Option>Has no visible effect</Option>
        </MultipleChoice>

        <Exercise
          prompt={
            <Prose>{`The parabola $f(x) = 2(x - 3)^2 + 5$ has its vertex at which point?`}</Prose>
          }
          answer={{ type: "point", x: 3, y: 5 }}
          input="point"
          solution={<Prose>{`Vertex form gives $(h, k)$ directly: $(3, 5)$.`}</Prose>}
        >
          <Hint>Compare it to $a(x - h)^2 + k$.</Hint>
          <Hint>$h = 3$ and $k = 5$ — read them straight off.</Hint>
        </Exercise>

        <Exercise
          prompt={
            <Prose>{`Write $f(x) = x^2 - 6x + 11$ in vertex form.`}</Prose>
          }
          // Symbolic equivalence: "(x-3)^2 + 2" also matches, spacing and all.
          answer={{ type: "expression", value: "(x - 3)^2 + 2", vars: ["x"] }}
          input="math"
          solution={
            <Steps>
              <Step title="Complete the square">
                <Prose>{`Take half of $-6$, square it: $(-3)^2 = 9$.`}</Prose>
              </Step>
              <Step title="Rewrite">
                <Prose>{`$x^2 - 6x + 9 + 2 = (x-3)^2 + 2$.`}</Prose>
              </Step>
            </Steps>
          }
        />
      </Section>
    </>
  )
}
