// The one reader of the SDK contract. `sdk/sdk.d.ts` is the single source of
// truth for the SDK surface; this module parses its `@tier`/`@status` tags into
// a structured surface that every other consumer derives from:
//
//   • the authoring prompt (prompts/build.ts) may only advertise LIVE names,
//     enforced by the harness lint;
//   • the eval harness cross-checks these LIVE names against the actual runtime
//     scope (sandbox/sdk.tsx), failing on any drift in either direction.
//
// LIVE no longer feeds a verifier allow-list — that gate is retired (see
// app/api/generate/verify.ts). It is DOCUMENTATION coverage now: a `planned`
// primitive is simply not shown to the author, and the harness fails if the
// contract and the runtime scope ever disagree.
//
// No other file may hand-maintain a list of SDK names. Grow the surface by
// editing the contract, not by editing consumers.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Tier = "core" | "ext";
export type Status = "live" | "planned";
export type Kind = "top" | "plot-member";

export interface SdkEntry {
  name: string;
  tier: Tier;
  status: Status;
  kind: Kind;
}

// There is deliberately NO baked fallback list here. There used to be one, for a
// bundled deploy that couldn't read sdk.d.ts — but the only consumer left is the
// eval harness, which always runs from the repo root, and the copy had already
// gone stale (it was missing all 13 Stage names and still called Segment/Polygon
// planned). A stale fallback is worse than none: the doc gate would quietly
// compare the runtime against fiction and pass. Fail loudly instead.

// ── parser ───────────────────────────────────────────────────────────────────

const TIER_RE = /@tier\s+(core|ext)\b/;
const STATUS_RE = /@status\s+(live|planned)\b/;
const TOP_DECL_RE = /^export declare (?:function|const)\s+(\w+)/;
const PLOT_MEMBER_RE = /^\s*(\w+)\s*(?:<[^>]*>)?\s*\(/; // `OfX(props: ...)` inside the interface

/** Pull the last @tier/@status seen since the previous declaration. A comment
 *  can carry both on one line (`@tier core @status live`) or across lines. */
function parseSurface(src: string): SdkEntry[] {
  const lines = src.split("\n");
  const entries: SdkEntry[] = [];

  let pendingTier: Tier | null = null;
  let pendingStatus: Status | null = null;
  let inPlotInterface = false;
  let plotBraceDepth = 0;

  const takeTags = (): { tier: Tier; status: Status } => {
    // Default unknown declarations to planned+ext (fail-closed: not permitted,
    // not advertised) — the drift gate then flags the missing annotation.
    const tier = pendingTier ?? "ext";
    const status = pendingStatus ?? "planned";
    pendingTier = null;
    pendingStatus = null;
    return { tier, status };
  };

  for (const line of lines) {
    const tierM = line.match(TIER_RE);
    if (tierM) pendingTier = tierM[1] as Tier;
    const statusM = line.match(STATUS_RE);
    if (statusM) pendingStatus = statusM[1] as Status;

    // Track the PlotComponent interface body to scope member parsing.
    if (/^export interface PlotComponent\s*\{/.test(line)) {
      inPlotInterface = true;
      plotBraceDepth = 0;
    }
    if (inPlotInterface) {
      plotBraceDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
    }

    const topM = line.match(TOP_DECL_RE);
    if (topM) {
      const { tier, status } = takeTags();
      entries.push({ name: topM[1], tier, status, kind: "top" });
      continue;
    }

    if (inPlotInterface) {
      const memberM = line.match(PLOT_MEMBER_RE);
      // Skip the bare call signature `(props: PlotProps)` — that's Plot itself.
      if (memberM && !line.trimStart().startsWith("(")) {
        const { tier, status } = takeTags();
        entries.push({ name: memberM[1], tier, status, kind: "plot-member" });
      }
      if (plotBraceDepth <= 0 && /\}/.test(line)) inPlotInterface = false;
    }
  }

  return entries;
}

// ── accessors (cached) ───────────────────────────────────────────────────────

let cache: SdkEntry[] | null = null;

/** The parsed SDK surface. Throws if the contract can't be read or parsed —
 *  every consumer is a gate, and a gate that silently degrades is not a gate. */
export function sdkSurface(): SdkEntry[] {
  if (cache) return cache;
  const path = join(process.cwd(), "sdk", "sdk.d.ts");
  const parsed = parseSurface(readFileSync(path, "utf8"));
  // A near-empty parse means the file moved or changed shape, not that the SDK
  // shrank to nothing; say so rather than reporting a surface that isn't real.
  if (parsed.length < 10) {
    throw new Error(`${path}: parsed only ${parsed.length} SDK entries — the contract's shape changed, fix the parser in sdk/surface.ts`);
  }
  cache = parsed;
  return cache;
}

const namesOf = (kind: Kind, status: Status) =>
  new Set(sdkSurface().filter((e) => e.kind === kind && e.status === status).map((e) => e.name));

/** Top-level SDK identifiers the runtime renders today → what the prompt may
 *  document, and what the harness expects to find in the runtime scope. */
export function liveTopLevelNames(): Set<string> {
  return namesOf("top", "live");
}

/** Top-level identifiers declared but not yet implemented. */
export function plannedTopLevelNames(): Set<string> {
  return namesOf("top", "planned");
}

/** `Plot.*` marks the runtime renders today. */
export function livePlotMembers(): Set<string> {
  return namesOf("plot-member", "live");
}

/** `Plot.*` marks declared but not yet implemented. */
export function plannedPlotMembers(): Set<string> {
  return namesOf("plot-member", "planned");
}

/** Every top-level name, live or planned — the full declared surface. */
export function allTopLevelNames(): Set<string> {
  return new Set(sdkSurface().filter((e) => e.kind === "top").map((e) => e.name));
}
