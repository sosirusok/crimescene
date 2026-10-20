// Shared test fixtures: the injected Supabase client, seed data, RPC emulations and request helpers.
import { FAKE_URL, harness } from "./_env.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { addDays, setDb, sha, today } from "../api/core.ts";
import { FakeDb, pgTime, raise, type Row, type Rpc, type Tables, uniqueViolation } from "./fake_postgrest.ts";

export { FAKE_URL, harness };
export const KOREAN_ORIGIN = "https://www.xn--oi2bkkl05a1gchcr33e50h.com";
export const CLIENT_IP = "203.0.113.7";
export const PHONE = "01012345678";

// One client for the whole run (supabase-js starts async auth work on creation); its fetch follows the current FakeDb.
const testClient = createClient(FAKE_URL, "test-service-role-key", {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => harness.db ? harness.db.handle(new Request(input, init)) : Promise.reject(new Error("No FakeDb installed")) },
});

// Installs `fake` for the code under test via the injectable db (core.setDb) and for any module-level client via fetch.
export function useDb(fake: FakeDb) { harness.db = fake; setDb(testClient); return fake; }

const RELEASED = ["CANCELED", "NO_SHOW"];
function refreshSlot(db: FakeDb, themeId: string, date: string, time: string) {
  const slot = (db.tables.availability ?? []).find((s) => s.theme_id === themeId && s.play_date === date && s.start_time === pgTime(time)); if (!slot) return;
  const active = (db.tables.reservations ?? []).filter((r) => r.theme_id === themeId && r.play_date === date && r.start_time === pgTime(time) && !RELEASED.includes(r.status));
  slot.booked_count = active.reduce((sum, r) => sum + Number(r.party_size), 0);
  slot.open_room = active.some((r) => r.open_room);
  if (slot.status !== "BLOCKED") slot.status = !active.length ? "OPEN" : !slot.open_room || slot.booked_count >= slot.capacity ? "SOLD_OUT" : "OPEN";
}

// JS port of public.reserve_crimescene_slot (migration 20260821075707): validates everything first, then commits.
export const reserveSlot: Rpc = (a, db) => {
  const theme = (db.tables.themes ?? []).find((t) => t.id === String(a.p_theme_id).trim().toUpperCase() && t.status === "ACTIVE");
  if (!theme) throw raise("theme_not_found");
  const time = pgTime(a.p_start_time), size = Number(a.p_party_size), open = a.p_open_room === true;
  if (!(theme.times ?? []).includes(time.slice(0, 5))) throw raise("invalid_theme_time");
  if (size < 1 || size > theme.total_capacity) throw raise("invalid_party_size");
  if (a.p_total_amount !== theme.price * size) throw raise("invalid_total_amount");
  const mode = (db.tables.store_settings ?? []).find((s) => s.id === 1)?.payment_mode ?? "ONSITE";
  const slot = (db.tables.availability ?? []).find((s) => s.theme_id === theme.id && s.play_date === a.p_play_date && s.start_time === time);
  const next: Row = slot ? { ...slot } : { id: crypto.randomUUID(), theme_id: theme.id, play_date: a.p_play_date, start_time: time, capacity: theme.total_capacity, booked_count: 0, open_room: false, status: "OPEN" };
  if (next.status === "BLOCKED") throw raise("slot_unavailable");
  let bookingMode: string;
  if (next.booked_count === 0) { if (size < theme.min_players && !open) throw raise("open_room_required"); bookingMode = open ? "OPEN_HOST" : "PRIVATE"; }
  else { if (!next.open_room || !open) throw raise("slot_unavailable"); bookingMode = "OPEN_JOIN"; }
  if (bookingMode !== "PRIVATE" && String(a.p_special_request ?? "").trim().length < 2) throw raise("open_room_message_required");
  const count = next.booked_count + size; if (count > theme.total_capacity) throw raise("slot_capacity_insufficient");
  if ((db.tables.reservations ?? []).some((r) => r.id === a.p_reservation_id)) throw uniqueViolation("reservations_pkey", `Key (id)=(${a.p_reservation_id}) already exists.`);
  Object.assign(next, { booked_count: count, capacity: theme.total_capacity, open_room: bookingMode !== "PRIVATE", status: bookingMode === "PRIVATE" || count >= theme.total_capacity ? "SOLD_OUT" : "OPEN" });
  if (slot) Object.assign(slot, next); else db.insertRow("availability", next);
  const reservation = db.insertRow("reservations", { id: a.p_reservation_id, lookup_code: String(a.p_lookup_code).trim().toUpperCase(), theme_id: theme.id, play_date: a.p_play_date, start_time: time, customer_name: String(a.p_customer_name).trim(), phone_hash: a.p_phone_hash, phone_masked: a.p_phone_masked, phone_encrypted: a.p_phone_encrypted, party_size: size, open_room: bookingMode !== "PRIVATE", booking_mode: bookingMode, special_request: String(a.p_special_request ?? "").slice(0, 300), total_amount: a.p_total_amount, status: mode === "ONLINE" ? "PENDING_PAYMENT" : "CONFIRMED", payment_status: "READY", source: "ONLINE", created_at: new Date().toISOString() });
  db.insertRow("payments", { id: crypto.randomUUID(), reservation_id: a.p_reservation_id, amount: a.p_total_amount, provider: mode === "ONLINE" ? "NICEPAY" : "ONSITE", status: "READY" });
  return structuredClone(reservation);
};

