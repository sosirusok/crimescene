import { accessHash, db, encrypt, hhmm, limited, mask, paymentState, phone, publicSettings, publicTheme, readBody, reply, reservableDate, room, settingsRow, sha, signSession, themeRows } from "./core.ts";
import { reconcileNicepayVerifying } from "./payment.ts";

const ONSITE_PAYMENT = { provider: "ONSITE", status: "READY", mode: "ONSITE", label: "매장 결제", enabled: false };
const INTRODUCTION_STATUSES = ["CONFIRMED", "COMPLETED", "CANCEL_REQUESTED"];

// Expiry/reconcile never write store_settings or themes, so those reads run alongside them.
// customer: true adds settings.businessName (customer-api), taken from the settings row already loaded.
export async function bootstrap(req: Request, customer = false) {
  const [, , settings, themes] = await Promise.all([db.rpc("expire_nicepay_payment_holds"), reconcileNicepayVerifying(2), settingsRow(), themeRows(true)]);
  const shown: any = publicSettings(settings); if (customer) shown.businessName = settings.business_name || "(주)싱글";
  return reply(req, { settings: shown, themes: themes.map(publicTheme), payment: paymentState(settings) });
}

// Reads the slots first and only inserts the missing ones (then re-reads), so a date whose slots exist costs one query.
async function slotRows(themes: any[], date: string) {
  const read = async () => { const { data, error } = await db.from("availability").select("theme_id,start_time,capacity,booked_count,open_room,status").eq("play_date", date).in("theme_id", themes.map((t: any) => t.id)).order("theme_id").order("start_time"); if (error) throw error; return data ?? []; };
  const rows = await read(), have = new Set(rows.map((s: any) => `${s.theme_id}|${hhmm(s.start_time)}`));
  const missing = themes.flatMap((t: any) => (t.times ?? []).filter((time: string) => !have.has(`${t.id}|${time}`)).map((time: string) => ({ theme_id: t.id, play_date: date, start_time: time, capacity: t.total_capacity })));
  if (!missing.length) return rows;
  const { error } = await db.from("availability").upsert(missing, { onConflict: "theme_id,play_date,start_time", ignoreDuplicates: true }); if (error) throw error;
  return read();
}

function sanitizeIntroduction(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim(); if (!text) return "";
  return text.replace(/01[016789][\s-]?\d{3,4}[\s-]?\d{4}/g, "연락처 비공개").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "이메일 비공개").slice(0, 160);
}

// Open-room team introductions per "theme|HH:MM" (customer-api only). A read error leaves the slots without the field, as before.
async function openRoomIntroductions(date: string, themes: any[]) {
  const themeIds = themes.map((t: any) => String(t.id ?? "")).filter(Boolean); if (!themeIds.length) return null;
  const { data, error } = await db.from("reservations").select("theme_id,start_time,party_size,special_request,created_at").eq("play_date", date).eq("open_room", true).in("status", INTRODUCTION_STATUSES).in("theme_id", themeIds).order("created_at", { ascending: true });
  if (error) { console.error("open room introductions", error); return null; }
  const grouped = new Map<string, Array<{ partySize: number; message: string }>>();
  for (const row of data ?? []) {
    const message = sanitizeIntroduction(row.special_request); if (!message) continue;
    const key = `${row.theme_id}|${hhmm(row.start_time)}`, list = grouped.get(key) ?? []; list.push({ partySize: Number(row.party_size ?? 0), message }); grouped.set(key, list);
  }
  return grouped;
}

export async function availability(req: Request, url: URL, customer = false) {
  const active = themeRows(true); active.catch(() => {});
  const [, , settings] = await Promise.all([db.rpc("expire_nicepay_payment_holds"), reconcileNicepayVerifying(2), settingsRow()]);
  const date = url.searchParams.get("date") ?? "", wanted = (url.searchParams.get("theme") ?? "").toUpperCase();
  if (!reservableDate(date, settings.booking_window_days)) return reply(req, { error: `오늘부터 ${settings.booking_window_days}일 이내의 날짜를 선택해 주세요.` }, 400);
  const themes = (await active).filter((t: any) => !wanted || t.id === wanted);
  if (!themes.length) return reply(req, { error: "존재하지 않는 테마입니다." }, 404);
  // Both run after expiry/reconcile finished, so counts and introductions see the same data as before.
  const [data, introductions] = await Promise.all([slotRows(themes, date), customer ? openRoomIntroductions(date, themes) : null]);
  const slot = (t: any, s: any) => { const value: any = { time: hhmm(s.start_time), status: s.status, ...room(s, t.min_players) }; if (introductions) value.openRoomIntroductions = introductions.get(`${t.id}|${value.time}`) ?? []; return value; };
  return reply(req, { date, settings: publicSettings(settings), themes: themes.map((t: any) => ({ ...publicTheme(t), times: data.filter((s: any) => s.theme_id === t.id).map((s: any) => slot(t, s)) })) });
}

