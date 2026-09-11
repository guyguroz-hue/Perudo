/**
 * Just enough Deno to typecheck against.
 *
 * The function is written and checked here, in the same TypeScript project as
 * everything else, so the engine it imports is the engine the tests cover. That
 * only works if `Deno` has a shape — and only these two pieces of it are used.
 */
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): unknown
}
