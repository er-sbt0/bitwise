/**
 * SPIKE W0 · SHAPE C — "scene render-function / pure render(state)"
 *
 * Golden lesson: Newton's method — following the tangent to a root.
 *
 * Realistic model output authored against the *Shape C* Stage API. The figure
 * is a PURE FUNCTION of state: `<Stage>` owns the store, the clock, and (when
 * given `sim`) the emulator; the child is `(state, ctl) => marks`. All three
 * drivers write to the same store:
 *   · INTERACTION — drag x0 along the axis           → ctl.set(...)
 *   · DIRECTION   — "Play one step" timed sequence    → ctl.play(ctl.sequence([...]))
 *   · EMULATION   — "Run" iterates x_{n+1}=x_n-f/f'   → the <Stage sim={...}> stepper
 * plus a freeform <Custom> escape hatch for the shaded tangent triangle.
 *
 * No imports — the std-lib is injected in scope inside the sandbox. See api.md
 * for the exact signatures this file assumes.
 *
 * House rule honored throughout: never write a computed number as a prose
 * literal — every figure/prose number is interpolated with `${fmt(...)}`.
 * (The one bare literal, in the Exercise `answer`, is a static answer-spec the
 * CAS re-check reads — that is the determinism boundary, and it is allowed.)
 */

export const meta: LessonMeta = {
  concept: "newtons-method",
  prerequisites: ["derivatives", "tangent-lines", "roots-of-equations"],
  objectives: [
    "See a Newton step as sliding down the tangent to where it hits the x-axis",
    "Predict fast convergence near a root and blow-ups from a bad start",
    "Iterate x_{n+1} = x_n − f(x_n)/f'(x_n) and read the shrinking residual",
  ],
  difficulty: 3,
}

