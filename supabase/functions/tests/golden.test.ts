// Golden test: the pre-change code (customer-api proxying over HTTP to api, from git) and the new in-process code get
// the same requests against identical fake databases; responses must match byte for byte (health may only add fields).
// When the base commit is not in the checkout (shallow CI clone), the stored snapshot of the original's responses is
// used instead. Regenerate it with: GOLDEN_UPDATE=1 deno test -A supabase/functions/tests/golden.test.ts
import "./_env.ts";
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { apiRequest, capture, crimesceneRpcs, customerRequest, dates, harness, seedTables, settingsRowSeed, useDb } from "./support.ts";
import { FakeDb, PgError, type Tables } from "./fake_postgrest.ts";
import { handleCustomer } from "../customer-api/handler.ts";
import { handleApi, REVISION } from "../api/router.ts";

type Handler = (req: Request) => Response | Promise<Response>;
type Step = { name: string; target: "customer" | "api"; request: () => Request };
type Result = { name: string; status: number; headers: Record<string, string | null>; text: string };

const BASE = Deno.env.get("GOLDEN_BASE") ?? "51434e8"; // production code before the in-process change
const SNAPSHOT = new URL("./golden/original-responses.json", import.meta.url);
const FILES = ["api/index.ts", "api/core.ts", "api/public.ts", "api/payment.ts", "api/admin.ts", "customer-api/index.ts"];

async function loadOriginal(): Promise<{ api: Handler; customer: Handler } | null> {
  const dir = new URL(`file://${await Deno.makeTempDir({ prefix: "crimescene-original-" })}/`);
  for (const file of FILES) {
    let out: Deno.CommandOutput;
    try { out = await new Deno.Command("git", { args: ["show", `${BASE}:supabase/functions/${file}`], cwd: new URL("../../../", import.meta.url), stdout: "piped", stderr: "null" }).output(); } catch { return null; }
    if (!out.success) return null;
    const target = new URL(file, dir);
    await Deno.mkdir(new URL(".", target), { recursive: true });
    await Deno.writeFile(target, out.stdout);
  }
  const before = harness.served.length;
  await import(new URL("api/index.ts", dir).href);
  await import(new URL("customer-api/index.ts", dir).href);
  await Deno.remove(dir, { recursive: true }); // modules are loaded; the copy is no longer needed
  const [api, customer] = harness.served.slice(before);
  harness.functions.set("api", api); // the original customer-api reaches api with fetch(`${SUPABASE_URL}/functions/v1/api/...`)
  return { api, customer };
}
const original = await loadOriginal();
const current = { api: handleApi as Handler, customer: handleCustomer as Handler };