// Retries of one ONSITE booking (same client idempotencyKey, phone and booking fields) map to one reservation id.
export async function onsiteReservationId(key: string, phoneHash: string, fields: Array<string | number | boolean>) {
  const h = await sha(`crimescene-onsite-reservation-v1:${JSON.stringify([key, phoneHash, ...fields])}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${(8 | (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

async function existingReservation(id: string, phoneHash: string) {
  const { data, error } = await db.from("reservations").select("id,theme_id,play_date,start_time,party_size,total_amount,status,payment_status,booking_mode").eq("id", id).eq("phone_hash", phoneHash).maybeSingle(); if (error) throw error; return data;
}

async function replayReservation(req: Request, r: any, t: any) {
  const time = hhmm(r.start_time), { data: s } = await db.from("availability").select("capacity,booked_count,open_room,status").eq("theme_id", r.theme_id).eq("play_date", r.play_date).eq("start_time", time).maybeSingle();
  const paymentStatus = r.payment_status ?? "READY";
  return reply(req, { reservation: { id: r.id, themeTitle: t.title, playDate: r.play_date, startTime: time, partySize: r.party_size, totalAmount: r.total_amount, status: r.status, paymentStatus, bookingMode: r.booking_mode, room: room(s, t.min_players) }, payment: { ...ONSITE_PAYMENT, status: paymentStatus } }, 200);
}

export async function createReservation(req: Request) {
  if (!await limited(req, "reservation-create", 600, 10)) return reply(req, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  const settings = await settingsRow(), pay = paymentState(settings), b: any = await readBody(req);
  if (settings.payment_mode === "ONLINE" && !pay.onlineEnabled) return reply(req, { error: "온라인 결제 설정이 완료되지 않아 현재 예약을 받을 수 없습니다. 매장으로 문의해 주세요." }, 503);
  if (pay.onlineEnabled) return reply(req, { error: "온라인 카드 결제 예약은 결제 준비 경로를 이용해 주세요." }, 409);
  const themeId = String(b.themeId ?? "").toUpperCase(), date = String(b.playDate ?? ""), time = hhmm(b.startTime), name = String(b.customerName ?? "").trim(), p = phone(b.phone), size = Number(b.partySize), open = b.openRoom === true, message = String(b.specialRequest ?? "").trim(), key = String(b.idempotencyKey ?? "").trim();
  if (!reservableDate(date, settings.booking_window_days)) return reply(req, { error: "예약 가능한 날짜를 확인해 주세요." }, 400);
  if (name.length < 2 || name.length > 20 || !/^01\d{8,9}$/.test(p) || !Number.isInteger(size)) return reply(req, { error: "예약자 이름, 휴대폰 번호와 인원을 확인해 주세요." }, 400);
  if (b.privacyConsent !== true || b.cancellationConsent !== true) return reply(req, { error: "필수 동의 항목을 확인해 주세요." }, 400);
  if (key && !/^[A-Za-z0-9_-]{16,128}$/.test(key)) return reply(req, { error: "예약 요청 식별값을 다시 생성해 주세요." }, 400);
  const phoneHash = await sha(p), id = key ? await onsiteReservationId(key, phoneHash, [themeId, date, time, name, size, open, message]) : crypto.randomUUID();
  const [{ data: t, error }, existing] = await Promise.all([db.from("themes").select("id,title,price,times,status,min_players,total_capacity").eq("id", themeId).eq("status", "ACTIVE").maybeSingle(), key ? existingReservation(id, phoneHash) : null]); if (error) throw error;
  if (!t || !(t.times ?? []).includes(time) || size < 1 || size > t.total_capacity) return reply(req, { error: "테마, 회차 또는 예약 인원을 확인해 주세요." }, 400);
  if (size < t.min_players && !open) return reply(req, { error: `${t.min_players}명 미만 예약은 오픈룸으로 진행해 주세요.` }, 400);
  if (open && message.length < 2) return reply(req, { error: "같이 플레이할 분들이 확인할 간단한 소개를 입력해 주세요." }, 400);
  if (existing) return replayReservation(req, existing, t);
  const lookup = `CS-${date.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, total = t.price * size;
  const { data: r, error: rpcError } = await db.rpc("reserve_crimescene_slot", { p_reservation_id: id, p_lookup_code: lookup, p_theme_id: t.id, p_play_date: date, p_start_time: time, p_customer_name: name, p_phone_hash: phoneHash, p_phone_masked: mask(p), p_phone_encrypted: await encrypt(p), p_party_size: size, p_open_room: open, p_special_request: message, p_total_amount: total });
  if (rpcError) {
    const m = rpcError.message;
    // A concurrent retry of the same keyed request won the slot (or inserted this id) first: answer with that reservation.
    if (key && (String(rpcError.code ?? "") === "23505" || m.includes("slot_unavailable") || m.includes("slot_capacity_insufficient"))) { const raced = await existingReservation(id, phoneHash); if (raced) return replayReservation(req, raced, t); }
    if (m.includes("open_room_required")) return reply(req, { error: "4명 미만 예약은 오픈룸으로 진행해 주세요." }, 400);
    if (m.includes("open_room_message_required")) return reply(req, { error: "오픈룸 소개를 입력해 주세요." }, 400);
    if (m.includes("slot_capacity_insufficient")) return reply(req, { error: "남은 자리보다 예약 인원이 많습니다." }, 409);
    if (m.includes("slot_unavailable")) return reply(req, { error: "선택한 회차는 방금 마감되었거나 단독팀 예약이 있습니다." }, 409);
    throw rpcError;
  }
  const { data: s } = await db.from("availability").select("capacity,booked_count,open_room,status").eq("theme_id", themeId).eq("play_date", date).eq("start_time", time).maybeSingle();
  return reply(req, { reservation: { id: r?.id ?? id, themeTitle: t.title, playDate: date, startTime: time, partySize: size, totalAmount: total, status: r?.status ?? "CONFIRMED", paymentStatus: "READY", bookingMode: r?.booking_mode ?? (open ? "OPEN_HOST" : "PRIVATE"), room: room(s, t.min_players) }, payment: ONSITE_PAYMENT }, 201);
}

// One availability read for all looked-up reservations; "in" on start_time matches exactly what the former per-row "eq" matched.
async function lookupSlots(rows: any[]) {
  const slots = new Map<string, any>(); if (!rows.length) return slots;
  const unique = (values: unknown[]) => [...new Set(values.map(String))];
  const { data } = await db.from("availability").select("theme_id,play_date,start_time,capacity,booked_count,open_room,status").in("theme_id", unique(rows.map((r) => r.theme_id))).in("play_date", unique(rows.map((r) => r.play_date))).in("start_time", unique(rows.map((r) => hhmm(r.start_time))));
  for (const s of data ?? []) slots.set(`${s.theme_id}|${s.play_date}|${hhmm(s.start_time)}`, s);
  return slots;
}

export async function lookup(req: Request) {
  if (!await limited(req, "reservation-lookup", 600, 20)) return reply(req, { error: "잠시 후 다시 조회해 주세요." }, 429);
  const b: any = await readBody(req), name = String(b.customerName ?? "").trim(), p = phone(b.phone);
  if (name.length < 2 || !/^01\d{8,9}$/.test(p)) return reply(req, { error: "예약자 이름과 휴대폰 번호를 확인해 주세요." }, 400);
  const [settings] = await Promise.all([settingsRow(), db.rpc("expire_nicepay_payment_holds")]);
  const { data, error } = await db.from("reservations").select("id,lookup_code,theme_id,play_date,start_time,customer_name,phone_masked,party_size,open_room,booking_mode,special_request,total_amount,status,payment_status,created_at,themes(title,min_players),payments(provider,status,receipt_url,failure_message)").eq("customer_name", name).eq("phone_hash", await sha(p)).order("created_at", { ascending: false }).limit(10); if (error) throw error;
  const slots = await lookupSlots(data ?? []), reservations = [];
  for (const r of data ?? []) {
    const s = slots.get(`${r.theme_id}|${r.play_date}|${hhmm(r.start_time)}`);
    const payment = Array.isArray((r as any).payments) ? (r as any).payments[0] : (r as any).payments;
    reservations.push({ id: r.id, lookupCode: r.lookup_code, themeId: r.theme_id, themeTitle: (r as any).themes?.title ?? r.theme_id, playDate: r.play_date, startTime: hhmm(r.start_time), customerName: r.customer_name, phoneMasked: r.phone_masked, partySize: r.party_size, openRoom: r.open_room, bookingMode: r.booking_mode, openRoomMessage: r.open_room ? r.special_request : "", totalAmount: r.total_amount, status: r.status, paymentStatus: r.payment_status, paymentProvider: payment?.provider ?? "ONSITE", receiptUrl: payment?.receipt_url ?? null, paymentFailureMessage: payment?.failure_message ?? null, createdAt: r.created_at, room: s ? room(s, (r as any).themes?.min_players ?? 4) : null });
  }
  return reply(req, { reservations, cancellationCutoffHours: settings.cancellation_cutoff_hours });
}

export async function cancelReservation(req: Request) {
  if (!await limited(req, "reservation-cancel", 600, 10)) return reply(req, { error: "잠시 후 다시 시도해 주세요." }, 429);
  const settings = await settingsRow(), b: any = await readBody(req), code = String(b.lookupCode ?? "").trim().toUpperCase(), name = String(b.customerName ?? "").trim(), p = phone(b.phone);
  if (!code || name.length < 2 || !/^01\d{8,9}$/.test(p)) return reply(req, { error: "예약 정보를 확인해 주세요." }, 400);
  const { data, error } = await db.rpc("cancel_crimescene_reservation", { p_lookup_code: code, p_customer_name: name, p_phone_hash: await sha(p), p_reason: String(b.reason ?? "고객 온라인 취소").slice(0, 200) });
  if (error) {
    if (error.message.includes("reservation_not_found")) return reply(req, { error: "일치하는 예약이 없습니다." }, 404);
    if (error.message.includes("already_canceled")) return reply(req, { error: "이미 취소된 예약입니다." }, 409);
    if (error.message.includes("nicepay_pending_cancel_requires_abort") || error.message.includes("provider_managed_payment")) return reply(req, { error: "카드 결제 확인 중에는 일반 예약 취소를 할 수 없습니다. 결제 결과를 확인한 뒤 다시 시도해 주세요." }, 409);
    if (error.message.includes("within_cutoff") || error.message.includes("within_24_hours")) return reply(req, { error: `이용 ${settings.cancellation_cutoff_hours}시간 전부터는 온라인 취소가 제한됩니다. 매장으로 문의해 주세요.` }, 409);
    throw error;
  }
  const status = data?.[0]?.next_status ?? "CANCELED";
  return reply(req, { status, message: status === "CANCEL_REQUESTED" ? "취소 요청이 접수되었습니다. 결제 취소 확인 후 최종 처리됩니다." : "예약이 취소되었습니다." });
}

export async function inquiry(req: Request) {
  if (!await limited(req, "inquiry", 3600, 5)) return reply(req, { error: "문의 접수 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요." }, 429);
  const b: any = await readBody(req), name = String(b.customerName ?? "").trim(), p = phone(b.phone), subject = String(b.subject ?? "").trim(), content = String(b.content ?? "").trim();
  if (name.length < 2 || !/^01\d{8,9}$/.test(p) || subject.length < 2 || content.length < 10 || b.privacyConsent !== true) return reply(req, { error: "이름, 연락처, 제목, 문의 내용과 개인정보 동의를 확인해 주세요." }, 400);
  const id = crypto.randomUUID(), { error } = await db.from("inquiries").insert({ id, customer_name: name, phone_hash: await sha(p), phone_masked: mask(p), phone_encrypted: await encrypt(p), subject: subject.slice(0, 100), content: content.slice(0, 2000) }); if (error) throw error;
  await db.from("audit_logs").insert({ actor: "customer", action: "INQUIRY_CREATED", target_type: "inquiry", target_id: id });
  return reply(req, { id, message: "문의가 접수되었습니다. 확인 후 입력하신 연락처로 안내드립니다." }, 201);
}

export async function login(req: Request) {
  if (!await limited(req, "admin-login", 900, 5)) return reply(req, { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." }, 429);
  const b: any = await readBody(req), value = String(b.accessKey ?? "");
  const { data } = await db.from("admins").select("email,display_name,role,active,password_hash").eq("active", true).order("role").limit(1).maybeSingle();
  const secure = await accessHash(value), legacy = await sha(value);
  if (!data?.password_hash || (data.password_hash !== secure && data.password_hash !== legacy)) return reply(req, { error: "관리자 암호키가 올바르지 않습니다." }, 401);
  if (data.password_hash === legacy) await db.from("admins").update({ password_hash: secure }).eq("email", data.email);
  return reply(req, { token: await signSession({ email: data.email, role: data.role, exp: Math.floor(Date.now() / 1000) + 28800 }), user: { displayName: data.display_name ?? "서면점 운영자", role: data.role }, expiresIn: 28800 });
}
