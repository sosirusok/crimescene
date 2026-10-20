import "./_env.ts";
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1.0.19";
import { capture, customerRequest, dates, freshDb, PHONE, reservationBody, reserveSlot } from "./support.ts";
import { PgError, raise, uniqueViolation } from "./fake_postgrest.ts";
import { handleCustomer } from "../customer-api/handler.ts";
import { onsiteReservationId } from "../api/public.ts";
import { sha } from "../api/core.ts";

const KEY = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const post = async (body: unknown) => { const res = await handleCustomer(customerRequest("/reservations", { json: body })); return { status: res.status, body: await res.json() }; };
const idOf = async (body: Record<string, any>) => onsiteReservationId(body.idempotencyKey, await sha(String(body.phone).replace(/\D/g, "")), [String(body.themeId).toUpperCase(), body.playDate, body.startTime, body.customerName, body.partySize, body.openRoom === true, String(body.specialRequest ?? "").trim()]);

Deno.test("onsiteReservationId is deterministic, UUID-formatted and covers key, phone and every booking field", async () => {
  const hash = await sha(PHONE), fields: Array<string | number | boolean> = ["A", "2026-10-21", "11:30", "최하늘", 4, false, ""];
  const id = await onsiteReservationId(KEY, hash, fields);
  assertEquals(id, await onsiteReservationId(KEY, hash, [...fields]));
  assertMatch(id, UUID);
  // Pinned so the derivation (and therefore retry matching across deploys) cannot change by accident.
  assertEquals(id, "4bb8be6e-b0d5-8dd9-9138-4c7649079310"); // cross-checked with Python hashlib
  const variants = [
    onsiteReservationId(`${KEY}x`, hash, fields), onsiteReservationId(KEY, await sha("01099998888"), fields),
    ...fields.map((_, i) => onsiteReservationId(KEY, hash, fields.map((v, j) => j === i ? (typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : `${v}!`) : v))),
  ];
  const ids = new Set(await Promise.all(variants));
  assertEquals(ids.size, variants.length); assert(!ids.has(id));
});

Deno.test("POST /reservations without idempotencyKey behaves as before (every call books)", async () => {
  const fake = await freshDb();
  const body = reservationBody({ partySize: 2, openRoom: true, specialRequest: "같이 해요" });
  const first = await post(body), second = await post(body);
  assertEquals([first.status, second.status], [201, 201]);
  assertNotEquals(first.body.reservation.id, second.body.reservation.id);
  assertEquals(fake.callsOf("rpc", "reserve_crimescene_slot").length, 2);
  assertEquals(Object.keys(first.body), ["reservation", "payment"]);
  assertEquals(Object.keys(first.body.reservation), ["id", "themeTitle", "playDate", "startTime", "partySize", "totalAmount", "status", "paymentStatus", "bookingMode", "room"]);
  assertEquals(first.body.payment, { provider: "ONSITE", status: "READY", mode: "ONSITE", label: "매장 결제", enabled: false });
  assertEquals(fake.callsOf("select", "reservations").length, 0, "no idempotency lookup without a key");
  await fake.idle();
});

Deno.test("a retried keyed request returns the same reservation (200) without booking again", async () => {
  const fake = await freshDb();
  const body = reservationBody({ idempotencyKey: KEY });
  const created = await post(body), replay = await post(body), again = await post({ ...body, phone: "01055556666" });
  assertEquals([created.status, replay.status, again.status], [201, 200, 200]);
  assertEquals(created.body.reservation.id, await idOf(body));
  assertEquals(replay.body, created.body, "same response body as the original booking");
  assertEquals(again.body, created.body, "phone formatting does not change the derived id");
  assertEquals(fake.callsOf("rpc", "reserve_crimescene_slot").length, 1);
  assertEquals(fake.tables.reservations.filter((r) => r.id === created.body.reservation.id).length, 1);
  assertEquals(fake.tables.availability.find((s) => s.theme_id === "A" && s.play_date === dates().d1 && s.start_time === "11:30:00")?.booked_count, 4);
  await fake.idle();
});

const SPENT = { status: 409, body: { error: "이전 예약 요청이 취소되었습니다. 다시 예약해 주세요." } };
for (const status of ["CANCELED", "NO_SHOW"]) {
  Deno.test(`a keyed retry after the reservation became ${status} is refused (409), not replayed as a booking`, async () => {
    const fake = await freshDb();
    const body = reservationBody({ idempotencyKey: KEY });
    const created = await post(body);
    assertEquals(created.status, 201);
    const row = fake.tables.reservations.find((r) => r.id === created.body.reservation.id)!;
    row.status = status; // canceled by the customer (lookup/cancel) or an admin; the slot is freed
    Object.assign(fake.tables.availability.find((s) => s.theme_id === "A" && s.play_date === body.playDate && s.start_time === "11:30:00")!, { booked_count: 0, open_room: false, status: "OPEN" });
    assertEquals(await post(body), SPENT);
    assertEquals(fake.callsOf("rpc", "reserve_crimescene_slot").length, 1, "no second booking attempt with the spent id");
    // The client drops the key on a 4xx; a fresh key books normally.
    assertEquals((await post({ ...body, idempotencyKey: `${KEY}-new` })).status, 201);
    await fake.idle();
  });
}

