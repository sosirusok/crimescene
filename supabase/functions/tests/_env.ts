// Test bootstrap. Import it FIRST in every test module: it must run before api/core.ts builds its Supabase client.
// - points SUPABASE_URL at a fake host and clears NICEPAY secrets (ONSITE mode, no provider calls);
// - replaces fetch so REST calls reach the current FakeDb, /functions/v1/<name> reaches a registered handler, and any
//   other network call throws (tests can never touch the production project);
// - replaces Deno.serve so importing an index.ts only records its handler.
import type { FakeDb } from "./fake_postgrest.ts";

export const FAKE_URL = "http://fake-project.supabase.test";
type Handler = (req: Request) => Response | Promise<Response>;
export type Harness = { db: FakeDb | null; functions: Map<string, Handler>; served: Handler[] };

const scope = globalThis as unknown as { __crimesceneHarness?: Harness };
if (!scope.__crimesceneHarness) {
  Deno.env.set("SUPABASE_URL", FAKE_URL);
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  for (const name of ["NICEPAY_CLIENT_ID", "NICEPAY_SECRET_KEY", "NICEPAY_ENVIRONMENT"]) Deno.env.delete(name);
  const state: Harness = { db: null, functions: new Map(), served: [] };
  scope.__crimesceneHarness = state;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin === FAKE_URL && url.pathname.startsWith("/rest/v1/")) {
      if (!state.db) return Promise.reject(new Error("No FakeDb installed"));
      return state.db.handle(request);
    }
    const fn = url.origin === FAKE_URL ? state.functions.get(url.pathname.split("/")[3] ?? "") : undefined;
    if (url.pathname.startsWith("/functions/v1/") && fn) return Promise.resolve(fn(request));
    return Promise.reject(new Error(`Blocked network call in tests: ${request.method} ${request.url}`));
  };
  Object.defineProperty(Deno, "serve", {
    configurable: true,
    writable: true,
    value: (...args: unknown[]) => {
      state.served.push(args.find((arg) => typeof arg === "function") as Handler);
      return { finished: Promise.resolve(), shutdown: () => Promise.resolve(), ref() {}, unref() {}, addr: { transport: "tcp", hostname: "127.0.0.1", port: 0 } };
    },
  });
}

export const harness = scope.__crimesceneHarness!;