const { d0, d1, past, beyond } = dates();
// api's CORS intentionally gained the Korean domains, so api steps use github.io, whose answer did not change.
const apiFrom = { origin: "https://sosirusok.github.io" };
const identity = { customerName: "김민수", phone: "010-1234-5678" };
const steps: Step[] = [
  { name: "health", target: "customer", request: () => customerRequest("/health") },
  { name: "bootstrap", target: "customer", request: () => customerRequest("/bootstrap") },
  { name: "api bootstrap", target: "api", request: () => apiRequest("/bootstrap", { headers: apiFrom }) },
  { name: "availability d0 (expiry releases a hold, missing slots inserted)", target: "customer", request: () => customerRequest(`/availability?date=${d0}`) },
  { name: "availability d0 again", target: "customer", request: () => customerRequest(`/availability?date=${d0}`) },
  { name: "availability d1 theme=b", target: "customer", request: () => customerRequest(`/availability?date=${d1}&theme=b`) },
  { name: "api availability d1", target: "api", request: () => apiRequest(`/availability?date=${d1}`, { headers: apiFrom }) },
  { name: "availability d1 after api insert", target: "customer", request: () => customerRequest(`/availability?date=${d1}`) },
  { name: "availability past", target: "customer", request: () => customerRequest(`/availability?date=${past}`) },
  { name: "availability beyond window", target: "customer", request: () => customerRequest(`/availability?date=${beyond}`) },
  { name: "availability without date", target: "customer", request: () => customerRequest("/availability") },
  { name: "availability unknown theme", target: "customer", request: () => customerRequest(`/availability?date=${d0}&theme=Z`) },
  { name: "availability inactive theme", target: "customer", request: () => customerRequest(`/availability?date=${d0}&theme=C`) },
  { name: "lookup", target: "customer", request: () => customerRequest("/reservations/lookup", { json: identity }) },
  { name: "api lookup", target: "api", request: () => apiRequest("/reservations/lookup", { json: identity, headers: apiFrom }) },
  { name: "lookup with cf-connecting-ip only", target: "customer", request: () => { const r = customerRequest("/reservations/lookup", { json: identity, headers: { "cf-connecting-ip": "198.51.100.9" } }); r.headers.delete("x-forwarded-for"); return r; } },
  { name: "lookup no match", target: "customer", request: () => customerRequest("/reservations/lookup", { json: { customerName: "없는사람", phone: "01000000000" } }) },
  { name: "lookup invalid", target: "customer", request: () => customerRequest("/reservations/lookup", { json: { customerName: "김", phone: "123" } }) },
  { name: "themes", target: "customer", request: () => customerRequest("/themes") },
  { name: "notices", target: "customer", request: () => customerRequest("/notices") },
  { name: "payment status", target: "customer", request: () => customerRequest("/payment/status") },
  { name: "reservation invalid", target: "customer", request: () => customerRequest("/reservations", { json: { themeId: "A", playDate: d1, startTime: "10:00", customerName: "최", phone: "010" } }) },
  { name: "reservation bad theme time", target: "customer", request: () => customerRequest("/reservations", { json: { themeId: "A", playDate: d1, startTime: "10:05", customerName: "최하늘", phone: "01055556666", partySize: 4, privacyConsent: true, cancellationConsent: true } }) },
  { name: "cancel invalid", target: "customer", request: () => customerRequest("/reservations/cancel", { json: {} }) },
  { name: "inquiry invalid", target: "customer", request: () => customerRequest("/inquiries", { json: { customerName: "최하늘" } }) },
  { name: "nicepay prepare (online off)", target: "customer", request: () => customerRequest("/payments/nicepay/prepare", { json: {} }) },
  { name: "nicepay result unknown", target: "customer", request: () => customerRequest("/payments/nicepay/result", { json: { orderId: "nope", actionToken: "x" } }) },
  { name: "nicepay abort unknown", target: "customer", request: () => customerRequest("/payments/nicepay/abort", { json: {} }) },
  { name: "unknown path", target: "customer", request: () => customerRequest("/nope") },
  { name: "wrong method on a known path", target: "customer", request: () => customerRequest("/reservations") },
  { name: "preflight", target: "customer", request: () => customerRequest("/bootstrap", { method: "OPTIONS" }) },
  { name: "PUT", target: "customer", request: () => customerRequest("/bootstrap", { method: "PUT" }) },
  { name: "foreign origin", target: "customer", request: () => customerRequest("/themes", { headers: { origin: "https://evil.example" } }) },
];

const introFailure = (fake: FakeDb) => { fake.fail = (call) => call.kind === "select" && call.target === "reservations" && call.params.get("open_room") === "eq.true" ? new PgError(500, { code: "XX000", message: "injected", details: null, hint: null }) : null; };
const variants: Array<{ name: string; tables: (seed: Tables) => Tables; setup?: (fake: FakeDb) => void; steps: Step[] }> = [
  { name: "business_name missing", tables: (seed) => ({ ...seed, store_settings: [settingsRowSeed({ business_name: null })] }), steps: steps.slice(1, 2) },
  { name: "no settings row", tables: (seed) => ({ ...seed, store_settings: [] }), steps: steps.slice(1, 5) },
  { name: "introductions query fails", tables: (seed) => seed, setup: introFailure, steps: steps.slice(3, 4) },
];

async function run(handlers: { api: Handler; customer: Handler }, tables: Tables, list: Step[], setup?: (fake: FakeDb) => void) {
  const fake = useDb(new FakeDb(tables, { rpcs: crimesceneRpcs() }));
  setup?.(fake);
  const results: Result[] = [];
  for (const step of list) results.push({ name: step.name, ...await capture(await handlers[step.target](step.request())) });
  await fake.idle();
  return { results, fake };
}

