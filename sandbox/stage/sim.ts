// The emulation driver: a stepper registered with the engine clock that writes
// patches into the domain store. Stepping is decoupled from render frame-rate by
// an accumulator, so a 1.6 Hz iteration and a 1 kHz integrator both run at their
// own cadence on a 60 Hz (or 144 Hz, or throttled) display.
import * as React from "react";
import { useClockSubscription } from "./clock";
import type { Stage } from "./store";

/**
 * Return a patch to merge into the store, `null` to HALT the simulation, or
 * nothing for a no-op step. `dt` is the fixed timestep the step is being run at.
 */
export type SimStep<T> = (state: T, dt: number) => Partial<T> | null | void;

export type SimOptions = {
  /** Discrete steps per second (`{ rate: 1.6 }` — an iteration you can watch). */
  rate?: number;
  /** Fixed continuous timestep in seconds (`{ dt: 1 / 240 }`). Wins over `rate`. */
  dt?: number;
  /** Backlog cap; see the drop below. */
  maxStepsPerFrame?: number;
};

export type Simulation = {
  start(): void;
  stop(): void;
  reset(): void;
  running: boolean;
};

/**
 * `useSimulation(store, step, opts)`.
 *
 *   const sim = useSimulation(s, (st) => st.done ? null : { x: next(st.x) }, { rate: 1.6 })
 *   sim.start() / sim.stop() / sim.reset() / sim.running
 *
 * `reset()` restores the store to the snapshot taken at the sim's FIRST start —
 * i.e. the state the learner set up before pressing Run.
 */
export function useSimulation<T extends object>(
  store: Stage<T>,
  step: SimStep<T>,
  opts: SimOptions = {},
): Simulation {
  const [running, setRunning] = React.useState(false);
  // Held in refs so the clock subscription never churns on a re-render, and so a
  // step closure always sees this render's values.
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const optsRef = React.useRef(opts);
  optsRef.current = opts;
  const acc = React.useRef(0);
  const seed = React.useRef<T | null>(null);

  const start = React.useCallback(() => {
    if (!seed.current) seed.current = store.get();
    acc.current = 0;
    setRunning(true);
  }, [store]);

  const stop = React.useCallback(() => setRunning(false), []);

  const reset = React.useCallback(() => {
    setRunning(false);
    acc.current = 0;
    if (seed.current) store.set(seed.current as Partial<T>);
  }, [store]);

  useClockSubscription((dt) => {
    const { rate, dt: fixed, maxStepsPerFrame = 60 } = optsRef.current;
    const h = fixed ?? (rate ? 1 / rate : undefined);

    // store.get() is re-read each sub-step: set() lands synchronously, so a
    // frame that runs 8 steps really is 8 sequential steps, not 8 from one state.
    const apply = (): boolean => {
      const patch = stepRef.current(store.get(), h ?? dt);
      if (patch === null) {
        setRunning(false); // the step said it converged / ran long enough
        return false;
      }
      if (patch) store.set(patch);
      return true;
    };

    if (h === undefined) {
      apply(); // no cadence given: one variable-dt step per frame
      return;
    }

    acc.current += dt;
    let n = 0;
    while (acc.current >= h && n < maxStepsPerFrame) {
      acc.current -= h;
      n++;
      if (!apply()) return;
    }
    // Still behind after the cap: drop the backlog instead of compounding it
    // into an ever-growing catch-up (the classic spiral of death).
    if (acc.current >= h) acc.current = 0;
  }, running);

  return { start, stop, reset, running };
}

/**
 * Classic RK4 over a state vector — the integrator for continuous systems
 * (pendulum, orbit). `deriv(t, y) → dy/dt`; returns y at t + dt.
 *
 *   const [th, w] = rk4((_, [th, w]) => [w, -(g / L) * Math.sin(th)], [th, w], t, dt)
 */
export function rk4(
  deriv: (t: number, y: number[]) => number[],
  y: number[],
  t: number,
  dt: number,
): number[] {
  const step = (base: number[], k: number[], s: number) => base.map((v, i) => v + k[i] * s);
  const k1 = deriv(t, y);
  const k2 = deriv(t + dt / 2, step(y, k1, dt / 2));
  const k3 = deriv(t + dt / 2, step(y, k2, dt / 2));
  const k4 = deriv(t + dt, step(y, k3, dt));
  return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
