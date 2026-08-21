import { accessHash, db, encrypt, hhmm, limited, mask, paymentState, phone, publicSettings, publicTheme, readBody, reply, reservableDate, room, settingsRow, sha, signSession, themeRows } from "./core.ts";

export async function bootstrap(req: Request) {
  const [settings, themes] = await Promise.all([settingsRow(), themeRows(true)]);
  return reply(req, { settings: publicSettings(settings), themes: themes.map(publicTheme), payment: paymentState(settings) });
}

export async function availability(req: Request, url: URL) {
  const settings = await settingsRow();
  const date = url.searchParams.get("date") ?? "", wanted = (url.searchParams.get("theme") ?? "").toUpperCase();
  if (!reservableDate(date, settings.booking_window_days)) return reply(req, { error: `오늘부터 ${settings.booking_window_days}일 이내의 날짜를 선택해 주세요.` }, 400);
  const themes = (await themeRows(true)).filter((t: any) => !wanted || t.id === wanted);
  if (!themes.length) return reply(req, { error: "존재하지 않는 테마입니다." }, 404);
  const slots = themes.flatMap((t: any) => (t.times ?? []).map((time: string) => ({ theme_id: t.id, play_date: date, start_time: time, capacity: t.total_capacity })));
  const { error: upsertError } = await db.from("availability").upsert(slots, { onConflict: "theme_id,play_date,start_time", ignoreDuplicates: true }); if (upsertError) throw upsertError;
  const { data, error } = await db.from("availability").select("theme_id,start_time,capacity,booked_count,open_room,status").eq("play_date", date).in("theme_id", themes.map((t: any) => t.id)).order("theme_id").order("start_time"); if (error) throw error;
  return reply(req, { date, settings: publicSettings(settings), themes: themes.map((t: any) => ({ ...publicTheme(t), times: (data ?? []).filter((s: any) => s.theme_id === t.id).map((s: any) => ({ time: hhmm(s.start_time), status: s.status, ...room(s, t.min_players) })) })) });
}

export async function createReservation(req: Request) {
  if (!await limited(req, "reservation-create", 600, 10)) return reply(req, { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429);
  const settings = await settingsRow(), pay = paymentState(settings), b: any = await readBody(req);
  if (settings.payment_mode === "ONLINE" && !pay.onlineEnabled) return reply(req, { error: "온라인 결제 설정이 완료되지 않아 현재 예약을 받을 수 없습니다. 매장으로 문의해 주세요." }, 503);
  const themeId = String(b.themeId ?? "").toUpperCase(), date = String(b.playDate ?? ""), time = hhmm(b.startTime), name = String(b.customerName ?? "").trim(), p = phone(b.phone), size = Number(b.partySize), open = b.openRoom === true, message = String(b.specialRequest ?? "").trim();
  if (!reservableDate(date, settings.booking_window_days)) return reply(req, { error: "예약 가능한 날짜를 확인해 주세요." }, 400);
  if (name.length < 2 || name.length > 20 || !/^01\d{8,9}$/.test(p) || !Number.isInteger(size)) return reply(req, { error: "예약자 이름, 휴대폰 번호와 인원을 확인해 주세요." }, 400);
  if (b.privacyConsent !== true || b.cancellationConsent !== true) return reply(req, { error: "필수 동의 항목을 확인해 주세요." }, 400);
  const { data: t, error } = await db.from("themes").select("id,title,price,times,status,min_players,total_capacity").eq("id", themeId).eq("status", "ACTIVE").maybeSingle(); if (error) throw error;
  if (!t || !(t.times ?? []).includes(time) || size < 1 || size > t.total_capacity) return reply(req, { error: "테마, 회차 또는 예약 인원을 확인해 주세요." }, 400);
  if (size < t.min_players && !open) return reply(req, { error: `${t.min_players}명 미만 예약은 오픈룸으로 진행해 주세요.` }, 400);
  if (open && message.length < 2) return reply(req, { error: "같이 플레이할 분들이 확인할 간단한 소개를 입력해 주세요." }, 400);
  const id = crypto.randomUUID(), lookup = `CS-${date.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, total = t.price * size;
  const { data: r, error: rpcError } = await db.rpc("reserve_crimescene_slot", { p_reservation_id: id, p_lookup_code: lookup, p_theme_id: t.id, p_play_date: date, p_start_time: time, p_customer_name: name, p_phone_hash: await sha(p), p_phone_masked: mask(p), p_phone_encrypted: await encrypt(p), p_party_size: size, p_open_room: open, p_special_request: message, p_total_amount: total });
  if (rpcError) {
    const m = rpcError.message;
    if (m.includes("open_room_required")) return reply(req, { error: "4명 미만 예약은 오픈룸으로 진행해 주세요." }, 400);
    if (m.includes("open_room_message_required")) return reply(req, { error: "오픈룸 소개를 입력해 주세요." }, 400);
    if (m.includes("slot_capacity_insufficient")) return reply(req, { error: "남은 자리보다 예약 인원이 많습니다." }, 409);
    if (m.includes("slot_unavailable")) return reply(req, { error: "선택한 회차는 방금 마감되었거나 단독팀 예약이 있습니다." }, 409);
    throw rpcError;
  }
  const { data: s } = await db.from("availability").select("capacity,booked_count,open_room,status").eq("theme_id", themeId).eq("play_date", date).eq("start_time", time).maybeSingle();
  return reply(req, { reservation: { id: r?.id ?? id, themeTitle: t.title, playDate: date, startTime: time, partySize: size, totalAmount: total, status: r?.status ?? (settings.payment_mode === "ONLINE" ? "PENDING_PAYMENT" : "CONFIRMED"), paymentStatus: "READY", bookingMode: r?.booking_mode ?? (open ? "OPEN_HOST" : "PRIVATE"), room: room(s, t.min_players) }, payment: { ...pay, enabled: pay.onlineEnabled } }, 201);
}

export async function lookup(req: Request) {
  if (!await limited(req, "reservation-lookup", 600, 20)) return reply(req, { error: "잠시 후 다시 조회해 주세요." }, 429);
  const b: any = await readBody(req), name = String(b.customerName ?? "").trim(), p = phone(b.phone);
  if (name.length < 2 || !/^01\d{8,9}$/.test(p)) return reply(req, { error: "예약자 이름과 휴대폰 번호를 확인해 주세요." }, 400);
  const settings = await settingsRow();
  const { data, error } = await db.from("reservations").select("id,lookup_code,theme_id,play_date,start_time,customer_name,phone_masked,party_size,open_room,booking_mode,special_request,total_amount,status,payment_status,created_at,themes(title,min_players)").eq("customer_name", name).eq("phone_hash", await sha(p)).order("created_at", { ascending: false }).limit(10); if (error) throw error;
  const reservations = [];
  for (const r of data ?? []) {
    const { data: s } = await db.from("availability").select("capacity,booked_count,open_room,status").eq("theme_id", r.theme_id).eq("play_date", r.play_date).eq("start_time", hhmm(r.start_time)).maybeSingle();
    reservations.push({ id: r.id, lookupCode: r.lookup_code, themeId: r.theme_id, themeTitle: (r as any).themes?.title ?? r.theme_id, playDate: r.play_date, startTime: hhmm(r.start_time), customerName: r.customer_name, phoneMasked: r.phone_masked, partySize: r.party_size, openRoom: r.open_room, bookingMode: r.booking_mode, openRoomMessage: r.open_room ? r.special_request : "", totalAmount: r.total_amount, status: r.status, paymentStatus: r.payment_status, createdAt: r.created_at, room: s ? room(s, (r as any).themes?.min_players ?? 4) : null });
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
