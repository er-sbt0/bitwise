// @babel/standalone ships no types. We use only transform() for the server-side
// compile gate (app/api/generate/pipeline.ts) and in the sandbox runtime.
declare module "@babel/standalone" {
  export function transform(
    code: string,
    options?: {
      filename?: string;
      presets?: unknown[];
      plugins?: unknown[];
      [key: string]: unknown;
    },
  ): { code: string | null; map?: unknown };
}
