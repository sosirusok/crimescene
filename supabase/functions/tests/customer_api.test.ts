import "./_env.ts";
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { apiRequest, capture, CLIENT_IP, customerRequest, FAKE_URL, freshDb, harness, KOREAN_ORIGIN } from "./support.ts";
import { CUSTOMER_PATHS, handleCustomer } from "../customer-api/handler.ts";
import { handleApi, REVISION } from "../api/router.ts";
import { sha } from "../api/core.ts";
import { PgError } from "./fake_postgrest.ts";

const NOT_FOUND = JSON.stringify({ error: "API 경로를 찾을 수 없습니다." });

Deno.test("customer-api allow-list is exactly the customer site's public paths", () => {
  assertEquals([...CUSTOMER_PATHS].sort(), [
    "/", "/availability", "/bootstrap", "/health", "/inquiries", "/notices", "/payment/status", "/payments/nicepay/abort",
    "/payments/nicepay/prepare", "/payments/nicepay/result", "/reservations", "/reservations/cancel", "/reservations/lookup", "/themes",
  ]);
});

Deno.test("customer-api returns 404 for admin and server-only paths without running any handler", async () => {
  const fake = await freshDb();
  const blocked: Array<[string, string]> = [
    ["POST", "/admin/login"], ["GET", "/admin/dashboard"], ["POST", "/admin/reservations"], ["POST", "/admin/change-password"], ["GET", "/admin/"],
    ["POST", "/payments/nicepay/return"], ["POST", "/payments/nicepay/webhook"], ["GET", "/health/"], ["POST", "/reservations/lookup/x"], ["GET", "/nope"],
  ];
  for (const [method, path] of blocked) {
    const res = await capture(await handleCustomer(customerRequest(path, { method, json: method === "POST" ? { accessKey: "guess" } : undefined, headers: { authorization: "Bearer forged.token" } })));
    assertEquals([res.status, res.text], [404, NOT_FOUND], `${method} ${path}`);
    assertEquals(res.headers["access-control-allow-origin"], KOREAN_ORIGIN);
    assertEquals(res.headers["cache-control"], "no-store");
  }
  assertEquals(fake.calls.length, 0, "no query, rate-limit or admin lookup may run for a blocked path");
  // The api function itself still serves admin routes.
  assertEquals((await handleApi(apiRequest("/admin/dashboard"))).status, 401);
});

Deno.test("customer-api routes every allowed path to the in-process router", async () => {
  const fake = await freshDb();
  const expected: Array<[string, string, number, string?]> = [
    ["GET", "/", 200], ["GET", "/health", 200], ["GET", "/bootstrap", 200], ["GET", "/themes", 200], ["GET", "/availability", 400],
    ["GET", "/notices", 200], ["GET", "/payment/status", 200],
    ["POST", "/payments/nicepay/prepare", 503], ["POST", "/payments/nicepay/abort", 404, "결제 요청을 확인할 수 없습니다."],
    ["POST", "/payments/nicepay/result", 404, "결제 결과를 확인할 수 없습니다."], ["POST", "/reservations", 400], ["POST", "/reservations/lookup", 400],
    ["POST", "/reservations/cancel", 400], ["POST", "/inquiries", 400],
  ];
  for (const [method, path, status, error] of expected) {
    const res = await capture(await handleCustomer(customerRequest(path, { method, json: method === "POST" ? {} : undefined })));
    assertEquals(res.status, status, `${method} ${path}`);
    assert(res.text !== NOT_FOUND, `${method} ${path} must not hit the allow-list 404`);
    if (error) assertEquals(JSON.parse(res.text).error, error);
  }
  // Supabase may hand the function either path form.
  const short = await handleCustomer(new Request(`${FAKE_URL}/customer-api/health`, { headers: { origin: KOREAN_ORIGIN } }));
  assertEquals(JSON.parse(await short.text()).revision, REVISION);
  await fake.idle();
});

