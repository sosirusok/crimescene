import { accessHash, addDays, db, decrypt, encrypt, hhmm, mask, paymentState, phone, publicSettings, publicTheme, readBody, RELEASED, reply, room, settingsRow, sha, themeRows, today } from "./core.ts";
import { cancelNicepayPayment, reconcileNicepayVerifying } from "./payment.ts";

function errorMessage(error: any) { return String(error?.message ?? error ?? ""); }

async function dashboard(req: Request) {
  await Promise.all([db.rpc("expire_nicepay_payment_holds"), reconcileNicepayVerifying(3)]);
  const settings = await settingsRow();
  const [themes, resQ, inqQ, slotsQ, noticesQ, logsQ, totalQ, activeQ, todayQ, revenueQ] = await Promise.all([
    themeRows(false),
    db.from("reservations").select("id,lookup_code,theme_id,play_date,start_time,customer_name,phone_masked,phone_encrypted,party_size,open_room,booking_mode,special_request,admin_note,source,total_amount,status,payment_status,created_at,updated_at,themes(short_title,min_players),payments(provider,status,provider_transaction_id,approved_at,raw_result_code,receipt_url,failure_code,failure_message,expires_at)").order("play_date", { ascending: false }).order("start_time", { ascending: false }).limit(500),
    db.from("inquiries").select("id,customer_name,phone_masked,phone_encrypted,subject,content,status,response,created_at,updated_at").order("created_at", { ascending: false }).limit(150),
    db.from("availability").select("theme_id,play_date,start_time,capacity,booked_count,open_room,status").gte("play_date", today()).lte("play_date", addDays(today(), settings.booking_window_days - 1)).order("play_date").order("start_time").limit(2000),
    db.from("notices").select("id,title,content,pinned,published,created_at,updated_at").order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    db.from("audit_logs").select("id,actor,action,target_type,target_id,metadata,created_at").order("created_at", { ascending: false }).limit(150),
    db.from("reservations").select("id", { count: "exact", head: true }),
    db.from("reservations").select("id", { count: "exact", head: true }).in("status", ["CONFIRMED", "COMPLETED", "CANCEL_REQUESTED"]),
    db.from("reservations").select("id", { count: "exact", head: true }).eq("play_date", today()).in("status", ["CONFIRMED", "COMPLETED", "CANCEL_REQUESTED"]),
    db.from("reservations").select("total_amount").eq("payment_status", "PAID"),
  ]);
  const error = resQ.error ?? inqQ.error ?? slotsQ.error ?? noticesQ.error ?? logsQ.error ?? totalQ.error ?? activeQ.error ?? todayQ.error ?? revenueQ.error; if (error) throw error;
  const reservations = await Promise.all((resQ.data ?? []).map(async (r: any) => {
    const paymentRow = Array.isArray(r.payments) ? r.payments[0] : r.payments;
    const payment = paymentRow ? {
      provider: paymentRow.provider,
      status: paymentRow.status,
      transactionId: paymentRow.provider_transaction_id,
      approvedAt: paymentRow.approved_at,
      resultCode: paymentRow.raw_result_code,
      receiptUrl: paymentRow.receipt_url,
      failureCode: paymentRow.failure_code,
      failureMessage: paymentRow.failure_message,
      expiresAt: paymentRow.expires_at,
    } : { provider: "ONSITE", status: r.payment_status };
    return {
      ...r,
      phone: await decrypt(r.phone_encrypted) ?? r.phone_masked,
      phone_encrypted: undefined,
      start_time: hhmm(r.start_time),
      theme_title: r.themes?.short_title ?? r.theme_id,
      min_players: r.themes?.min_players ?? 4,
      payment,
      latestPayment: payment,
      payment_provider: payment.provider,
      payment_transaction_id: payment.transactionId ?? null,
      payment_receipt_url: payment.receiptUrl ?? null,
      payment_failure_code: payment.failureCode ?? null,
      payment_failure_message: payment.failureMessage ?? null,
      themes: undefined,
      payments: undefined,
    };
  }));
  const inquiries = await Promise.all((inqQ.data ?? []).map(async (r: any) => ({ ...r, phone: await decrypt(r.phone_encrypted) ?? r.phone_masked, phone_encrypted: undefined })));
  const openRooms = (slotsQ.data ?? []).filter((s: any) => s.booked_count > 0 && s.open_room).map((s: any) => {
    const teams = reservations.filter((r: any) => r.theme_id === s.theme_id && r.play_date === s.play_date && r.start_time === hhmm(s.start_time) && !RELEASED.includes(r.status));
    const t = themes.find((x: any) => x.id === s.theme_id);
    return { key: `${s.theme_id}|${s.play_date}|${hhmm(s.start_time)}`, themeId: s.theme_id, themeTitle: t?.short_title ?? s.theme_id, playDate: s.play_date, startTime: hhmm(s.start_time), ...room(s, t?.min_players ?? 4), teamCount: teams.length, teams: teams.map((x: any, i: number) => ({ id: x.id, teamNumber: i + 1, customerName: x.customer_name, phone: x.phone, partySize: x.party_size, message: x.special_request, adminNote: x.admin_note, source: x.source, status: x.status, paymentStatus: x.payment_status, bookingMode: x.booking_mode, createdAt: x.created_at })) };
  });
  return reply(req, {
    metrics: { total: totalQ.count ?? 0, active: activeQ.count ?? 0, today: todayQ.count ?? 0, revenue: (revenueQ.data ?? []).reduce((a: number, r: any) => a + Number(r.total_amount ?? 0), 0), recruitingRooms: openRooms.filter((r: any) => r.state === "OPEN_RECRUITING").length, playableRooms: openRooms.filter((r: any) => r.state === "OPEN_PLAYABLE" || r.state === "FULL").length, newInquiries: inquiries.filter((x: any) => x.status === "NEW").length },
    settings: publicSettings(settings), payment: paymentState(settings), themes: themes.map(publicTheme), reservations, inquiries, openRooms,
    slots: (slotsQ.data ?? []).map((s: any) => ({ themeId: s.theme_id, playDate: s.play_date, startTime: hhmm(s.start_time), ...room(s, themes.find((t: any) => t.id === s.theme_id)?.min_players ?? 4) })),
    notices: noticesQ.data ?? [], auditLogs: logsQ.data ?? [],
  });
}

