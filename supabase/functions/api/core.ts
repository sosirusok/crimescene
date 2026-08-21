import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
export const RELEASED = ["CANCELED", "NO_SHOW"];

const ORIGINS = new Set([
  "https://sosirusok.github.io",
  "https://www.crimesceneplay.com",
  "https://crimesceneplay.com",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

export function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://sosirusok.github.io",
    "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function reply(req: Request, value: unknown, status = 200) {
  return Response.json(value, { status, headers: { ...cors(req), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function readBody(req: Request): Promise<any> {
  try { return await req.json(); } catch { return {}; }
}

export function phone(value: unknown) { return String(value ?? "").replace(/\D/g, ""); }
export function mask(value: string) { return value.length === 11 ? `${value.slice(0, 3)}-****-${value.slice(-4)}` : `***-****-${value.slice(-4)}`; }
export function hhmm(value: unknown) { return String(value ?? "").slice(0, 5); }
export function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function addDays(value: string, amount: number) { const d = new Date(`${value}T00:00:00+09:00`); d.setDate(d.getDate() + amount); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); }
export function reservableDate(value: string, windowDays: number) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= today() && value <= addDays(today(), Math.max(0, windowDays - 1)); }

export async function sha(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function b64(bytes: Uint8Array) {
  let out = ""; for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function unb64(value: string) {
  const s = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function cryptoKey(context: string, uses: KeyUsage[], algorithm: "AES-GCM" | "HMAC") {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${context}:${SERVICE}`));
  return algorithm === "AES-GCM"
    ? crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, uses)
    : crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, uses);
}
export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey("crimescene-pii-v1", ["encrypt"], "AES-GCM"), new TextEncoder().encode(value)));
  const packed = new Uint8Array(iv.length + encrypted.length); packed.set(iv); packed.set(encrypted, iv.length); return b64(packed);
}
export async function decrypt(value: string | null) {
  if (!value) return null;
  try {
    const packed = unb64(value);
    const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(0, 12) }, await cryptoKey("crimescene-pii-v1", ["decrypt"], "AES-GCM"), packed.slice(12));
    return new TextDecoder().decode(clear);
  } catch { return null; }
}
export async function accessHash(value: string) {
  const sig = await crypto.subtle.sign("HMAC", await cryptoKey("crimescene-admin-access-v2", ["sign"], "HMAC"), new TextEncoder().encode(value));
  return [...new Uint8Array(sig)].map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function signSession(data: Record<string, unknown>) {
  const payload = b64(new TextEncoder().encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign("HMAC", await cryptoKey("crimescene-admin-session-v1", ["sign"], "HMAC"), new TextEncoder().encode(payload));
  return `${payload}.${b64(new Uint8Array(sig))}`;
}
export async function verifyAdmin(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [payload, signature] = token.split("."); if (!payload || !signature) return null;
  try {
    const valid = await crypto.subtle.verify("HMAC", await cryptoKey("crimescene-admin-session-v1", ["verify"], "HMAC"), unb64(signature), new TextEncoder().encode(payload));
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(unb64(payload)));
    if (!session.email || session.exp <= Math.floor(Date.now() / 1000)) return null;
    const { data } = await db.from("admins").select("email,active,role,display_name").eq("email", session.email).maybeSingle();
    return data?.active ? { ...session, role: data.role, displayName: data.display_name } : null;
  } catch { return null; }
}

export async function limited(req: Request, route: string, seconds: number, limit: number) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("cf-connecting-ip") ?? "unknown";
  const { data, error } = await db.rpc("consume_rate_limit", { p_bucket_key: await sha(`${route}:${ip}`), p_window_seconds: seconds, p_limit: limit });
  return !error && data === true;
}

export function routePath(url: URL) {
  const mark = "/functions/v1/api", i = url.pathname.indexOf(mark);
  return i >= 0 ? (url.pathname.slice(i + mark.length) || "/") : (url.pathname.replace(/^\/api/, "") || "/");
}

export function room(slot: any, min = 4) {
  const count = Number(slot?.booked_count ?? 0), capacity = Number(slot?.capacity ?? 0), open = Boolean(slot?.open_room), status = slot?.status ?? "OPEN";
  let state = "AVAILABLE";
  if (status === "BLOCKED") state = "BLOCKED";
  else if (count <= 0) state = "AVAILABLE";
  else if (!open) state = "PRIVATE_BOOKED";
  else if (count >= capacity) state = "FULL";
  else if (count < min) state = "OPEN_RECRUITING";
  else state = "OPEN_PLAYABLE";
  return { state, bookedCount: count, capacity, remaining: Math.max(0, capacity - count), openRoom: open, canJoin: status === "OPEN" && open && count < capacity, minimumPlayers: min };
}

export async function themeRows(activeOnly = false) {
  let q = db.from("themes").select("id,slug,episode,title,short_title,tagline,synopsis,difficulty,players,price,duration_minutes,image_path,times,accent,status,min_players,suspect_capacity,detective_capacity,total_capacity,sort_order");
  if (activeOnly) q = q.eq("status", "ACTIVE");
  const { data, error } = await q.order("sort_order").order("id"); if (error) throw error; return data ?? [];
}
export function publicTheme(t: any) {
  return { id: t.id, slug: t.slug, episode: t.episode, title: t.title, shortTitle: t.short_title, tagline: t.tagline, synopsis: t.synopsis, difficulty: t.difficulty, players: t.players, price: t.price, duration: t.duration_minutes, image: t.image_path, times: t.times, accent: t.accent, status: t.status, minPlayers: t.min_players, suspectCapacity: t.suspect_capacity, detectiveCapacity: t.detective_capacity, totalCapacity: t.total_capacity };
}

export async function settingsRow() {
  const { data, error } = await db.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data ?? {
    id: 1, store_name: "크라임씬플레이", branch_name: "서면1호점", representative_name: "윤호권",
    business_registration_number: "839-87-00850", mail_order_registration_number: "", phone: "070-4304-4340",
    email: "dbsehrud93@naver.com", address_road: "부산광역시 부산진구 신천대로50번길 62", address_detail: "부전동 우성빌딩 4층",
    map_query: "부산광역시 부산진구 신천대로50번길 62", booking_window_days: 15, arrival_minutes: 10,
    cancellation_cutoff_hours: 24, payment_mode: "ONSITE", payment_provider: "NICEPAY", privacy_officer_name: "개인정보 보호 담당자",
    privacy_officer_contact: "dbsehrud93@naver.com / 070-4304-4340", refund_policy_confirmed: false, customer_notice: "",
  };
}
export function publicSettings(s: any) {
  return {
    storeName: s.store_name, branchName: s.branch_name, representativeName: s.representative_name,
    businessRegistrationNumber: s.business_registration_number, mailOrderRegistrationNumber: s.mail_order_registration_number,
    phone: s.phone, email: s.email, addressRoad: s.address_road, addressDetail: s.address_detail, mapQuery: s.map_query,
    bookingWindowDays: s.booking_window_days, arrivalMinutes: s.arrival_minutes, cancellationCutoffHours: s.cancellation_cutoff_hours,
    paymentMode: s.payment_mode, paymentProvider: s.payment_provider, privacyOfficerName: s.privacy_officer_name,
    privacyOfficerContact: s.privacy_officer_contact, refundPolicyConfirmed: s.refund_policy_confirmed, customerNotice: s.customer_notice,
    updatedAt: s.updated_at,
  };
}

export function paymentState(settings: any) {
  const clientId = Deno.env.get("NICEPAY_CLIENT_ID")?.trim() ?? "";
  const secretKey = Deno.env.get("NICEPAY_SECRET_KEY")?.trim() ?? "";
  const environment = Deno.env.get("NICEPAY_ENVIRONMENT")?.trim().toLowerCase() ?? "";
  const missing: string[] = [];
  if (!clientId) missing.push("NICEPAY_CLIENT_ID");
  if (!secretKey) missing.push("NICEPAY_SECRET_KEY");
  if (!['sandbox', 'production'].includes(environment)) missing.push("NICEPAY_ENVIRONMENT");
  const configured = missing.length === 0;
  const legalReady = Boolean(settings.mail_order_registration_number && settings.refund_policy_confirmed);
  const integrationReady = true;
  const onlineEnabled = settings.payment_mode === "ONLINE" && configured && legalReady && integrationReady;
  return {
    mode: settings.payment_mode,
    provider: "NICEPAY",
    configured,
    legalReady,
    integrationReady,
    onlineEnabled,
    missing: configured ? [] : missing,
    label: settings.payment_mode === "ONLINE" ? "온라인 카드 결제" : "매장 결제",
    checkout: onlineEnabled ? {
      clientId,
      method: "card",
      sdkUrl: "https://pay.nicepay.co.kr/v1/js/",
      returnUrl: `${SUPABASE_URL}/functions/v1/api/payments/nicepay/return`,
      environment,
    } : null,
  };
}