export function crimesceneRpcs(): Record<string, Rpc> {
  return {
    consume_rate_limit: (a, db) => { db.rateLimitKeys.push(String(a.p_bucket_key)); return true; },
    // Releases expired NICEPAY holds like public.expire_nicepay_payment_holds (cancel + refresh the slot count).
    expire_nicepay_payment_holds: (_a, db) => {
      let count = 0;
      for (const payment of db.tables.payments ?? []) {
        if (payment.provider !== "NICEPAY" || payment.status !== "READY" || !(String(payment.expires_at) <= new Date().toISOString())) continue;
        Object.assign(payment, { status: "FAILED", failure_code: "HOLD_EXPIRED", failure_message: "결제 가능 시간이 만료되었습니다." });
        const r = (db.tables.reservations ?? []).find((x) => x.id === payment.reservation_id);
        if (r?.status === "PENDING_PAYMENT") { Object.assign(r, { status: "CANCELED", payment_status: "FAILED" }); refreshSlot(db, r.theme_id, r.play_date, r.start_time); }
        count++;
      }
      return count;
    },
    reserve_crimescene_slot: reserveSlot,
  };
}

export const dates = () => ({ d0: today(), d1: addDays(today(), 1), past: addDays(today(), -3), beyond: addDays(today(), 15) });

const theme = (id: string, sort: number, extra: Row) => ({
  id, slug: `theme-${id.toLowerCase()}`, episode: sort, title: `크라임씬 EP.${sort} 사건 ${id}`, short_title: `사건 ${id}`, tagline: `태그라인 ${id}`, synopsis: `줄거리 ${id}`,
  difficulty: "", players: "용의자 4명 + 탐정 최대 4명", price: 23000, duration_minutes: 90, image_path: `/images/theme-${id.toLowerCase()}.webp`, accent: "#c84b42",
  status: "ACTIVE", min_players: 4, suspect_capacity: 4, detective_capacity: 4, total_capacity: 8, sort_order: sort, ...extra,
});

export const settingsRowSeed = (extra: Row = {}) => ({
  id: 1, store_name: "크라임씬플레이", branch_name: "서면1호점", representative_name: "정지훈", business_registration_number: "744-88-01446",
  mail_order_registration_number: "", phone: "070-4304-4340", email: "jjhun65@hanmail.net", address_road: "부산광역시 부산진구 신천대로50번길 62",
  address_detail: "부전동 우성빌딩 4층", map_query: "부산광역시 부산진구 신천대로50번길 62", booking_window_days: 15, arrival_minutes: 10,
  cancellation_cutoff_hours: 24, payment_mode: "ONSITE", payment_provider: "NICEPAY", privacy_officer_name: "정지훈",
  privacy_officer_contact: "jjhun65@hanmail.net / 070-4304-4340", refund_policy_confirmed: false, customer_notice: "공지 문구",
  business_name: "(주)싱글테스트", updated_at: "2026-08-21T08:08:54.343382+00:00", ...extra,
});

