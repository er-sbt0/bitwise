/**
 * GOLDEN REFERENCE LESSON — "Newton's method, following the tangent to a root."
 *
 * The W0 spike (docs/spikes/w0/DECISION.md) chose a **mark-scoped, retained-mode
 * director** over the channel bag: marks have identity (`useMark`), and the
 * director animates a *specific mark* (`drawTo` / `transformTo` / `fadeTo`).
 * Substrate is **Mafs** (wrapped behind our `Plot.*` names); **Motion** drives
 * the tweens. This file is three things at once:
 *   1. the API decision made concrete (the W1 build target),
 *   2. the few-shot the authoring prompt will lead with,
 *   3. the Phase-2 acceptance test (it must run once the runtime exists).
 *
 * ── ASSUMED STD-LIB (what W1 implements; injected in scope, no imports) ──────
 *   useStage(initial)                     → domain state; s.field (read), s.set(patch)
 *   useMark(initial?)                     → a handle; attach via <Mark mark={handle}/>.
 *                                           drawable marks expose pathLength (draw-on);
 *                                           all marks expose position + opacity.
 *                                           handle.set(patch) sets its values instantly.
 *   useDirector()                         → dir.play(beat), dir.playing, dir.reset()
 *   useSimulation(store, step, opts)      → { start, stop, reset, running }
 *   Beats: drawTo(mark, opts?) · transformTo(mark, target, opts?) · fadeTo(mark, o, opts?)
 *          call(fn) · sequence(beats) · parallel(beats) · stagger(beats,{each}) · wait(s)
 *   Marks (Mafs-backed): Plot, Plot.OfX, Plot.Point, Plot.Segment, Plot.MovablePoint,
 *          Plot.Polygon; a `mark` prop on any of them binds the handle; `<Custom>`
 *          is the freeform SVG hatch. Prose/Math/Callout/Steps/Exercise/… unchanged.
 *
 * House rule: no computed number is ever a prose literal — always ${fmt(...)}. The
 * one bare literal is the Exercise answer-spec the CAS re-check reads (the
 * determinism boundary), which is allowed.
 */

export const meta: LessonMeta = {
  concept: "newtons-method",
  prerequisites: ["derivatives", "tangent-lines", "roots-of-equations"],
  objectives: [
    "Read a Newton step as: slide down the tangent to where it crosses the x-axis",
    "Iterate x_{n+1} = x_n − f(x_n)/f'(x_n) and see fast convergence near a root",
    "Recognize how a bad initial guess overshoots or flies off",
  ],
  difficulty: 3,
}