async function createAdminReservation(req: Request, user: any, b: any) {
  const settings = await settingsRow(), themeId = String(b.themeId ?? "").toUpperCase(), date = String(b.playDate ?? ""), time = hhmm(b.startTime), name = String(b.customerName ?? "").trim(), p = phone(b.phone), size = Number(b.partySize), open = b.openRoom === true;
  if (name.length < 2 || name.length > 20 || !/^01\d{8,9}$/.test(p) || !Number.isInteger(size)) return reply(req, { error: "예약자 이름, 휴대폰 번호와 인원을 확인해 주세요." }, 400);
  const { data: t, error } = await db.from("themes").select("id,price,times,total_capacity,min_players").eq("id", themeId).eq("status", "ACTIVE").maybeSingle(); if (error) throw error;
  if (!t || !(t.times ?? []).includes(time) || size < 1 || size > t.total_capacity) return reply(req, { error: "테마, 날짜, 회차와 인원을 확인해 주세요." }, 400);
  const id = crypto.randomUUID(), lookup = `CS-${date.replaceAll("-", "").slice(2)}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const { data, error: rpcError } = await db.rpc("admin_create_crimescene_reservation", { p_actor: user.email, p_reservation_id: id, p_lookup_code: lookup, p_theme_id: themeId, p_play_date: date, p_start_time: time, p_customer_name: name, p_phone_hash: await sha(p), p_phone_masked: mask(p), p_phone_encrypted: await encrypt(p), p_party_size: size, p_open_room: open, p_special_request: String(b.specialRequest ?? "").trim(), p_total_amount: t.price * size, p_source: String(b.source ?? "ADMIN"), p_admin_note: String(b.adminNote ?? "").trim() });
  if (rpcError) {
    const m = errorMessage(rpcError);
    if (m.includes("slot_capacity_insufficient")) return reply(req, { error: "남은 자리보다 인원이 많습니다." }, 409);
    if (m.includes("slot_unavailable")) return reply(req, { error: "단독 예약과 충돌하거나 운영 중지된 회차입니다." }, 409);
    if (m.includes("open_room_required")) return reply(req, { error: `${t.min_players}명 미만은 오픈룸으로 등록해 주세요.` }, 400);
    throw rpcError;
  }
  return reply(req, { ok: true, reservation: data, paymentMode: settings.payment_mode }, 201);
}

async function updateReservationDetails(req: Request, user: any, b: any) {
  const id = String(b.id ?? ""), p = phone(b.phone), name = String(b.customerName ?? "").trim();
  if (!id || name.length < 2 || !/^01\d{8,9}$/.test(p)) return reply(req, { error: "예약자 정보와 연락처를 확인해 주세요." }, 400);
  const { data: payment } = await db.from("payments").select("provider,status").eq("reservation_id", id).maybeSingle();
  if (payment?.provider === "NICEPAY") return reply(req, { error: "나이스페이먼츠 결제 예약은 금액과 승인 정보 보호를 위해 예약 내용을 직접 변경할 수 없습니다. 결제 취소 확인 후 새 예약으로 등록해 주세요." }, 409);
  const { data, error } = await db.rpc("admin_update_reservation_details", { p_actor: user.email, p_reservation_id: id, p_theme_id: String(b.themeId ?? "").toUpperCase(), p_play_date: String(b.playDate ?? ""), p_start_time: hhmm(b.startTime), p_customer_name: name, p_phone_hash: await sha(p), p_phone_masked: mask(p), p_phone_encrypted: await encrypt(p), p_party_size: Number(b.partySize), p_open_room: b.openRoom === true, p_special_request: String(b.specialRequest ?? "").trim(), p_admin_note: String(b.adminNote ?? "").trim(), p_source: String(b.source ?? "ADMIN") });
  if (error) {
    const m = errorMessage(error);
    if (m.includes("reservation_not_found")) return reply(req, { error: "예약을 찾을 수 없습니다." }, 404);
    if (m.includes("inactive_reservation")) return reply(req, { error: "취소 또는 미방문 처리된 예약은 일정과 인원을 변경할 수 없습니다." }, 409);
    if (m.includes("slot_capacity_insufficient")) return reply(req, { error: "변경할 회차의 남은 자리가 부족합니다." }, 409);
    if (m.includes("slot_unavailable")) return reply(req, { error: "변경할 회차가 운영 중지됐거나 단독 예약과 충돌합니다." }, 409);
    if (m.includes("open_room_required")) return reply(req, { error: "4명 미만은 오픈룸으로 변경해 주세요." }, 400);
    if (m.includes("open_room_message_required")) return reply(req, { error: "오픈룸 소개를 입력해 주세요." }, 400);
    return reply(req, { error: "변경 내용을 확인해 주세요." }, 400);
  }
  return reply(req, { ok: true, reservation: data });
}

export async function adminAction(req: Request, path: string, user: any) {
  if (path === "/admin/dashboard" && req.method === "GET") return dashboard(req);
  if (path === "/admin/payments/nicepay/cancel" && req.method === "POST") return cancelNicepayPayment(req, user);
  const b: any = await readBody(req);

  if (path === "/admin/reservations" && req.method === "POST") return createAdminReservation(req, user, b);
  if (path === "/admin/reservations/details" && (req.method === "PATCH" || req.method === "PUT")) return updateReservationDetails(req, user, b);
  if (path === "/admin/reservations" && req.method === "PATCH") {
    const reservationId = String(b.id ?? "");
    const [{ data: current }, { data: payment }] = await Promise.all([
      db.from("reservations").select("status,payment_status").eq("id", reservationId).maybeSingle(),
      db.from("payments").select("provider,status").eq("reservation_id", reservationId).maybeSingle(),
    ]);
    if (!current) return reply(req, { error: "예약을 찾을 수 없습니다." }, 404);
    if (payment?.provider === "NICEPAY" && String(b.paymentStatus ?? "") !== current.payment_status) return reply(req, { error: "나이스페이먼츠 결제 상태는 승인 결과와 웹훅으로만 변경됩니다." }, 409);
    if (payment?.provider === "NICEPAY" && current.status === "PENDING_PAYMENT" && String(b.status ?? "") !== "PENDING_PAYMENT") return reply(req, { error: "결제 확인 중인 예약 상태는 승인 결과가 반영된 뒤 변경할 수 있습니다." }, 409);
    if (payment?.provider === "NICEPAY" && current.payment_status === "PAID" && String(b.status ?? "") === "CANCELED") return reply(req, { error: "결제 완료 예약은 나이스페이먼츠에서 취소 승인 후 자동 반영됩니다. 먼저 취소 요청 상태로 변경해 주세요." }, 409);
    const { error } = await db.rpc("admin_update_reservation", { p_actor: user.email, p_reservation_id: reservationId, p_status: String(b.status ?? ""), p_payment_status: String(b.paymentStatus ?? "") });
    if (error?.message.includes("reservation_not_found")) return reply(req, { error: "예약을 찾을 수 없습니다." }, 404);
    if (error?.message.includes("slot_capacity_insufficient")) return reply(req, { error: "좌석이 부족하거나 단독 예약과 충돌하여 복원할 수 없습니다." }, 409);
    if (error) throw error; return reply(req, { ok: true });
  }
  if (path === "/admin/inquiries" && req.method === "PATCH") {
    const status = String(b.status ?? ""); if (!["NEW", "IN_PROGRESS", "ANSWERED", "CLOSED"].includes(status)) return reply(req, { error: "문의 상태를 확인해 주세요." }, 400);
    const { data, error } = await db.from("inquiries").update({ status, response: String(b.response ?? "").trim().slice(0, 2000), updated_at: new Date().toISOString() }).eq("id", String(b.id ?? "")).select("id").maybeSingle(); if (error) throw error; if (!data) return reply(req, { error: "문의를 찾을 수 없습니다." }, 404);
    await db.from("audit_logs").insert({ actor: user.email, action: "ADMIN_INQUIRY_UPDATED", target_type: "inquiry", target_id: String(b.id ?? ""), metadata: { status } });
    return reply(req, { ok: true });
  }
  if (path === "/admin/availability" && req.method === "PATCH") {
    const { error } = await db.rpc("admin_set_crimescene_slot_status", { p_actor: user.email, p_theme_id: String(b.themeId ?? "").toUpperCase(), p_play_date: String(b.playDate ?? ""), p_start_time: hhmm(b.startTime), p_status: String(b.status ?? "") });
    if (error?.message.includes("slot_has_reservations")) return reply(req, { error: "예약자가 있는 회차는 운영 중지할 수 없습니다." }, 409); if (error) throw error; return reply(req, { ok: true });
  }
  if (path === "/admin/availability/bulk" && req.method === "POST") {
    const themeId = String(b.themeId ?? "").toUpperCase(), date = String(b.playDate ?? ""), status = String(b.status ?? "");
    if (!["OPEN", "BLOCKED"].includes(status)) return reply(req, { error: "회차 상태를 확인해 주세요." }, 400);
    const { data: theme, error } = await db.from("themes").select("times").eq("id", themeId).maybeSingle(); if (error) throw error; if (!theme) return reply(req, { error: "테마를 찾을 수 없습니다." }, 404);
    let changed = 0, skipped = 0;
    for (const time of theme.times ?? []) {
      const { error: rpcError } = await db.rpc("admin_set_crimescene_slot_status", { p_actor: user.email, p_theme_id: themeId, p_play_date: date, p_start_time: time, p_status: status });
      if (rpcError?.message.includes("slot_has_reservations")) skipped++; else if (rpcError) throw rpcError; else changed++;
    }
    return reply(req, { ok: true, changed, skipped });
  }
  if (path === "/admin/themes" && req.method === "PATCH") {
    const times = Array.isArray(b.times) ? b.times : String(b.times ?? "").split(/[\s,]+/).filter(Boolean);
    const { data, error } = await db.rpc("admin_update_theme", { p_actor: user.email, p_theme_id: String(b.id ?? "").toUpperCase(), p_title: String(b.title ?? ""), p_short_title: String(b.shortTitle ?? ""), p_episode: Number(b.episode), p_tagline: String(b.tagline ?? ""), p_synopsis: String(b.synopsis ?? ""), p_difficulty: String(b.difficulty ?? ""), p_suspect_capacity: Number(b.suspectCapacity), p_detective_capacity: Number(b.detectiveCapacity), p_min_players: Number(b.minPlayers), p_price: Number(b.price), p_duration_minutes: Number(b.duration), p_image_path: String(b.image ?? ""), p_accent: String(b.accent ?? ""), p_status: String(b.status ?? "ACTIVE"), p_times: times });
    if (error?.message.includes("theme_capacity_below_existing_booking")) return reply(req, { error: "현재 예약 인원보다 정원을 작게 줄일 수 없습니다." }, 409); if (error) return reply(req, { error: "테마 정보와 시간대를 확인해 주세요." }, 400); return reply(req, { ok: true, theme: publicTheme(data) });
  }
  if (path === "/admin/settings" && req.method === "PATCH") {
    const current = await settingsRow(), desiredMode = String(b.paymentMode ?? "ONSITE"), pay = paymentState({ ...current, payment_mode: desiredMode, mail_order_registration_number: String(b.mailOrderRegistrationNumber ?? ""), refund_policy_confirmed: b.refundPolicyConfirmed === true });
    if (desiredMode === "ONLINE" && !pay.configured) return reply(req, { error: "나이스페이먼츠 Client ID, Secret Key와 운영 환경이 등록된 뒤 온라인 결제를 켤 수 있습니다." }, 409);
    if (desiredMode === "ONLINE" && !pay.legalReady) return reply(req, { error: "통신판매업 신고번호와 확정된 환불 기준을 입력한 뒤 온라인 결제를 켜 주세요." }, 409);
    if (desiredMode === "ONLINE" && !pay.integrationReady) return reply(req, { error: "실제 카드 승인·취소·결제 결과 확인 모듈이 배포된 뒤 온라인 결제를 켤 수 있습니다. 현재는 매장 결제로 운영해 주세요." }, 409);
    const { data, error } = await db.rpc("admin_update_store_settings", { p_actor: user.email, p_store_name: String(b.storeName ?? ""), p_branch_name: String(b.branchName ?? ""), p_representative_name: String(b.representativeName ?? ""), p_business_registration_number: String(b.businessRegistrationNumber ?? ""), p_mail_order_registration_number: String(b.mailOrderRegistrationNumber ?? ""), p_phone: String(b.phone ?? ""), p_email: String(b.email ?? ""), p_address_road: String(b.addressRoad ?? ""), p_address_detail: String(b.addressDetail ?? ""), p_map_query: String(b.mapQuery ?? ""), p_booking_window_days: Number(b.bookingWindowDays), p_arrival_minutes: Number(b.arrivalMinutes), p_cancellation_cutoff_hours: Number(b.cancellationCutoffHours), p_payment_mode: desiredMode, p_payment_provider: "NICEPAY", p_privacy_officer_name: String(b.privacyOfficerName ?? ""), p_privacy_officer_contact: String(b.privacyOfficerContact ?? ""), p_refund_policy_confirmed: b.refundPolicyConfirmed === true, p_customer_notice: String(b.customerNotice ?? "") });
    if (error) return reply(req, { error: "매장 정보와 운영 설정을 확인해 주세요." }, 400);
    return reply(req, { ok: true, settings: publicSettings(data), payment: paymentState(data) });
  }
  if (path === "/admin/notices" && req.method === "POST") {
    const title = String(b.title ?? "").trim(), content = String(b.content ?? "").trim(); if (title.length < 2 || content.length < 5) return reply(req, { error: "공지 제목과 내용을 확인해 주세요." }, 400);
    const { data, error } = await db.from("notices").insert({ title: title.slice(0, 100), content: content.slice(0, 4000), pinned: b.pinned === true, published: b.published !== false }).select("id").single(); if (error) throw error; return reply(req, { ok: true, id: data.id }, 201);
  }
  if (path === "/admin/notices" && req.method === "PATCH") {
    const patch: any = { updated_at: new Date().toISOString() }; for (const key of ["title", "content", "pinned", "published"]) if (b[key] !== undefined) patch[key] = b[key];
    const { data, error } = await db.from("notices").update(patch).eq("id", Number(b.id)).select("id").maybeSingle(); if (error) throw error; if (!data) return reply(req, { error: "공지를 찾을 수 없습니다." }, 404); return reply(req, { ok: true });
  }
  if (path === "/admin/notices" && req.method === "DELETE") { const { error } = await db.from("notices").delete().eq("id", Number(b.id)); if (error) throw error; return reply(req, { ok: true }); }
  if (path === "/admin/change-password" && req.method === "POST") {
    const current = String(b.currentAccessKey ?? ""), next = String(b.nextAccessKey ?? ""); if (next.length < 12) return reply(req, { error: "새 암호키는 12자 이상으로 설정해 주세요." }, 400);
    const { data } = await db.from("admins").select("password_hash").eq("email", user.email).single(); const secure = await accessHash(current), legacy = await sha(current); if (!data?.password_hash || (data.password_hash !== secure && data.password_hash !== legacy)) return reply(req, { error: "현재 암호키가 올바르지 않습니다." }, 401);
    const { error } = await db.from("admins").update({ password_hash: await accessHash(next) }).eq("email", user.email); if (error) throw error; return reply(req, { ok: true });
  }
  return reply(req, { error: "관리자 API 경로를 찾을 수 없습니다." }, 404);
}
