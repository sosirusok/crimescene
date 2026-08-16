import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const allowedOrigins = new Set([
  "https://sosirusok.github.io",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

type Json = Record<string, unknown>;
type AdminSession = { email: string; role: string; exp: number };

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://sosirusok.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store" },
  });
}

function normalizePhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function maskPhone(phone: string) {
  return phone.length === 11
    ? `${phone.slice(0, 3)}-****-${phone.slice(-4)}`
    : `***-****-${phone.slice(-4)}`;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveKey(context: string, usages: KeyUsage[], algorithm: "AES-GCM" | "HMAC") {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${context}:${SERVICE_ROLE_KEY}`),
  );
  if (algorithm === "AES-GCM") {
    return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, usages);
  }
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, usages);
}

async function encryptPhone(phone: string) {
  const key = await deriveKey("crimescene-pii-v1", ["encrypt"], "AES-GCM");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(phone),
  ));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, iv.length);
  return toBase64Url(packed);
}

async function decryptPhone(value: string | null) {
  if (!value) return null;
  try {
    const packed = fromBase64Url(value);
    const key = await deriveKey("crimescene-pii-v1", ["decrypt"], "AES-GCM");
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: packed.slice(0, 12) },
      key,
      packed.slice(12),
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}

async function signAdminSession(session: AdminSession) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(session)));
  const key = await deriveKey("crimescene-admin-session-v1", ["sign"], "HMAC");
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `${payload}.${toBase64Url(signature)}`;
}

async function verifyAdminSession(request: Request): Promise<AdminSession | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  try {
    const key = await deriveKey("crimescene-admin-session-v1", ["verify"], "HMAC");
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as AdminSession;
    if (!session.email || !session.role || session.exp <= Math.floor(Date.now() / 1000)) return null;
    const { data } = await db.from("admins").select("email, role, active").eq("email", session.email).maybeSingle();
    return data?.active ? session : null;
  } catch {
    return null;
  }
}

async function body(request: Request): Promise<Json> {
  try {
    return await request.json() as Json;
  } catch {
    return {};
  }
}

function koreaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isReservableDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const today = koreaToday();
  const last = new Date(`${today}T00:00:00Z`);
  last.setUTCDate(last.getUTCDate() + 13);
  return value >= today && value <= last.toISOString().slice(0, 10);
}

async function rateLimit(request: Request, route: string, seconds: number, limit: number) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("cf-connecting-ip")
    ?? "unknown";
  const key = await sha256(`${route}:${ip}`);
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_bucket_key: key,
    p_window_seconds: seconds,
    p_limit: limit,
  });
  return !error && data === true;
}

function routePath(url: URL) {
  const marker = "/functions/v1/api";
  const index = url.pathname.indexOf(marker);
  if (index >= 0) return url.pathname.slice(index + marker.length) || "/";
  return url.pathname.replace(/^\/api/, "") || "/";
}

async function handleAvailability(request: Request, url: URL) {
  const date = url.searchParams.get("date") ?? "";
  const themeId = url.searchParams.get("theme")?.toUpperCase() ?? "";
  if (!isReservableDate(date)) return json(request, { error: "오늘부터 14일 이내의 날짜를 선택해 주세요." }, 400);

  let query = db.from("themes").select("id,title,short_title,image_path,times").eq("status", "ACTIVE");
  if (themeId) query = query.eq("id", themeId);
  const { data: themes, error: themesError } = await query.order("id");
  if (themesError) throw themesError;
  if (!themes?.length) return json(request, { error: "존재하지 않는 테마입니다." }, 404);

  const slots = themes.flatMap((theme) => (theme.times as string[]).map((time) => ({
    theme_id: theme.id,
    play_date: date,
    start_time: time,
    capacity: 5,
  })));
  const { error: insertError } = await db.from("availability").upsert(slots, {
    onConflict: "theme_id,play_date,start_time",
    ignoreDuplicates: true,
  });
  if (insertError) throw insertError;

  const { data: rows, error } = await db.from("availability")
    .select("theme_id,start_time,capacity,booked_count,open_room,status")
    .eq("play_date", date)
    .in("theme_id", themes.map((theme) => theme.id))
    .order("theme_id")
    .order("start_time");
  if (error) throw error;

  return json(request, {
    date,
    themes: themes.map((theme) => ({
      id: theme.id,
      title: theme.title,
      shortTitle: theme.short_title,
      image: theme.image_path,
      times: (rows ?? []).filter((row) => row.theme_id === theme.id).map((row) => ({
        time: String(row.start_time).slice(0, 5),
        status: row.status,
        capacity: row.capacity,
        bookedCount: row.booked_count,
        remaining: Math.max(0, row.capacity - row.booked_count),
        openRoom: row.open_room,
      })),
    })),
  });
}

async function handleReservationCreate(request: Request) {
  if (!await rateLimit(request, "reservation-create", 600, 10)) {
    return json(request, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  }
  const input = await body(request);
  const themeId = String(input.themeId ?? "").toUpperCase();
  const playDate = String(input.playDate ?? "");
  const startTime = String(input.startTime ?? "").slice(0, 5);
  const customerName = String(input.customerName ?? "").trim();
  const phone = normalizePhone(input.phone);
  const partySize = Number(input.partySize);
  const openRoom = input.openRoom === true;
  if (!isReservableDate(playDate)) return json(request, { error: "예약 가능한 날짜를 확인해 주세요." }, 400);
  if (customerName.length < 2 || customerName.length > 20) return json(request, { error: "예약자 이름을 확인해 주세요." }, 400);
  if (!/^01\d{8,9}$/.test(phone)) return json(request, { error: "휴대폰 번호를 확인해 주세요." }, 400);
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 5) return json(request, { error: "예약 인원은 1명부터 5명까지 선택할 수 있습니다." }, 400);
  if (partySize < 4 && !openRoom) return json(request, { error: "4명 미만 예약은 오픈룸을 선택해 주세요." }, 400);
  if (input.privacyConsent !== true || input.cancellationConsent !== true) return json(request, { error: "필수 동의 항목을 확인해 주세요." }, 400);

  const { data: theme, error: themeError } = await db.from("themes")
    .select("id,title,price,times,status")
    .eq("id", themeId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (themeError) throw themeError;
  if (!theme || !(theme.times as string[]).includes(startTime)) return json(request, { error: "선택한 테마와 회차를 확인해 주세요." }, 400);

  const reservationId = crypto.randomUUID();
  const lookupCode = `CS-${playDate.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const totalAmount = theme.price * partySize;
  const { data: reservation, error } = await db.rpc("reserve_crimescene_slot", {
    p_reservation_id: reservationId,
    p_lookup_code: lookupCode,
    p_theme_id: theme.id,
    p_play_date: playDate,
    p_start_time: startTime,
    p_customer_name: customerName,
    p_phone_hash: await sha256(phone),
    p_phone_masked: maskPhone(phone),
    p_phone_encrypted: await encryptPhone(phone),
    p_party_size: partySize,
    p_open_room: openRoom,
    p_special_request: String(input.specialRequest ?? "").trim().slice(0, 300),
    p_total_amount: totalAmount,
  });
  if (error) {
    if (error.message.includes("slot_unavailable")) return json(request, { error: "선택한 회차는 방금 마감되었거나 남은 인원이 부족합니다." }, 409);
    throw error;
  }
  return json(request, {
    reservation: {
      id: reservation.id,
      lookupCode,
      themeTitle: theme.title,
      playDate,
      startTime,
      partySize,
      totalAmount,
      status: "PENDING_PAYMENT",
      paymentStatus: "READY",
    },
    payment: { provider: "KISPG", enabled: false },
  }, 201);
}

async function handleReservationLookup(request: Request) {
  if (!await rateLimit(request, "reservation-lookup", 600, 20)) return json(request, { error: "잠시 후 다시 조회해 주세요." }, 429);
  const input = await body(request);
  const name = String(input.customerName ?? "").trim();
  const phone = normalizePhone(input.phone);
  const lookupCode = String(input.lookupCode ?? "").trim().toUpperCase();
  if (name.length < 2 || !/^01\d{8,9}$/.test(phone)) return json(request, { error: "예약자 이름과 휴대폰 번호를 확인해 주세요." }, 400);
  let query = db.from("reservations")
    .select("id,lookup_code,theme_id,play_date,start_time,customer_name,phone_masked,party_size,open_room,total_amount,status,payment_status,created_at,themes(title)")
    .eq("customer_name", name)
    .eq("phone_hash", await sha256(phone));
  if (lookupCode) query = query.eq("lookup_code", lookupCode);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return json(request, { reservations: (data ?? []).map((row: any) => ({
    id: row.id,
    lookupCode: row.lookup_code,
    themeId: row.theme_id,
    themeTitle: row.themes?.title ?? row.theme_id,
    playDate: row.play_date,
    startTime: String(row.start_time).slice(0, 5),
    customerName: row.customer_name,
    phoneMasked: row.phone_masked,
    partySize: row.party_size,
    openRoom: row.open_room,
    totalAmount: row.total_amount,
    status: row.status,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
  })) });
}

async function handleReservationCancel(request: Request) {
  if (!await rateLimit(request, "reservation-cancel", 600, 10)) return json(request, { error: "잠시 후 다시 시도해 주세요." }, 429);
  const input = await body(request);
  const code = String(input.lookupCode ?? "").trim().toUpperCase();
  const name = String(input.customerName ?? "").trim();
  const phone = normalizePhone(input.phone);
  if (!code || name.length < 2 || !/^01\d{8,9}$/.test(phone)) return json(request, { error: "예약 정보를 확인해 주세요." }, 400);
  const { data, error } = await db.rpc("cancel_crimescene_reservation", {
    p_lookup_code: code,
    p_customer_name: name,
    p_phone_hash: await sha256(phone),
    p_reason: String(input.reason ?? "고객 온라인 취소").slice(0, 200),
  });
  if (error) {
    if (error.message.includes("reservation_not_found")) return json(request, { error: "일치하는 예약이 없습니다." }, 404);
    if (error.message.includes("already_canceled")) return json(request, { error: "이미 취소된 예약입니다." }, 409);
    if (error.message.includes("within_24_hours")) return json(request, { error: "이용 24시간 전부터는 온라인 취소가 제한됩니다. 매장으로 문의해 주세요." }, 409);
    throw error;
  }
  const status = data?.[0]?.next_status ?? "CANCELED";
  return json(request, {
    status,
    message: status === "CANCEL_REQUESTED"
      ? "취소 요청이 접수되었습니다. 결제 취소 확인 후 최종 처리됩니다."
      : "예약이 취소되었습니다.",
  });
}

async function handleInquiry(request: Request) {
  if (!await rateLimit(request, "inquiry", 3600, 5)) return json(request, { error: "문의 접수 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." }, 429);
  const input = await body(request);
  const customerName = String(input.customerName ?? "").trim();
  const phone = normalizePhone(input.phone);
  const subject = String(input.subject ?? "").trim();
  const content = String(input.content ?? "").trim();
  if (customerName.length < 2 || !/^01\d{8,9}$/.test(phone) || subject.length < 2 || content.length < 10) return json(request, { error: "이름, 연락처, 제목, 문의 내용을 확인해 주세요." }, 400);
  if (input.privacyConsent !== true) return json(request, { error: "개인정보 수집 및 이용 동의가 필요합니다." }, 400);
  const id = crypto.randomUUID();
  const { error } = await db.from("inquiries").insert({
    id,
    customer_name: customerName,
    phone_hash: await sha256(phone),
    phone_masked: maskPhone(phone),
    phone_encrypted: await encryptPhone(phone),
    subject: subject.slice(0, 100),
    content: content.slice(0, 2000),
  });
  if (error) throw error;
  await db.from("audit_logs").insert({ actor: "customer", action: "INQUIRY_CREATED", target_type: "inquiry", target_id: id });
  return json(request, { id, message: "문의가 접수되었습니다. 확인 후 입력하신 연락처로 안내드립니다." }, 201);
}

async function handleAdminLogin(request: Request) {
  if (!await rateLimit(request, "admin-login", 900, 5)) return json(request, { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." }, 429);
  const input = await body(request);
  const email = String(input.email ?? "").trim().toLowerCase();
  const password = String(input.password ?? "");
  const { data } = await db.from("admins").select("email,display_name,role,active,password_hash").eq("email", email).maybeSingle();
  if (!data?.active || !data.password_hash || await sha256(password) !== data.password_hash) {
    return json(request, { error: "관리자 계정 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  const session: AdminSession = { email: data.email, role: data.role, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 };
  return json(request, { token: await signAdminSession(session), user: { email: data.email, displayName: data.display_name, role: data.role }, expiresIn: 28800 });
}

async function handleAdminDashboard(request: Request) {
  const [reservationsResult, inquiriesResult, totalResult, activeResult, todayResult, revenueResult] = await Promise.all([
    db.from("reservations").select("id,lookup_code,theme_id,play_date,start_time,customer_name,phone_masked,phone_encrypted,party_size,open_room,total_amount,status,payment_status,created_at,themes(short_title)").order("play_date", { ascending: false }).order("start_time", { ascending: false }).limit(100),
    db.from("inquiries").select("id,customer_name,phone_masked,phone_encrypted,subject,content,status,response,created_at").order("created_at", { ascending: false }).limit(50),
    db.from("reservations").select("id", { count: "exact", head: true }),
    db.from("reservations").select("id", { count: "exact", head: true }).not("status", "in", "(CANCELED,CANCEL_REQUESTED)"),
    db.from("reservations").select("id", { count: "exact", head: true }).eq("play_date", koreaToday()),
    db.from("reservations").select("total_amount").eq("payment_status", "PAID"),
  ]);
  const error = reservationsResult.error ?? inquiriesResult.error ?? totalResult.error ?? activeResult.error ?? todayResult.error ?? revenueResult.error;
  if (error) throw error;
  const reservations = await Promise.all((reservationsResult.data ?? []).map(async (row: any) => ({
    ...row,
    phone: await decryptPhone(row.phone_encrypted) ?? row.phone_masked,
    phone_encrypted: undefined,
    start_time: String(row.start_time).slice(0, 5),
    theme_title: row.themes?.short_title ?? row.theme_id,
    themes: undefined,
  })));
  const inquiries = await Promise.all((inquiriesResult.data ?? []).map(async (row: any) => ({
    ...row,
    phone: await decryptPhone(row.phone_encrypted) ?? row.phone_masked,
    phone_encrypted: undefined,
  })));
  return json(request, {
    metrics: {
      total: totalResult.count ?? 0,
      active: activeResult.count ?? 0,
      today: todayResult.count ?? 0,
      revenue: (revenueResult.data ?? []).reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
    },
    reservations,
    inquiries,
  });
}

async function handleAdmin(request: Request, path: string, session: AdminSession) {
  if (path === "/admin/dashboard" && request.method === "GET") return handleAdminDashboard(request);
  const input = await body(request);
  if (path === "/admin/reservations" && request.method === "PATCH") {
    const { error } = await db.rpc("admin_update_reservation", {
      p_actor: session.email,
      p_reservation_id: String(input.id ?? ""),
      p_status: String(input.status ?? ""),
      p_payment_status: String(input.paymentStatus ?? ""),
    });
    if (error?.message.includes("reservation_not_found")) return json(request, { error: "예약을 찾을 수 없습니다." }, 404);
    if (error?.message.includes("slot_capacity_insufficient")) return json(request, { error: "해당 회차에 예약을 복원할 좌석이 부족합니다." }, 409);
    if (error) throw error;
    return json(request, { ok: true });
  }
  if (path === "/admin/inquiries" && request.method === "PATCH") {
    const status = String(input.status ?? "");
    if (!["NEW", "IN_PROGRESS", "ANSWERED", "CLOSED"].includes(status)) return json(request, { error: "문의 상태를 확인해 주세요." }, 400);
    const { data, error } = await db.from("inquiries").update({ status, response: String(input.response ?? "").trim().slice(0, 2000) }).eq("id", String(input.id ?? "")).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return json(request, { error: "문의를 찾을 수 없습니다." }, 404);
    await db.from("audit_logs").insert({ actor: session.email, action: "ADMIN_INQUIRY_UPDATED", target_type: "inquiry", target_id: data.id, metadata: { status } });
    return json(request, { ok: true });
  }
  if (path === "/admin/availability" && request.method === "PATCH") {
    const themeId = String(input.themeId ?? "").toUpperCase();
    const playDate = String(input.playDate ?? "");
    const startTime = String(input.startTime ?? "").slice(0, 5);
    const status = String(input.status ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate) || !["OPEN", "BLOCKED"].includes(status)) return json(request, { error: "회차 정보를 확인해 주세요." }, 400);
    const { data: theme } = await db.from("themes").select("id,times").eq("id", themeId).maybeSingle();
    if (!theme || !(theme.times as string[]).includes(startTime)) return json(request, { error: "테마와 회차 정보를 확인해 주세요." }, 400);
    const { error } = await db.from("availability").upsert({ theme_id: themeId, play_date: playDate, start_time: startTime, capacity: 5, status }, { onConflict: "theme_id,play_date,start_time" });
    if (error) throw error;
    await db.from("audit_logs").insert({ actor: session.email, action: "ADMIN_SLOT_UPDATED", target_type: "availability", target_id: `${themeId}:${playDate}:${startTime}`, metadata: { status } });
    return json(request, { ok: true });
  }
  if (path === "/admin/notices" && request.method === "POST") {
    const title = String(input.title ?? "").trim();
    const content = String(input.content ?? "").trim();
    if (title.length < 2 || title.length > 100 || content.length < 5 || content.length > 4000) return json(request, { error: "공지 제목과 내용을 확인해 주세요." }, 400);
    const { data, error } = await db.from("notices").insert({ title, content, pinned: input.pinned === true, published: true }).select("id").single();
    if (error) throw error;
    await db.from("audit_logs").insert({ actor: session.email, action: "ADMIN_NOTICE_CREATED", target_type: "notice", target_id: String(data.id) });
    return json(request, { ok: true, id: data.id }, 201);
  }
  if (path === "/admin/change-password" && request.method === "POST") {
    const currentPassword = String(input.currentPassword ?? "");
    const nextPassword = String(input.nextPassword ?? "");
    if (nextPassword.length < 12) return json(request, { error: "새 비밀번호는 12자 이상으로 설정해 주세요." }, 400);
    const { data } = await db.from("admins").select("password_hash").eq("email", session.email).single();
    if (!data?.password_hash || await sha256(currentPassword) !== data.password_hash) return json(request, { error: "현재 비밀번호가 올바르지 않습니다." }, 401);
    const { error } = await db.from("admins").update({ password_hash: await sha256(nextPassword) }).eq("email", session.email);
    if (error) throw error;
    await db.from("audit_logs").insert({ actor: session.email, action: "ADMIN_PASSWORD_CHANGED", target_type: "admin", target_id: session.email });
    return json(request, { ok: true });
  }
  return json(request, { error: "관리자 API 경로를 찾을 수 없습니다." }, 404);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  const url = new URL(request.url);
  const path = routePath(url);
  try {
    if (path === "/" || path === "/health") return json(request, { ok: true, service: "crimescene-api", region: "ap-northeast-2", database: "supabase-postgres" });
    if (path === "/availability" && request.method === "GET") return handleAvailability(request, url);
    if (path === "/notices" && request.method === "GET") {
      const { data, error } = await db.from("notices").select("id,title,content,pinned,created_at").eq("published", true).order("pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return json(request, { notices: data ?? [] });
    }
    if (path === "/reservations" && request.method === "POST") return handleReservationCreate(request);
    if (path === "/reservations/lookup" && request.method === "POST") return handleReservationLookup(request);
    if (path === "/reservations/cancel" && request.method === "POST") return handleReservationCancel(request);
    if (path === "/inquiries" && request.method === "POST") return handleInquiry(request);
    if (path === "/payments/kis/status" && request.method === "GET") return json(request, { provider: "KISPG", configured: false, message: "KISPG 가맹점 키 연결 후 카드 결제가 활성화됩니다." });
    if (path === "/admin/login" && request.method === "POST") return handleAdminLogin(request);
    if (path.startsWith("/admin/")) {
      const session = await verifyAdminSession(request);
      if (!session) return json(request, { error: "관리자 로그인이 필요합니다." }, 401);
      return handleAdmin(request, path, session);
    }
    return json(request, { error: "API 경로를 찾을 수 없습니다." }, 404);
  } catch (error) {
    console.error(path, error);
    return json(request, { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
});