Deno.test("customer-api CORS: Korean domains, github.io and localhost are echoed; methods stay GET,POST,OPTIONS", async () => {
  const fake = await freshDb();
  for (const origin of [KOREAN_ORIGIN, "https://xn--oi2bkkl05a1gchcr33e50h.com", "https://sosirusok.github.io", "http://localhost:5173", "http://localhost:4173", "http://localhost:3000"]) {
    const res = await capture(await handleCustomer(customerRequest("/health", { headers: { origin } })));
    assertEquals(res.headers, {
      "content-type": "application/json", "access-control-allow-origin": origin, "access-control-allow-headers": "apikey,content-type,x-client-info",
      "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-max-age": "86400", vary: "Origin", "cache-control": "no-store", "x-content-type-options": "nosniff",
    });
  }
  const foreign = await capture(await handleCustomer(customerRequest("/health", { headers: { origin: "https://evil.example" } })));
  assertEquals(foreign.headers["access-control-allow-origin"], "https://xn--oi2bkkl05a1gchcr33e50h.com");
  const preflight = await handleCustomer(customerRequest("/reservations", { method: "OPTIONS" }));
  assertEquals([preflight.status, preflight.headers.get("access-control-allow-origin"), preflight.headers.get("access-control-allow-methods")], [204, KOREAN_ORIGIN, "GET,POST,OPTIONS"]);
  for (const method of ["PUT", "PATCH", "DELETE", "HEAD"]) {
    const res = await handleCustomer(customerRequest("/bootstrap", { method }));
    assertEquals(res.status, 405, method);
    if (method !== "HEAD") assertEquals(await res.json(), { error: "허용되지 않은 요청입니다." });
  }
  assertEquals(fake.calls.length, 0);
});

Deno.test("api CORS now allows the Korean domains (and keeps its other origins and default)", async () => {
  for (const origin of [KOREAN_ORIGIN, "https://xn--oi2bkkl05a1gchcr33e50h.com", "https://sosirusok.github.io", "https://www.crimesceneplay.com"]) {
    const res = await handleApi(apiRequest("/health", { headers: { origin } }));
    assertEquals(res.headers.get("access-control-allow-origin"), origin);
    assertEquals(res.headers.get("access-control-allow-methods"), "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  assertEquals((await handleApi(apiRequest("/health", { headers: { origin: "https://evil.example" } }))).headers.get("access-control-allow-origin"), "https://sosirusok.github.io");
  const preflight = await handleApi(apiRequest("/admin/dashboard", { method: "OPTIONS" }));
  assertEquals([preflight.status, preflight.headers.get("access-control-allow-origin")], [204, KOREAN_ORIGIN]);
});

Deno.test("health keeps version 5.0.0 and adds the deploy revision (customer-api also reports in-process)", async () => {
  const api = await (await handleApi(apiRequest("/health"))).text();
  assertEquals(api, `{"ok":true,"service":"crimescene-api","version":"5.0.0","database":"supabase-postgres","paymentProvider":"NICEPAY","revision":"${REVISION}"}`);
  const customer = await (await handleCustomer(customerRequest("/health"))).text();
  assertEquals(customer, `{"ok":true,"service":"crimescene-api","version":"5.0.0","database":"supabase-postgres","paymentProvider":"NICEPAY","revision":"${REVISION}","transport":"in-process"}`);
  assert(customer.includes('"version":"5.0.0"') && customer.includes('"paymentProvider":"NICEPAY"'), "pages.yml greps");
});

Deno.test("rate limiting keys on the incoming request's client IP", async () => {
  const fake = await freshDb();
  const identity = { customerName: "없는사람", phone: "010-0000-0000" };
  await handleCustomer(customerRequest("/reservations/lookup", { json: identity, headers: { "x-forwarded-for": `${CLIENT_IP}, 10.0.0.1` } }));
  const cfOnly = new Request(`${FAKE_URL}/functions/v1/customer-api/reservations/lookup`, { method: "POST", headers: { origin: KOREAN_ORIGIN, "cf-connecting-ip": "198.51.100.9", "content-type": "application/json" }, body: JSON.stringify(identity) });
  await handleCustomer(cfOnly);
  assertEquals(fake.rateLimitKeys, [await sha(`reservation-lookup:${CLIENT_IP}`), await sha("reservation-lookup:198.51.100.9")]);
  await fake.idle();
});

Deno.test("customer-api answers 503 with its CORS headers when a handler fails", async () => {
  const fake = await freshDb();
  fake.fail = (call) => call.target === "themes" ? new PgError(500, { code: "XX000", message: "boom", details: null, hint: null }) : null;
  const res = await capture(await handleCustomer(customerRequest("/bootstrap")));
  assertEquals([res.status, JSON.parse(res.text)], [503, { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }]);
  assertEquals(res.headers["access-control-allow-origin"], KOREAN_ORIGIN);
  await fake.idle();
});

Deno.test("index.ts files only register the importable handlers with Deno.serve", async () => {
  const before = harness.served.length;
  await import("../api/index.ts");
  await import("../customer-api/index.ts");
  assertEquals(harness.served.slice(before), [handleApi, handleCustomer]);
});
