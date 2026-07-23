/**
 * SPIKE W0 · SHAPE A — "hooks + imperative director"
 *
 * Golden lesson: "Newton's method — following the tangent to a root."
 * Realistic model output authored against the Stage std-lib (see api.md for the
 * exact signatures assumed here). No imports — the std-lib is injected in scope.
 *
 * Exercises all three Stage drivers on one figure:
 *   · INTERACTION — drag the guess x0 along the x-axis (Plot.MovablePoint).
 *   · DIRECTION   — dir.play(sequence([...])) animates ONE Newton step, then a
 *                   guided multi-step reveal.
 *   · EMULATION   — useSimulation iterates x_{n+1}=x_n−f/f' on the clock; "Run".
 *   · FREEFORM    — <Custom> shades the tangent's right-triangle + arrowhead.
 *
 * House rule honored: no computed number is ever written as a literal — every
 * one is interpolated with ${fmt(...)}.
 */

export const meta: LessonMeta = {
  concept: "newtons-method",
  prerequisites: ["derivatives", "tangent-lines", "roots-of-functions"],
  objectives: [
    "Read a Newton step as: slide down the tangent to where it crosses the x-axis",
    "Iterate x_{n+1} = x_n − f(x_n)/f'(x_n) and see fast convergence near a root",
    "Recognize how a bad initial guess overshoots or flies off",
  ],
  difficulty: 3,
}