Deno.test("a concurrent keyed retry whose raced reservation is already canceled is refused (409)", async () => {
  const fake = await freshDb();
  const body = reservationBody({ idempotencyKey: KEY });
  fake.rpcs.reserve_crimescene_slot = (args, db) => { reserveSlot(args, db); db.tables.reservations.find((x) => x.id === args.p_reservation_id)!.status = "CANCELED"; throw uniqueViolation("reservations_pkey", `Key (id)=(${args.p_reservation_id}) already exists.`); };
  assertEquals(await post(body), SPENT);
  await fake.idle();
});

Deno.test("a different payload or phone with the same key is a different booking", async () => {
  const fake = await freshDb();
  const body = reservationBody({ idempotencyKey: KEY, partySize: 2, openRoom: true, specialRequest: "같이 해요" });
  const a = await post(body), b = await post({ ...body, specialRequest: "함께 해요" }), c = await post({ ...body, phone: "010-7777-8888" });
  assertEquals([a.status, b.status, c.status], [201, 201, 201]);
  assertEquals(new Set([a.body.reservation.id, b.body.reservation.id, c.body.reservation.id]).size, 3);
  await fake.idle();
});

for (const [label, failure] of [
  ["a unique violation on the id", (id: string) => uniqueViolation("reservations_pkey", `Key (id)=(${id}) already exists.`)],
  ["slot_unavailable", () => raise("slot_unavailable")],
  ["slot_capacity_insufficient", () => raise("slot_capacity_insufficient")],
] as const) {
  Deno.test(`a concurrent retry that wins first (${label}) is answered with the existing reservation`, async () => {
    const fake = await freshDb();
    const body = reservationBody({ idempotencyKey: KEY });
    // The twin request commits between our existence check and our RPC; our RPC then fails the way Postgres would.
    fake.rpcs.reserve_crimescene_slot = (args, db) => { reserveSlot(args, db); throw failure(args.p_reservation_id); };
    const res = await post(body);
    assertEquals(res.status, 200);
    assertEquals(res.body.reservation.id, await idOf(body));
    assertEquals([res.body.reservation.status, res.body.reservation.bookingMode, res.body.reservation.room.state], ["CONFIRMED", "PRIVATE", "PRIVATE_BOOKED"]);
    assertEquals(fake.tables.reservations.filter((r) => r.id === res.body.reservation.id).length, 1);
    await fake.idle();
  });
}

Deno.test("keyed slot errors with no matching reservation keep their original 409 responses", async () => {
  const fake = await freshDb();
  const blocked = await post(reservationBody({ idempotencyKey: KEY, themeId: "B", playDate: dates().d0, startTime: "10:00", partySize: 2 }));
  assertEquals([blocked.status, blocked.body], [409, { error: "선택한 회차는 방금 마감되었거나 단독팀 예약이 있습니다." }]);
  const taken = await post(reservationBody({ idempotencyKey: `${KEY}-2`, themeId: "B", playDate: dates().d1, startTime: "12:00", partySize: 2 }));
  assertEquals([taken.status, taken.body], [409, { error: "선택한 회차는 방금 마감되었거나 단독팀 예약이 있습니다." }]);
  fake.rpcs.reserve_crimescene_slot = () => { throw raise("slot_capacity_insufficient"); };
  const full = await post(reservationBody({ idempotencyKey: `${KEY}-3` }));
  assertEquals([full.status, full.body], [409, { error: "남은 자리보다 예약 인원이 많습니다." }]);
  await fake.idle();
});

Deno.test("idempotencyKey is validated; an empty key means no key", async () => {
  const fake = await freshDb();
  for (const key of ["short", "has space in it 123", "x".repeat(129), "bad/char/key/1234567"]) {
    assertEquals(await post(reservationBody({ idempotencyKey: key })), { status: 400, body: { error: "예약 요청 식별값을 다시 생성해 주세요." } }, key);
  }
  assertEquals(fake.callsOf("rpc", "reserve_crimescene_slot").length, 0);
  assertEquals((await post(reservationBody({ idempotencyKey: "" }))).status, 201);
  assertEquals((await post(reservationBody({ idempotencyKey: "A".repeat(16), startTime: "13:20" }))).status, 201);
  await fake.idle();
});