const normalize = (value: unknown) => JSON.parse(Object.entries({ "<D0>": d0, "<D1>": d1, "<PAST>": past, "<BEYOND>": beyond }).reduce((text, [token, date]) => text.replaceAll(date, token), JSON.stringify(value)));
// Snapshot entries keep the parsed body for review; JSON.stringify(body) restores the exact response text.
type Stored = { name: string; status: number; headers: Result["headers"]; body: unknown };
const toStored = (r: Result): Stored => ({ name: r.name, status: r.status, headers: r.headers, body: r.text ? JSON.parse(r.text) : null });
const fromStored = (r: Stored): Result => ({ name: r.name, status: r.status, headers: r.headers, text: r.body === null ? "" : JSON.stringify(r.body) });
const serialize = (responses: Record<string, Stored[]>) => `{"base":${JSON.stringify(BASE)},"responses":{\n${Object.entries(responses).map(([key, list]) => `${JSON.stringify(key)}:[\n${list.map((r) => JSON.stringify(r)).join(",\n")}\n]`).join(",\n")}\n}}\n`;
const storedOut = (out: Record<string, Result[]>) => normalize(Object.fromEntries(Object.entries(out).map(([key, list]) => [key, list.map(toStored)]))) as Record<string, Stored[]>;

function compare(actual: Result[], expected: Result[]) {
  assertEquals(actual.map((r) => r.name), expected.map((r) => r.name));
  for (const [i, want] of expected.entries()) {
    const got = actual[i];
    if (want.name === "health") {
      // Additive only: the original body plus revision/transport, original keys first and unchanged.
      assertEquals(got.text, `${want.text.slice(0, -1)},"revision":"${REVISION}","transport":"in-process"}`);
      assertEquals([got.status, got.headers], [want.status, want.headers]);
      continue;
    }
    assertEquals(got, want, want.name);
  }
}

async function scenario(handlers: { api: Handler; customer: Handler }) {
  const seed = await seedTables(), main = await run(handlers, seed, steps), out: Record<string, Result[]> = { main: main.results };
  for (const variant of variants) out[variant.name] = (await run(handlers, variant.tables(structuredClone(seed)), variant.steps, variant.setup)).results;
  return { out, main };
}

Deno.test({
  name: `golden: new code answers exactly like the original (${BASE}) for bootstrap/availability/lookup and every customer path`,
  ignore: original === null,
  fn: async () => {
    const before = await scenario(original!), after = await scenario(current);
    for (const key of Object.keys(before.out)) compare(after.out[key], before.out[key]);
    // Same database effects (expiry, inserted slots), same RPCs in the same order, same rate-limit buckets (client IP).
    assertEquals(after.main.fake.tables, before.main.fake.tables);
    const rpcs = (fake: FakeDb) => fake.calls.filter((c) => c.kind === "rpc").map((c) => c.target);
    assertEquals(rpcs(after.main.fake), rpcs(before.main.fake));
    assertEquals(after.main.fake.rateLimitKeys, before.main.fake.rateLimitKeys);
    assertEquals([after.main.fake.unsupported, before.main.fake.unsupported], [[], []]);
    // Fewer database round trips: lookup reads availability once, repeated availability reads skip the insert.
    const reads = (fake: FakeDb) => fake.calls.filter((c) => c.target === "availability").length;
    assert(reads(after.main.fake) < reads(before.main.fake), `${reads(after.main.fake)} < ${reads(before.main.fake)}`);
    if (Deno.env.get("GOLDEN_UPDATE") === "1") {
      await Deno.mkdir(new URL(".", SNAPSHOT), { recursive: true });
      await Deno.writeTextFile(SNAPSHOT, serialize(storedOut(before.out)));
    } else {
      assertEquals(storedOut(before.out), JSON.parse(await Deno.readTextFile(SNAPSHOT)).responses, "stored snapshot matches the original code");
    }
  },
});

Deno.test("golden snapshot: new code matches the stored responses of the original code", async () => {
  const stored = JSON.parse(await Deno.readTextFile(SNAPSHOT));
  assertEquals(stored.base, BASE);
  const after = normalize((await scenario(current)).out) as Record<string, Result[]>;
  for (const key of Object.keys(stored.responses)) compare(after[key], (stored.responses[key] as Stored[]).map(fromStored));
  assertEquals(Object.keys(after), Object.keys(stored.responses));
});