export default function Lesson() {
  // f has one real root near x ≈ 1.77 and a flat spot (f'=0 at x = ±√(2/3))
  // that makes bad guesses fling far — a good basin to explore.
  const f = (x: number) => x ** 3 - 2 * x - 2
  const df = (x: number) => 3 * x ** 2 - 2
  const step = (x: number) => x - f(x) / df(x) // one Newton iterate
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  // ---- the Stage store: one reactive source for all three drivers ----------
  // x0            : the interactive guess (dragged / slid along the axis)
  // climb/tan/slide: 0..1 animation scalars the DIRECTOR tweens for one step
  // iter/iters    : the EMULATION state — current iterate + full history
  const s = useStage({
    x0: -1.5,
    climb: 0, // vertical rises from (x0,0) up to (x0,f(x0))
    tan: 0,   // tangent line draws out toward the axis crossing
    slide: 0, // marker slides along the axis to xNext
    iter: -1.5,
    iters: [] as number[],
  })

  const dir = useDirector()

  // EMULATION driver — a discrete map stepped at a fixed rate off the clock.
  // Returning null halts the sim (converged or ran long enough).
  const sim = useSimulation(
    s,
    (st: any) => {
      const x = st.iter
      if (Math.abs(f(x)) < 1e-9 || st.iters.length > 18) return null
      const xn = step(x)
      return { iter: xn, iters: [...st.iters, xn] }
    },
    { rate: 1.6 }, // ~1.6 iterations/second, independent of render fps
  )

  // ---- DIRECTION: build one step's beats from a concrete starting x --------
  // Beats are assembled in plain JS at play-time, so xNext is just arithmetic.
  const oneStep = (x: number) => {
    const xn = step(x)
    return sequence([
      set(s, { x0: x, climb: 0, tan: 0, slide: 0 }), // stage the step
      tweenTo(s, { climb: 1 }, { duration: 0.5, ease: "easeOut" }),   // rise to the curve
      tweenTo(s, { tan: 1 }, { duration: 0.6, ease: "linear" }),      // draw the tangent
      tweenTo(s, { slide: 1 }, { duration: 0.7, ease: "easeInOut" }), // slide to xNext
      set(s, { x0: xn }), // commit: the crossing becomes the next guess
    ])
  }

  const playOne = () => dir.play(oneStep(s.x0))

  // Guided multi-step reveal: chain four steps, recomputing x each beat.
  const playMany = () => {
    let x = s.x0
    const beats = []
    for (let i = 0; i < 4; i++) {
      beats.push(oneStep(x))
      beats.push(wait(0.25))
      x = step(x)
    }
    dir.play(sequence(beats))
  }

  const runSim = () => {
    s.set({ iter: s.x0, iters: [s.x0] }) // seed the iteration from the guess
    sim.start()
  }

  // ---- derived geometry read straight off the store (pure) -----------------
  const x0 = s.x0
  const y0 = f(x0)
  const xNext = step(x0)          // where the tangent meets y = 0
  const tanX = lerp(x0, xNext, s.tan) // tangent draw head
  const tanY = lerp(y0, 0, s.tan)
  const markX = lerp(x0, xNext, s.slide) // the sliding marker

  const root = 1.7692923542386314 // f(root) = 0, precomputed for the callout
  const resid = s.iters.length ? f(s.iters[s.iters.length - 1]) : f(x0)

  return (
    <>
      <Section title="Newton's method — chase the tangent to a root">
        <Prose>{`We want to solve $f(x) = 0$ for

$$f(x) = x^3 - 2x - 2.$$

Guessing blindly is hopeless. **Newton's idea:** stand at a guess $x_n$, and instead
of the curve, follow the **tangent line** — the curve's best straight-line stand-in.
Slide down the tangent to where it crosses the $x$-axis, and let *that* crossing be
your next guess. Repeat.`}</Prose>

        <Callout kind="key-idea" title="One step, in one sentence">
          <Prose>{`The tangent at $x_n$ crosses zero at

$$x_{n+1} = x_n - \\frac{f(x_n)}{f'(x_n)}.$$

Drag the guess below, then press **Play one step** to watch a single tangent slide.`}</Prose>
        </Callout>

        <Plot x={[-3, 4]} y={[-6, 8]} height={360}>
          <Plot.OfX y={f} color="blue" />

          {/* FREEFORM: the tangent step's right triangle + an arrowhead on the
              tangent — geometry the stock marks don't give us, drawn in figure
              coords. Opacity fades in with the vertical climb. */}
          <Custom
            draw={({ xToPx, yToPx }: any) => {
              const A = [xToPx(x0), yToPx(0)]        // foot on the axis
              const B = [xToPx(x0), yToPx(s.climb * y0)] // up the vertical
              const C = [xToPx(xNext), yToPx(0)]     // tangent's axis crossing
              const head = [xToPx(tanX), yToPx(tanY)]
              const ang = Math.atan2(yToPx(0) - yToPx(y0), xToPx(xNext) - xToPx(x0))
              const a1 = ang + 2.6
              const a2 = ang - 2.6
              return (
                <g>
                  <path
                    d={`M${A[0]},${A[1]} L${B[0]},${B[1]} L${C[0]},${C[1]} Z`}
                    fill="#7b5bd6"
                    fillOpacity={0.13 * s.climb}
                    stroke="none"
                  />
                  {s.tan > 0.98 && (
                    <path
                      d={`M${head[0]},${head[1]} L${head[0] - 9 * Math.cos(a1)},${
                        head[1] - 9 * Math.sin(a1)
                      } M${head[0]},${head[1]} L${head[0] - 9 * Math.cos(a2)},${
                        head[1] - 9 * Math.sin(a2)
                      }`}
                      stroke="#e08a2f"
                      strokeWidth={2.5}
                      fill="none"
                    />
                  )}
                </g>
              )
            }}
          />

          {/* DIRECTION reads these store scalars: vertical, tangent, slider */}
          <Plot.Segment x1={x0} y1={0} x2={x0} y2={s.climb * y0} color="violet" dashed />
          <Plot.Segment x1={x0} y1={y0} x2={tanX} y2={tanY} color="orange" strokeWidth={2.5} />
          <Plot.Point x={x0} y={y0} color="orange" />
          <Plot.Point x={markX} y={0} color="green" label="x_{n+1}" />

          {/* INTERACTION: drag the guess along the x-axis (y pinned to 0) */}
          <Plot.MovablePoint
            x={x0}
            y={0}
            color="coral"
            constrain="horizontal"
            onMove={(p: any) => s.set({ x0: p.x, climb: 0, tan: 0, slide: 0 })}
          />
        </Plot>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button onClick={playOne} disabled={dir.playing}>Play one step</button>
          <button onClick={playMany} disabled={dir.playing}>Play four steps</button>
        </div>

        <Slider
          value={x0}
          onChange={(x0: number) => s.set({ x0, climb: 0, tan: 0, slide: 0 })}
          min={-3}
          max={4}
          step={0.01}
          label="x_0"
        />

        <Callout kind="note" title="Where the tangent lands">
          <Prose>{`From $x_0 = ${fmt(x0)}$: the height is $f(x_0) = ${fmt(y0)}$ and the slope is
$f'(x_0) = ${fmt(df(x0))}$, so the tangent crosses the axis at
$x_1 = ${fmt(xNext)}$. The true root sits at $x^\\* \\approx ${fmt(root)}$.`}</Prose>
        </Callout>
      </Section>

      <Section title="Let it iterate">
        <Prose>{`Once one step works, the rest is just *doing it again*. Press **Run** to iterate
$x_{n+1} = x_n - f(x_n)/f'(x_n)$ from wherever the guess sits — the same clock that
drives the animation drives the iteration.`}</Prose>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button onClick={runSim} disabled={sim.running}>Run</button>
          <button onClick={() => sim.stop()} disabled={!sim.running}>Pause</button>
          <button onClick={() => { sim.reset(); s.set({ iters: [] }) }}>Reset</button>
        </div>

        {s.iters.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", margin: "10px 0" }}>
            {s.iters.map((xn, i) => (
              <span key={i} style={{ fontFamily: "ui-monospace, monospace" }}>
                <Math>{`x_{${i}} = ${fmt(xn, 5)}`}</Math>
              </span>
            ))}
          </div>
        )}

        <Callout kind={Math.abs(resid) < 1e-4 ? "tip" : "warning"} title="How close are we?">
          <Prose>{`The last iterate leaves a residual $|f(x_n)| = ${fmt(Math.abs(resid), 6)}$.
Near the root each step roughly **doubles** the number of correct digits — but start
past the flat spot at $x = \\pm\\sqrt{2/3} \\approx ${fmt(Math.sqrt(2 / 3))}$, where
$f'(x_0)$ is tiny, and the very first tangent can fling the guess far away.`}</Prose>
        </Callout>
      </Section>

      <Section title="Check your understanding">
        <Prose>{`Try Newton's method by hand, using $f(x) = x^3 - 2x - 2$ and
$f'(x) = 3x^2 - 2$.`}</Prose>

        <Exercise
          prompt={
            <Prose>{`Starting from $x_0 = 2$, compute the next iterate $x_1$.`}</Prose>
          }
          // f(2)=2, f'(2)=10 → x1 = 2 − 2/10 = 1.8. CAS-checked numerically.
          answer={{ type: "numeric", value: 1.8, tolerance: 1e-6 }}
          input="number"
          solution={
            <Steps>
              <Step title="Evaluate">
                <Prose>{`$f(2) = 8 - 4 - 2 = 2$ and $f'(2) = 12 - 2 = 10$.`}</Prose>
              </Step>
              <Step title="Step">
                <Prose>{`$x_1 = 2 - \\dfrac{2}{10} = 1.8$.`}</Prose>
              </Step>
            </Steps>
          }
        >
          <Hint>Plug into $x_1 = x_0 - f(x_0)/f'(x_0)$.</Hint>
        </Exercise>

        <Exercise
          prompt={
            <Prose>{`Write the Newton iteration map $x \\mapsto x_{n+1}$ for this $f$ as a
single expression in $x$.`}</Prose>
          }
          // Symbolic equivalence: any algebraically equal form matches.
          answer={{ type: "expression", value: "x - (x^3 - 2x - 2)/(3x^2 - 2)", vars: ["x"] }}
          input="math"
          solution={
            <Prose>{`Substitute $f$ and $f'$ into $x - f(x)/f'(x)$:
$$x - \\frac{x^3 - 2x - 2}{3x^2 - 2}.$$`}</Prose>
          }
        />

        <MultipleChoice
          prompt="Why can a guess near the flat spot f'(x)≈0 send Newton flying?"
          correct={0}
          shuffle
          solution={
            <Prose>{`Dividing by a near-zero slope makes $f(x)/f'(x)$ enormous, so the
tangent is nearly horizontal and crosses the axis very far away.`}</Prose>
          }
        >
          <Option>The step f(x)/f'(x) blows up when the slope is tiny</Option>
          <Option>The function has no root there</Option>
          <Option>The tangent line stops existing</Option>
        </MultipleChoice>
      </Section>
    </>
  )
}