// Data that exercises every branch of bootstrap/availability/lookup: an expired NICEPAY hold that expiry releases,
// existing and missing slots, an orphan slot, a blocked slot, inactive and empty themes, a non-normalized time,
// open-room introductions with contact details and mixed statuses, and lookups with and without slots/payments.
export async function seedTables(): Promise<Tables> {
  const { d0, d1, past } = dates(), mine = await sha(PHONE), other = await sha("01099998888");
  const res = (id: string, extra: Row) => ({ id, lookup_code: `CS-TEST-${id.slice(0, 4).toUpperCase()}`, theme_id: "A", play_date: d0, start_time: "10:00", customer_name: "홍길동", phone_hash: other, phone_masked: "010-****-8888", phone_encrypted: "enc", party_size: 2, open_room: true, booking_mode: "OPEN_JOIN", special_request: "", total_amount: 46000, status: "CONFIRMED", payment_status: "READY", source: "ONLINE", ...extra });
  return {
    store_settings: [settingsRowSeed()],
    themes: [
      theme("A", 2, { times: ["10:00", "11:30", "13:20"] }),
      theme("B", 1, { times: ["10:00", "12:00"], min_players: 2, total_capacity: 6, price: 20000 }),
      theme("C", 3, { times: ["10:00"], status: "INACTIVE" }),
      theme("D", 4, { times: [] }),
      theme("E", 2, { times: ["9:00"], min_players: 3, total_capacity: 6 }),
    ],
    availability: [
      { id: 1, theme_id: "A", play_date: d0, start_time: "10:00", capacity: 8, booked_count: 8, open_room: true, status: "SOLD_OUT" },
      { id: 2, theme_id: "A", play_date: d0, start_time: "11:30", capacity: 8, booked_count: 8, open_room: true, status: "SOLD_OUT" },
      { id: 3, theme_id: "A", play_date: d0, start_time: "09:00", capacity: 8, booked_count: 0, open_room: false, status: "OPEN" },
      { id: 4, theme_id: "B", play_date: d0, start_time: "10:00", capacity: 6, booked_count: 0, open_room: false, status: "BLOCKED" },
      { id: 5, theme_id: "C", play_date: d0, start_time: "10:00", capacity: 8, booked_count: 2, open_room: true, status: "OPEN" },
      { id: 6, theme_id: "E", play_date: d0, start_time: "09:00", capacity: 6, booked_count: 0, open_room: false, status: "OPEN" },
      { id: 7, theme_id: "B", play_date: d1, start_time: "12:00", capacity: 6, booked_count: 4, open_room: false, status: "SOLD_OUT" },
    ],
    reservations: [
      res("a0000000-0000-4000-8000-000000000001", { customer_name: "김민수", phone_hash: mine, phone_masked: "010-****-5678", party_size: 3, booking_mode: "OPEN_HOST", special_request: "같이 해요  010-1234-5678 로\n연락 주세요", total_amount: 69000, created_at: "2026-10-01T01:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000002", { customer_name: "이서연", status: "PENDING_PAYMENT", special_request: "결제 대기 팀", created_at: "2026-10-01T02:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000003", { customer_name: "박지훈", party_size: 1, status: "COMPLETED", special_request: "메일은 abc.def@Example.com 으로", total_amount: 23000, created_at: "2026-10-01T00:30:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000004", { start_time: "11:30", status: "CANCELED", special_request: "취소한 팀", created_at: "2026-10-01T03:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000005", { start_time: "11:30", status: "CANCEL_REQUESTED", special_request: "   ", created_at: "2026-10-01T04:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000006", { start_time: "11:30", party_size: 6, special_request: `${"긴 소개 ".repeat(40)}끝`, total_amount: 138000, created_at: "2026-10-01T05:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000007", { theme_id: "C", special_request: "비활성 테마 팀", created_at: "2026-10-01T06:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000008", { theme_id: "B", play_date: d1, start_time: "12:00", customer_name: "김민수", phone_hash: mine, phone_masked: "010-****-5678", party_size: 4, open_room: false, booking_mode: "PRIVATE", total_amount: 80000, created_at: "2026-10-02T03:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000009", { theme_id: "C", play_date: past, customer_name: "김민수", phone_hash: mine, phone_masked: "010-****-5678", open_room: false, booking_mode: "PRIVATE", status: "COMPLETED", payment_status: "PAID", created_at: "2026-09-20T03:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000010", { customer_name: "김민수", phone_hash: other, created_at: "2026-10-03T03:00:00+00:00" }),
      res("a0000000-0000-4000-8000-000000000011", { start_time: "13:20", play_date: d1, customer_name: "김민수", phone_hash: mine, phone_masked: "010-****-5678", status: "CANCELED", special_request: "취소", created_at: "2026-10-04T03:00:00+00:00" }),
    ],
    payments: [
      { id: "p1", reservation_id: "a0000000-0000-4000-8000-000000000001", provider: "ONSITE", status: "READY", amount: 69000, receipt_url: null, failure_message: null },
      { id: "p2", reservation_id: "a0000000-0000-4000-8000-000000000002", provider: "NICEPAY", status: "READY", amount: 46000, expires_at: "2020-01-01T00:00:00.000Z", provider_order_id: "CSORDER2", receipt_url: null, failure_message: null },
      { id: "p8", reservation_id: "a0000000-0000-4000-8000-000000000008", provider: "ONSITE", status: "READY", amount: 80000, receipt_url: null, failure_message: null },
      { id: "p9", reservation_id: "a0000000-0000-4000-8000-000000000009", provider: "NICEPAY", status: "PAID", amount: 46000, receipt_url: "https://receipt.example/9", failure_message: null },
    ],
    notices: [
      { id: 1, title: "고정 공지", content: "내용 1", pinned: true, published: true, created_at: "2026-09-01T00:00:00+00:00", updated_at: "2026-09-01T00:00:00+00:00" },
      { id: 2, title: "일반 공지", content: "내용 2", pinned: false, published: true, created_at: "2026-09-05T00:00:00+00:00", updated_at: "2026-09-05T00:00:00+00:00" },
      { id: 3, title: "비공개", content: "내용 3", pinned: false, published: false, created_at: "2026-09-06T00:00:00+00:00", updated_at: "2026-09-06T00:00:00+00:00" },
    ],
    audit_logs: [],
  };
}

export async function freshDb(options: { tables?: Tables; latency?: Partial<FakeDb["latency"]> } = {}) {
  return useDb(new FakeDb(options.tables ?? await seedTables(), { rpcs: crimesceneRpcs(), latency: options.latency }));
}

type Init = { method?: string; json?: unknown; headers?: Record<string, string> };
function build(base: string, path: string, init: Init = {}) {
  const headers = new Headers({ origin: KOREAN_ORIGIN, "x-forwarded-for": CLIENT_IP, ...init.headers });
  const body = init.json === undefined ? undefined : JSON.stringify(init.json);
  if (body) headers.set("content-type", "application/json");
  return new Request(`${FAKE_URL}${base}${path}`, { method: init.method ?? (body ? "POST" : "GET"), headers, body });
}
export const customerRequest = (path: string, init?: Init) => build("/functions/v1/customer-api", path, init);
export const apiRequest = (path: string, init?: Init) => build("/functions/v1/api", path, init);

const HEADERS = ["content-type", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "access-control-max-age", "vary", "cache-control", "x-content-type-options"];
export async function capture(response: Response) {
  return { status: response.status, headers: Object.fromEntries(HEADERS.map((name) => [name, response.headers.get(name)])), text: await response.text() };
}

export const reservationBody = (extra: Record<string, unknown> = {}) => ({
  themeId: "a", playDate: dates().d1, startTime: "11:30", customerName: "최하늘", phone: "010-5555-6666", partySize: 4, openRoom: false,
  specialRequest: "", privacyConsent: true, cancellationConsent: true, ...extra,
});
