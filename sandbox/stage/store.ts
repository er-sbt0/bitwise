// The Stage's domain store: one reactive object per figure holding only what the
// lesson is *about*. Presentation scalars (reveal fractions, scripted positions)
// live on mark handles instead — see mark.ts. That split is the fix for W0
// friction #1 (animation scalars leaking into semantic state).
import * as React from "react";

// ---- telemetry bridge -------------------------------------------------------
// The stage cannot import sandbox/sdk.tsx — the sdk imports the stage, and the
// cycle would break the bundle. So the emit hook is injected the same way
// sdk.tsx's own setEmit works, and the sdk calls setStageEmit() at boot.
let emitFn: (event: string, data?: unknown) => void = () => {};

export function setStageEmit(fn: (event: string, data?: unknown) => void) {
  emitFn = fn;
}

/** Shared by the other stage modules; not part of the authoring surface. */
export function track(event: string, data?: Record<string, unknown>) {
  emitFn(event, data);
}

// ---- the store --------------------------------------------------------------

export type Stage<T extends object> = T & {
  /** Merge a partial update. Fields are otherwise read-only. */
  set(patch: Partial<T>): void;
  /**
   * A plain snapshot of the current state. Use inside handlers, beat builders
   * and sim steps — `s.get().x` can never be a stale render-time capture.
   */
  get(): T;
};

type Core<T> = {
  subscribe: (l: () => void) => () => void;
  version: () => number;
};

const CORE = Symbol("stage.core");

function createStage<T extends object>(initial: T): Stage<T> {
  let state: T = { ...initial };
  let version = 0;
  let pending: string[] | null = null;
  const listeners = new Set<() => void>();

  // Writes land in `state` immediately (so a handler read, or the next step of a
  // multi-step sim frame, always sees them) but the *notification* is coalesced
  // onto a microtask. A sim taking 40 sub-steps inside one clock tick, or a
  // handler doing three set()s, therefore costs exactly one render — and because
  // the flush reads `state` rather than a queued value, the final state is never
  // dropped. A microtask (not rAF) so an interaction still paints in its frame.
  const flush = () => {
    if (!pending) return;
    const keys = pending;
    pending = null;
    version++;
    track("state", { keys });
    for (const l of [...listeners]) l();
  };

  const set = (patch: Partial<T>) => {
    const keys = Object.keys(patch).filter(
      (k) => !Object.is((state as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k]),
    );
    if (keys.length === 0) return;
    state = { ...state, ...patch }; // never mutated in place, so get() can hand it out as-is
    if (pending) pending.push(...keys);
    else {
      pending = keys;
      queueMicrotask(flush);
    }
  };

  const core: Core<T> = {
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    version: () => version,
  };

  const api = { set, get: () => state, [CORE]: core } as Record<string | symbol, unknown>;

  return new Proxy(api, {
    get: (_t, k) => (k in api ? api[k] : (state as Record<string | symbol, unknown>)[k]),
    has: (_t, k) => k in api || k in state,
    // Reads go to `state`, so make spreads/Object.keys see the domain fields and
    // not the two methods.
    ownKeys: () => Reflect.ownKeys(state),
    getOwnPropertyDescriptor: (_t, k) => ({
      value: (state as Record<string | symbol, unknown>)[k],
      enumerable: true,
      configurable: true,
    }),
    set: (_t, k) => {
      throw new Error(`stage field "${String(k)}" is read-only — use s.set({ ${String(k)}: ... })`);
    },
  }) as Stage<T>;
}

/**
 * `useStage(initial)` — the figure's domain state.
 *
 *   const s = useStage({ x0: -1.5, iters: [] as number[] })
 *   s.x0                       // read (during render: subscribes; in a handler: latest)
 *   s.set({ x0: 2 })           // merge
 *   s.get()                    // plain snapshot for closures
 *
 * Reads are correct in both places for the same reason: `s.field` always proxies
 * to the live state object, and the component is subscribed to *any* change. The
 * subscription is deliberately coarse rather than per-key — render is pure and
 * cheap, and a coarse subscription cannot miss an update the way a dependency
 * list can.
 */
export function useStage<T extends object>(initial: T): Stage<T> {
  const ref = React.useRef<Stage<T> | null>(null);
  if (!ref.current) ref.current = createStage(initial);
  const s = ref.current;
  const core = (s as unknown as Record<symbol, Core<T>>)[CORE];
  React.useSyncExternalStore(core.subscribe, core.version, core.version);
  return s;
}