Deno.test("an existing row with the derived id but another phone is never returned", async () => {
  const fake = await freshDb();
  const body = reservationBody({ idempotencyKey: KEY }), id = await idOf(body);
  fake.insertRow("reservations", { id, theme_id: "A", play_date: body.playDate, start_time: "11:30", phone_hash: "someone-else", customer_name: "타인", party_size: 4, total_amount: 92000, status: "CONFIRMED", payment_status: "READY", booking_mode: "PRIVATE" });
  const res = await capture(await handleCustomer(customerRequest("/reservations", { json: body })));
  assertEquals(res.status, 503);
  assert(!res.text.includes("타인") && !res.text.includes(id));
  await fake.idle();
});

Deno.test("lookup reads availability once for all reservations", async () => {
  const fake = await freshDb();
  const res = await handleCustomer(customerRequest("/reservations/lookup", { json: { customerName: "김민수", phone: "010-1234-5678" } }));
  const body = await res.json();
  assertEquals(body.reservations.length, 4);
  assertEquals(fake.callsOf("select", "availability").length, 1);
  assertEquals(body.reservations.map((r: any) => r.room === null), [true, false, false, true]);
  const none = await handleCustomer(customerRequest("/reservations/lookup", { json: { customerName: "없는사람", phone: "010-1234-5678" } }));
  assertEquals((await none.json()).reservations, []);
  assertEquals(fake.callsOf("select", "availability").length, 1, "no availability read when nothing matched");
  await fake.idle();
});

const order = (events: string[], entry: string) => { const i = events.indexOf(entry); assert(i >= 0, `missing event ${entry}`); return i; };

Deno.test("bootstrap reads settings and themes while expiry runs", async () => {
  const fake = await freshDb();
  await handleCustomer(customerRequest("/bootstrap"));
  const expired = order(fake.events, "end rpc expire_nicepay_payment_holds");
  assert(order(fake.events, "start select store_settings") < expired && order(fake.events, "start select themes") < expired);
  assertEquals(fake.callsOf("select", "store_settings").length, 1, "businessName comes from the same settings read");
});

Deno.test("availability: settings/themes overlap expiry, slot counts and introductions are read after it, concurrently", async () => {
  const fake = await freshDb();
  await handleCustomer(customerRequest(`/availability?date=${dates().d0}&theme=A`));
  const e = fake.events, expired = order(e, "end rpc expire_nicepay_payment_holds");
  assert(order(e, "start select store_settings") < expired && order(e, "start select themes") < expired);
  const slots = order(e, "start select availability"), intros = order(e, "start select reservations");
  assert(slots > expired && intros > expired, "counts must reflect finished expiry");
  assert(intros < order(e, "end select availability"), "introductions run alongside the slot read");
  await fake.idle();
});

Deno.test("availability reads slots first and inserts only the missing ones", async () => {
  const fake = await freshDb();
  await handleCustomer(customerRequest(`/availability?date=${dates().d0}&theme=A`));
  const upserts = fake.callsOf("upsert", "availability");
  assertEquals(upserts.length, 1);
  assertEquals(upserts[0].body, [{ theme_id: "A", play_date: dates().d0, start_time: "13:20", capacity: 8 }]);
  assertEquals(upserts[0].params.get("on_conflict"), "theme_id,play_date,start_time");
  assert(upserts[0].prefer.includes("resolution=ignore-duplicates"));
  assertEquals(fake.callsOf("select", "availability").length, 2, "read, insert missing, re-read");
  await handleCustomer(customerRequest(`/availability?date=${dates().d0}&theme=A`));
  assertEquals([fake.callsOf("upsert", "availability").length, fake.callsOf("select", "availability").length], [1, 3], "existing slots cost one read");
  await fake.idle();
});

Deno.test("availability without customer enrichment (api) adds no introductions query", async () => {
  const fake = await freshDb();
  const { handleApi } = await import("../api/router.ts");
  const res = await handleApi(new Request(`http://fake-project.supabase.test/functions/v1/api/availability?date=${dates().d0}`));
  const body = await res.json();
  assert(body.themes.every((t: any) => t.times.every((s: any) => !("openRoomIntroductions" in s))));
  assertEquals(fake.callsOf("select", "reservations").length, 0);
  await fake.idle();
});

Deno.test("availability keeps its 400 for a bad date even when the early themes read fails (no unhandled rejection)", async () => {
  const fake = await freshDb();
  fake.fail = (call) => call.target === "themes" ? new PgError(500, { code: "XX000", message: "down", details: null, hint: null }) : null;
  const res = await handleCustomer(customerRequest(`/availability?date=${dates().past}`));
  assertEquals([res.status, await res.json()], [400, { error: "오늘부터 15일 이내의 날짜를 선택해 주세요." }]);
  await fake.idle();
  const failed = await handleCustomer(customerRequest(`/availability?date=${dates().d0}`));
  assertEquals(failed.status, 503);
  await failed.body?.cancel();
  await fake.idle();
});
