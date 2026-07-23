// The director: a Manim-style, mark-scoped timeline over Motion.
//
// A beat is a plain closure `(ctx) => Promise<void>`, built by the author and
// handed a runtime context only when `dir.play()` runs it. That late binding is
// Shape A's whole advantage (docs/spikes/w0/DECISION.md): a loop can build four
// beats from four recomputed x values, and a `call` beat can read the store at
// the moment it fires rather than at the moment it was written.
import * as React from "react";
import { animate } from "motion/react";
import { delay as clockDelay, prefersReducedMotion } from "./clock";
import type { Mark } from "./mark";
import { track } from "./store";

export type Ease =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "circIn"
  | "circOut"
  | "circInOut"
  | "backIn"
  | "backOut"
  | "backInOut"
  | "anticipate"
  | [number, number, number, number]
  | ((t: number) => number);

/** Durations and delays are in SECONDS throughout the authoring surface. */
export type BeatOpts = { duration?: number; ease?: Ease; delay?: number };

/** Plumbing handed to a beat at play time. Authors compose beats, never this. */
export type BeatContext = {
  /** True once a *hard* reset (or another play) has superseded this timeline. */
  cancelled(): boolean;
  tween(mark: Mark, name: string, to: number, opts?: BeatOpts): Promise<void>;
  wait(seconds: number): Promise<void>;
  /** Composite beats must run children through this — it maintains the reset depth. */
  invoke(beat: Beat, ctx: BeatContext): void | Promise<void>;
};

export type Beat = (ctx: BeatContext) => void | Promise<void>;

export type Director = {
  play(beat: Beat): Promise<void>;
  reset(): void;
  playing: boolean;
};

const DEFAULT_DURATION = 0.6;

type Cancellable = { stop: () => void };

function createDirector() {
  // Bumped by a *hard* reset. Every in-flight play captured the old value and
  // bails at its next beat boundary, which is what settles its promise.
  let gen = 0;
  // >0 ⟺ we are SYNCHRONOUSLY inside beat code. Incremented around the beat
  // *call*, not around the await, so it is 0 again while a tween is running.
  let depth = 0;
  let active = 0;
  const running = new Set<Cancellable>();
  const touched = new Set<Mark>(); // marks this director has ever animated
  const listeners = new Set<() => void>();
  let playing = false;

  const notify = (v: boolean) => {
    if (playing === v) return;
    playing = v;
    for (const l of [...listeners]) l();
  };

  const tween = (mark: Mark, name: string, to: number, opts: BeatOpts = {}) => {
    touched.add(mark);
    const mv = mark.value(name);
    // Reduced motion lands the beat rather than skipping it: the lesson must
    // still end in the correct visual state, just without the travel.
    if (prefersReducedMotion()) {
      mv.set(to);
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const controls = animate(mv, to, {
        duration: opts.duration ?? DEFAULT_DURATION,
        ease: opts.ease ?? "easeInOut",
        delay: opts.delay ?? 0,
      });
      const entry: Cancellable = { stop: () => (controls.stop(), finish()) };
      // delete() as the guard: whichever of completion / cancellation lands
      // first resolves, the other is a no-op. An awaiting beat can never hang.
      const finish = () => {
        if (running.delete(entry)) resolve();
      };
      running.add(entry);
      controls.then(finish, finish);
    });
  };

  const doWait = (seconds: number) => {
    if (prefersReducedMotion() || seconds <= 0) return Promise.resolve();
    const d = clockDelay(seconds);
    const entry: Cancellable = { stop: d.cancel };
    running.add(entry);
    return d.promise.then(() => void running.delete(entry));
  };

  const invoke = (beat: Beat, ctx: BeatContext) => {
    depth++;
    try {
      return beat(ctx);
    } finally {
      depth--;
    }
  };

  const reset = () => {
    for (const r of [...running]) r.stop();
    running.clear();
    // pathLength → 0 (undrawn), but positions and opacity are *stopped where
    // they are*, not rewound: a drag mid-animation should not teleport the
    // marker. Beats that need a starting pose stage it explicitly (mark.set).
    for (const m of touched) m.values.pathLength.set(0);
    // A reset from INSIDE a beat — the golden lesson's `oneStep` opens with one —
    // means "clear the stage before I draw", not "abort me". Only a reset from
    // outside the timeline (a drag, a slider) supersedes the running play.
    if (depth === 0) {
      gen++;
      if (active > 0) notify(false);
      track("director", { action: "reset" });
    }
  };

  const play = (beat: Beat): Promise<void> => {
    const myGen = gen;
    const ctx: BeatContext = {
      cancelled: () => myGen !== gen,
      tween,
      wait: doWait,
      invoke,
    };
    active++;
    notify(true);
    track("director", { action: "play" });
    return (async () => {
      try {
        await invoke(beat, ctx);
      } finally {
        active--;
        if (active === 0) notify(false);
      }
    })();
  };

  return {
    play,
    reset,
    isPlaying: () => playing,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/**
 * `useDirector()` — one timeline owner per figure.
 *
 *   dir.play(sequence([...]))  → Promise<void>, settles on finish OR reset
 *   dir.playing                → re-renders (buttons disable on it)
 *   dir.reset()                → cancel in-flight, pathLengths → 0
 */
export function useDirector(): Director {
  const ref = React.useRef<ReturnType<typeof createDirector> | null>(null);
  if (!ref.current) ref.current = createDirector();
  const core = ref.current;
  const playing = React.useSyncExternalStore(core.subscribe, core.isPlaying, core.isPlaying);
  // Unmounting mid-animation must not leave Motion ticking against dead nodes.
  React.useEffect(() => () => core.reset(), [core]);
  return { play: core.play, reset: core.reset, playing };
}

// ---- beats ------------------------------------------------------------------

/** Reveal a drawable mark: animate its reveal fraction to 1. */
export const drawTo =
  (mark: Mark, opts?: BeatOpts): Beat =>
  (ctx) =>
    ctx.tween(mark, "pathLength", 1, opts);

/** Move a handle-bound mark. Every key of `target` is tweened in step. */
export const transformTo =
  (mark: Mark, target: Record<string, number>, opts?: BeatOpts): Beat =>
  async (ctx) => {
    await Promise.all(Object.entries(target).map(([k, v]) => ctx.tween(mark, k, v, opts)));
  };

export const fadeTo =
  (mark: Mark, opacity: number, opts?: BeatOpts): Beat =>
  (ctx) =>
    ctx.tween(mark, "opacity", opacity, opts);

/** Zero-duration beat — the semantic commit, e.g. `call(() => s.set({ x0 }))`. */
export const call =
  (fn: () => void): Beat =>
  () => {
    fn();
  };

export const wait =
  (seconds: number): Beat =>
  (ctx) =>
    ctx.wait(seconds);

export const sequence =
  (beats: Beat[]): Beat =>
  async (ctx) => {
    for (const b of beats) {
      if (ctx.cancelled()) return; // a hard reset stops the remaining beats here
      await ctx.invoke(b, ctx);
    }
  };

export const parallel =
  (beats: Beat[]): Beat =>
  async (ctx) => {
    await Promise.all(beats.map((b) => ctx.invoke(b, ctx)));
  };

export const stagger =
  (beats: Beat[], { each = 0.1 }: { each?: number } = {}): Beat =>
  async (ctx) => {
    await Promise.all(
      beats.map(async (b, i) => {
        if (i) await ctx.wait(i * each);
        if (!ctx.cancelled()) await ctx.invoke(b, ctx);
      }),
    );
  };
