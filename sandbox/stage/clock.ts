// The Stage's single time source. A figure may be running a simulation, three
// director tweens and a wait at once; all of them hang off ONE rAF loop so they
// cost one callback per frame and cannot drift out of phase with each other.
// Successor to the per-hook `useTime` in sandbox/sdk.tsx.
import * as React from "react";

export type ClockTick = (dt: number, elapsed: number) => void;

// A backgrounded tab, a long GC pause or a devtools breakpoint hands back one
// enormous delta. Fed to an integrator that is an instant explosion, so clamp:
// the sim runs *slow* under load, never wrong.
const MAX_DT = 1 / 20;

const now = () => performance.now();

class Clock {
  private subs = new Set<ClockTick>();
  private raf = 0;
  private last = 0;

  /** Seconds of *ticked* time since the first subscriber. Pauses don't count. */
  elapsed = 0;

  constructor() {
    if (typeof document !== "undefined") {
      // rAF is already throttled/stopped when hidden; stopping explicitly means
      // we also drop the loop, and `wake()` re-bases `last` so returning to the
      // tab resumes rather than jumping forward by the time spent away.
      document.addEventListener("visibilitychange", () =>
        document.hidden ? this.sleep() : this.wake(),
      );
    }
  }

  get size(): number {
    return this.subs.size;
  }

  subscribe(fn: ClockTick): () => void {
    this.subs.add(fn);
    this.wake();
    let live = true;
    return () => {
      if (!live) return; // idempotent: StrictMode calls cleanup on a dead sub
      live = false;
      this.subs.delete(fn);
      if (this.subs.size === 0) this.sleep();
    };
  }

  private wake() {
    if (this.raf || this.subs.size === 0) return;
    if (typeof document !== "undefined" && document.hidden) return;
    this.last = now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private sleep() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = () => {
    // Schedule first so that a subscriber unsubscribing during the tick (a sim
    // halting, a wait resolving) can cancel it via sleep() and leave no orphan.
    this.raf = requestAnimationFrame(this.frame);
    const t = now();
    const dt = Math.min((t - this.last) / 1000, MAX_DT);
    this.last = t;
    this.elapsed += dt;
    for (const fn of [...this.subs]) fn(dt, this.elapsed);
  };
}

export const clock = new Clock();

/**
 * `prefers-reduced-motion: reduce`. Read live (not cached) so a mid-session OS
 * change is honored on the next beat.
 *
 * NOTE the clock deliberately keeps ticking under reduced motion: a simulation
 * is *content*, not decoration — freezing it would empty the lesson. Reduced
 * motion is honored where it means something, in the director: beats land on
 * their final state instantly instead of tweening (see director.ts).
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A cancellable delay measured on the engine clock, so it pauses with the tab
 * instead of silently elapsing the way setTimeout would. `cancel()` resolves the
 * promise (it never leaves an awaiting beat hanging) — the caller decides
 * whether "resolved" means "continue" or "I was cancelled".
 */
export function delay(seconds: number): { promise: Promise<void>; cancel: () => void } {
  let settle!: () => void;
  const promise = new Promise<void>((r) => (settle = r));
  if (seconds <= 0) {
    settle();
    return { promise, cancel: () => {} };
  }
  let left = seconds;
  const off = clock.subscribe((dt) => {
    left -= dt;
    if (left <= 0) {
      off();
      settle();
    }
  });
  return {
    promise,
    cancel: () => {
      off();
      settle();
    },
  };
}

/**
 * Subscribe a component to the clock for as long as `enabled`. The callback is
 * held in a ref so a fresh closure per render never churns the subscription —
 * and so React 18/19 StrictMode's mount → unmount → mount produces exactly one
 * subscriber, not two.
 */
export function useClockSubscription(fn: ClockTick, enabled = true): void {
  const ref = React.useRef(fn);
  ref.current = fn;
  React.useEffect(() => {
    if (!enabled) return;
    return clock.subscribe((dt, elapsed) => ref.current(dt, elapsed));
  }, [enabled]);
}