export default function Lesson() {
  // f has one real root near x ≈ 1.77 and flat spots (f'=0 at x = ±√(2/3)) that
  // fling bad guesses far — a good basin to explore. Arithmetic in JS only.
  const f = (x: number) => x ** 3 - 2 * x - 2
  const df = (x: number) => 3 * x ** 2 - 2
  const stepFn = (x: number) => x - f(x) / df(x) // one Newton iterate

  // DOMAIN state — only what the lesson is *about*.
  const s = useStage({ x0: -1.5, iter: -1.5, iters: [] as number[] })

  // HANDLE-BOUND marks — the director animates these directly. Their motion never
  // touches the domain store (that separation is what W0 friction #1 was about).
  const vert = useMark() //             vertical (x0,0)→(x0,f(x0)) — draw-on
  const tang = useMark() //             tangent line — draw-on
  const marker = useMark({ x: -1.5 }) // the point that slides to xNext — transform

  const dir = useDirector()

  // EMULATION — a discrete map stepped at a fixed rate off the engine clock.
  // Returning null halts the sim (converged, or ran long enough).
  const sim = useSimulation(
    s,
    (st) => {
      const x = st.iter
      if (Math.abs(f(x)) < 1e-9 || st.iters.length > 18) return null
      const xn = stepFn(x)
      return { iter: xn, iters: [...st.iters, xn] }
    },
    { rate: 1.6 },
  )

  // DIRECTION — one step, addressed at specific marks. Geometry stays declarative
  // (the segments below read x0); the beats only reveal/move the marks.
  const oneStep = (x: number) => {
    const xn = stepFn(x)
    return sequence([
      call(() => {
        s.set({ x0: x }) // reposition the (declarative) segment endpoints
        dir.reset() //      pathLengths→0, cancel in-flight
        marker.set({ x }) // stage the marker at the current guess
      }),
      drawTo(vert, { duration: 0.5, ease: "easeOut" }), //   rise to the curve
      drawTo(tang, { duration: 0.6 }), //                    draw the tangent
      transformTo(marker, { x: xn }, { duration: 0.7, ease: "easeInOut" }), // slide
      call(() => s.set({ x0: xn })), //                      commit: crossing → next guess
    ])
  }

  const playOne = () => dir.play(oneStep(s.x0))

  // Guided four-step reveal: chain steps, recomputing x each beat (pure).
  const playMany = () => {
    let x = s.x0
    const beats = []
    for (let i = 0; i < 4; i++) {
      beats.push(oneStep(x))
      beats.push(wait(0.25))
      x = stepFn(x)
    }
    dir.play(sequence(beats))
  }

  const onGuess = (x0: number) => {
    s.set({ x0 })
    dir.reset() // interaction cancels any in-flight animation cleanly
  }

  const runSim = () => {
    s.set({ iter: s.x0, iters: [s.x0] }) // seed the iteration from the guess
    sim.start()
  }

  // ---- geometry, read straight off state (pure) -----------------------------
  const x0 = s.x0
  const y0 = f(x0)
  const xNext = stepFn(x0) // where the tangent meets y = 0
  const root = 1.7692923542386314 // f(root) = 0, for the callout
  const resid = s.iters.length ? f(s.iters[s.iters.length - 1]) : f(x0)

  return (
    <>
      <Section title="Newton's method — chase the tangent to a root">
        <Prose>{`We want to solve $f(x) = 0$ for

$$f(x) = x^3 - 2x - 2.$$

Guessing blindly is hopeless. **Newton's idea:** stand at a guess $x_n$, and
instead of the curve, follow the **tangent line** — the curve's best straight-line
stand-in. Slide down the tangent to where it crosses the $x$-axis, and let *that*
crossing be your next guess. Repeat.`}</Prose>

        <Callout kind="key-idea" title="One step, in one sentence">
          <Prose>{`The tangent at $x_n$ crosses zero at

$$x_{n+1} = x_n - \\frac{f(x_n)}{f'(x_n)}.$$

Drag the guess below, then press **Play one step** to watch a single tangent slide.`}</Prose>
        </Callout>

        <Plot x={[-3, 4]} y={[-6, 8]} height={360}>
          <Plot.OfX y={f} color="blue" />

          {/* FREEFORM: the tangent step's right triangle + an arrowhead at the
              crossing — geometry the stock marks don't give us, in figure coords. */}
          <Custom
            draw={({ xToPx, yToPx }: any) => {
              const A = [xToPx(x0), yToPx(0)]
              const B = [xToPx(x0), yToPx(y0)]
              const C = [xToPx(xNext), yToPx(0)]
              const ang = Math.atan2(yToPx(0) - yToPx(y0), xToPx(xNext) - xToPx(x0))
              return (
                <g>
                  <path
                    d={`M${A[0]},${A[1]} L${B[0]},${B[1]} L${C[0]},${C[1]} Z`}
                    fill="#7b5bd6"
                    fillOpacity={0.12}
                    stroke="none"
                  />
                  <path
                    d={`M${C[0]},${C[1]} L${C[0] - 9 * Math.cos(ang + 2.6)},${C[1] - 9 * Math.sin(ang + 2.6)} M${C[0]},${C[1]} L${C[0] - 9 * Math.cos(ang - 2.6)},${C[1] - 9 * Math.sin(ang - 2.6)}`}
                    stroke="#e08a2f"
                    strokeWidth={2.5}
                    fill="none"
                  />
                </g>
              )
            }}
          />

          {/* Draw-on marks: declarative geometry (endpoints read x0); the director
              only reveals them via drawTo(pathLength). */}
          <Plot.Segment mark={vert} x1={x0} y1={0} x2={x0} y2={y0} color="violet" dashed />
          <Plot.Segment mark={tang} x1={x0} y1={y0} x2={xNext} y2={0} color="orange" strokeWidth={2.5} />
          <Plot.Point x={x0} y={y0} color="orange" />

          {/* Handle-bound marker: its x lives on the mark, moved by transformTo. */}
          <Plot.Point mark={marker} y={0} color="green" label="x_{n+1}" />

          {/* INTERACTION: drag the guess along the x-axis (state-bound, not scripted). */}
          <Plot.MovablePoint x={x0} y={0} color="coral" constrain="horizontal" onMove={(p: any) => onGuess(p.x)} />
        </Plot>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button onClick={playOne} disabled={dir.playing}>Play one step</button>
          <button onClick={playMany} disabled={dir.playing}>Play four steps</button>
        </div>

        <Slider value={x0} onChange={onGuess} min={-3} max={4} step={0.01} label="x_0" />

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
          prompt={<Prose>{`Starting from $x_0 = 2$, compute the next iterate $x_1$.`}</Prose>}
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