export default function Lesson() {
  // Arithmetic in JS — correct by construction, never a hand-written literal.
  const f = (x: number) => x ** 3 - 2 * x - 2 // one real root ≈ 1.769
  const fp = (x: number) => 3 * x ** 2 - 2 // f'(x); zero at x = ±√(2/3) ≈ ±0.816
  const step = (x: number) => x - f(x) / fp(x) // one Newton iteration
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t

  // The single reserved figure state. Interaction edits `guess`; the director
  // tweens the `*T` progress fields; the emulator writes `simX`/`iterates`.
  const initial = {
    guess: 2.5, // draggable x0 AND the base the animated step reads
    vertT: 0, //   0→1 : how far the vertical (guess,0)→(guess,f) is drawn
    tanT: 0, //    0→1 : how far the tangent is drawn toward the axis
    slideT: 0, //  0→1 : marker slide from guess → xNext along y=0
    simX: 2.5, //  emulator's current iterate
    iterates: [2.5] as number[], // the x_n history the emulator appends to
    acc: 0, //     emulator time accumulator (throttles the discrete step)
  }

  // EMULATION driver. The Stage calls this every frame ONLY while ctl.running.
  // Newton is a *discrete* map, so we gate one iteration per ~0.4s of clock
  // time — the emulator is decoupled from the render frame-rate by design.
  const sim = (st: typeof initial, dt: number) => {
    const acc = st.acc + dt
    if (acc < 0.4) return { ...st, acc }
    const x = step(st.simX)
    return { ...st, simX: x, acc: 0, iterates: [...st.iterates, x] }
  }

  return (
    <>
      <Section title="Newton's method — ride the tangent down">
        <Prose>{`To solve $f(x)=0$ you rarely get a formula. Newton's trick is to
**stand at a guess, follow the tangent line, and step to where it crosses the
$x$-axis** — then repeat. Each landing point is the next, usually better, guess:

$$x_{n+1} = x_n - \\frac{f(x_n)}{f'(x_n)}.$$

We'll hunt the root of $f(x) = x^3 - 2x - 2$. Drag the guess and watch where its
tangent lands.`}</Prose>

        <Stage initial={initial} sim={sim}>
          {(s, ctl) => {
            // Everything below is a PURE function of `s` — recomputed each
            // state change. `ctl` is in scope, so the control handlers under
            // the scene close over both state and controller for free.
            const g = s.guess
            const fg = f(g)
            const xn = step(g) // where THIS tangent meets y = 0
            const markerX = lerp(g, xn, s.slideT)
            // tangent partial endpoint (linear along the tangent segment):
            const tipX = lerp(g, xn, s.tanT)
            const tipY = lerp(fg, 0, s.tanT)

            // DIRECTION. A single Newton step as a timed sequence of beats:
            // grow the vertical, draw the tangent, slide the marker, then
            // COMMIT guess := xNext. Beats are either tween specs (ctl.tweenTo)
            // or plain thunks run at that point in the timeline.
            const stepBeats = (from: number) => {
              const to = step(from)
              return [
                () => ctl.set({ guess: from, vertT: 0, tanT: 0, slideT: 0 }),
                ctl.tweenTo({ vertT: 1 }, { duration: 0.4, ease: "easeOut" }),
                ctl.tweenTo({ tanT: 1 }, { duration: 0.5, ease: "easeInOut" }),
                ctl.tweenTo({ slideT: 1 }, { duration: 0.5, ease: "easeInOut" }),
                () => ctl.set({ guess: to, vertT: 0, tanT: 0, slideT: 0 }),
              ]
            }

            const playOne = () => ctl.play(ctl.sequence(stepBeats(g)))

            // Multi-step reveal. Tween targets are static, so the whole chain
            // of iterates must be pre-computed HERE and flattened into beats.
            const playThree = () => {
              const x1 = step(g)
              const x2 = step(x1)
              ctl.play(
                ctl.sequence([...stepBeats(g), ...stepBeats(x1), ...stepBeats(x2)]),
              )
            }

            return (
              <>
                <Scene x={[-2, 3]} y={[-8, 12]}>
                  <Plot.OfX y={f} color="blue" />

                  {/* the guess and its image on the curve */}
                  <Plot.Point x={g} y={fg} color="violet" />

                  {/* growing vertical (guess,0) → (guess,f) */}
                  {s.vertT > 0 && (
                    <Plot.Segment
                      from={[g, 0]}
                      to={[g, fg * s.vertT]}
                      color="ink"
                      style="dashed"
                    />
                  )}

                  {/* the tangent, drawn toward the axis by tanT */}
                  {s.tanT > 0 && (
                    <Plot.Segment from={[g, fg]} to={[tipX, tipY]} color="coral" />
                  )}

                  {/* FREEFORM escape hatch: the shaded right-triangle of the
                      step (run = xNext − guess, rise = f(guess)) plus an
                      arrowhead where the tangent meets the axis. Drawn in
                      figure coordinates via the injected transforms. */}
                  {s.tanT > 0.98 && (
                    <Custom>
                      {({ xToPx, yToPx }) => {
                        const ax = xToPx(g)
                        const ay = yToPx(fg)
                        const bx = xToPx(g)
                        const by = yToPx(0)
                        const cx = xToPx(xn)
                        const cy = yToPx(0)
                        // arrowhead pointing along the tangent into the axis
                        const dir = Math.atan2(cy - ay, cx - ax)
                        const ah = 9
                        const a1 = dir + Math.PI - 0.4
                        const a2 = dir + Math.PI + 0.4
                        return (
                          <g>
                            <path
                              d={`M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} Z`}
                              fill="#e0554d22"
                              stroke="none"
                            />
                            <path
                              d={`M ${cx} ${cy} L ${cx + ah * Math.cos(a1)} ${
                                cy + ah * Math.sin(a1)
                              } M ${cx} ${cy} L ${cx + ah * Math.cos(a2)} ${
                                cy + ah * Math.sin(a2)
                              }`}
                              stroke="#e0554d"
                              strokeWidth={2}
                              fill="none"
                            />
                          </g>
                        )
                      }}
                    </Custom>
                  )}

                  {/* the sliding marker (only while a step animates) */}
                  {s.slideT > 0 && <Plot.Point x={markerX} y={0} color="green" />}

                  {/* INTERACTION: drag the guess along the x-axis (y locked) */}
                  <Plot.MovablePoint
                    x={g}
                    y={0}
                    color="orange"
                    onMove={(p: { x: number }) => ctl.set({ guess: p.x })}
                  />
                </Scene>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={playOne}>Play one step</button>
                  <button onClick={playThree}>Play three steps</button>
                  <button
                    onClick={() =>
                      ctl.set({ guess: 0.9, vertT: 0, tanT: 0, slideT: 0 })
                    }
                  >
                    Try a bad start (x₀ = 0.9)
                  </button>
                </div>

                <Callout kind="key-idea" title="Read the current step">
                  <Prose>{`Standing at $x_0 = ${fmt(g)}$: the curve height is
$f(x_0) = ${fmt(fg)}$ and the slope is $f'(x_0) = ${fmt(fp(g))}$. The tangent
meets the axis at
$$x_1 = ${fmt(g)} - \\frac{${fmt(fg)}}{${fmt(fp(g))}} = ${fmt(xn)}.$$
That landing point is the green marker — and your next guess.`}</Prose>
                </Callout>
              </>
            )
          }}
        </Stage>

        <Callout kind="warning" title="Why a bad start blows up">
          <Prose>{`Near $x = ${fmt(0.816)}$ the slope $f'$ is almost zero, so
$f/f'$ is huge and the tangent flings the guess far away. Newton is fast **near**
a root and reckless far from one — the basin matters.`}</Prose>
        </Callout>
      </Section>

      <Section title="Let it iterate">
        <Prose>{`Direction *shows you* one step; **emulation** runs the map to
convergence. Press Run: the emulator applies $x_{n+1} = x_n - f(x_n)/f'(x_n)$
about twice a second, decoupled from the drawing, and lists the iterates. The
residual $|f(x_n)|$ should collapse toward $0$.`}</Prose>

        <Stage initial={initial} sim={sim}>
          {(s, ctl) => (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {!ctl.running ? (
                  <button onClick={ctl.run}>Run</button>
                ) : (
                  <button onClick={ctl.pause}>Pause</button>
                )}
                <button
                  onClick={() => {
                    ctl.pause()
                    ctl.set({ simX: s.guess, iterates: [s.guess], acc: 0 })
                  }}
                >
                  Reset to x₀ = {fmt(s.guess)}
                </button>
                <button
                  onClick={() => {
                    ctl.pause()
                    ctl.set({ guess: 0.9, simX: 0.9, iterates: [0.9], acc: 0 })
                  }}
                >
                  Reset to a bad start
                </button>
              </div>

              <Steps>
                {s.iterates.map((x, i) => (
                  <Step key={i} title={`x${i} = ${fmt(x)}`}>
                    <Prose>{`residual $|f(x_${i})| = ${fmt(Math.abs(f(x)))}$`}</Prose>
                  </Step>
                ))}
              </Steps>

              <Prose>{`After ${fmt(s.iterates.length - 1)} step(s) the guess is
$x = ${fmt(s.simX)}$ with residual $${fmt(Math.abs(f(s.simX)))}$.`}</Prose>
            </>
          )}
        </Stage>

        <Callout kind="tip" title="The essence, in one line">
          <Prose>{`A Newton step trades a hard equation for an easy one: replace
the curve by its **tangent** and solve *that* for zero. Repeat, and each linear
guess drags you toward the true root.`}</Prose>
        </Callout>
      </Section>

      <Section title="Check your intuition">
        <MultipleChoice
          prompt="A Newton step from x_n lands exactly where…"
          correct={1}
          shuffle
          solution={
            <Prose>{`The step is defined so the **tangent at $x_n$** — not the
curve — crosses zero at $x_{n+1}$. Following the curve itself would just be root-
finding again.`}</Prose>
          }
        >
          <Option>the curve $f$ crosses the $x$-axis</Option>
          <Option>the tangent line at $x_n$ crosses the $x$-axis</Option>
          <Option>the slope $f'(x_n)$ equals zero</Option>
        </MultipleChoice>

        <Exercise
          prompt={
            <Prose>{`For $f(x) = x^3 - 2x - 2$, take one Newton step from
$x_0 = 3$. What is $x_1$? (Round to two decimals.)`}</Prose>
          }
          // Static answer-spec literal — read by the CAS re-check, not prose.
          // f(3)=19, f'(3)=25, x1 = 3 − 19/25 = 2.24.
          answer={{ type: "numeric", value: 2.24, tolerance: 0.01 }}
          input="number"
          solution={
            <Steps>
              <Step title="Evaluate f and f' at 3">
                <Prose>{`$f(3) = 27 - 6 - 2 = 19$ and $f'(3) = 27 - 2 = 25$.`}</Prose>
              </Step>
              <Step title="Take the step">
                <Prose>{`$x_1 = 3 - \\dfrac{19}{25} = 2.24$.`}</Prose>
              </Step>
            </Steps>
          }
        >
          <Hint>Use $x_1 = x_0 - f(x_0)/f'(x_0)$.</Hint>
          <Hint>$f(3) = 19$, $f'(3) = 25$.</Hint>
        </Exercise>
      </Section>
    </>
  )
}
