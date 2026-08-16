import { env } from "cloudflare:workers";
import { themes } from "../../data/themes";
import { encryptPhone, ensureDatabase, hashPhone, isReservableDate, makeLookupCode, maskPhone, normalizePhone } from "../../../db/runtime";

type ReservationPayload = { themeId?: string; playDate?: string; startTime?: string; customerName?: string; phone?: string; partySize?: number; openRoom?: boolean; specialRequest?: string; privacyConsent?: boolean; cancellationConsent?: boolean };

function isKisConfigured() {
  const config = env as unknown as Record<string, string | undefined>;
  return Boolean(config.KIS_MID && config.KIS_API_KEY && config.KIS_PAY_REQUEST_URL);
}

export async function POST(request: Request) {
  let payload: ReservationPayload;
  try { payload = await request.json() as ReservationPayload; } catch { return Response.json({ error: "요청 내용을 확인해 주세요." }, { status: 400 }); }
  const theme = themes.find((item) => item.id === payload.themeId?.toUpperCase());
  const name = payload.customerName?.trim() ?? "";
  const phone = normalizePhone(payload.phone ?? "");
  const partySize = Number(payload.partySize);
  const date = payload.playDate ?? "";
  const time = payload.startTime ?? "";
  if (!theme || !theme.times.includes(time) || !isReservableDate(date)) return Response.json({ error: "선택한 일정이 올바르지 않습니다. 예약은 오늘부터 14일 이내에 가능합니다." }, { status: 400 });
  if (name.length < 2 || name.length > 20) return Response.json({ error: "예약자 이름을 확인해 주세요." }, { status: 400 });
  if (!/^01\d{8,9}$/.test(phone)) return Response.json({ error: "휴대폰 번호를 확인해 주세요." }, { status: 400 });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 5) return Response.json({ error: "예약 인원은 1명부터 5명까지 선택할 수 있습니다." }, { status: 400 });
  if (partySize < 4 && !payload.openRoom) return Response.json({ error: "4명 미만 예약은 오픈룸을 선택해 주세요." }, { status: 400 });
  if (!payload.privacyConsent || !payload.cancellationConsent) return Response.json({ error: "필수 동의 항목을 확인해 주세요." }, { status: 400 });
  const reservationId = crypto.randomUUID();
  const lookupCode = makeLookupCode(date);
  const phoneHash = await hashPhone(phone);
  const phoneEncrypted = await encryptPhone(phone);
  const totalAmount = theme.price * partySize;
  try {
    const db = await ensureDatabase();
    await db.prepare("INSERT OR IGNORE INTO availability (theme_id, play_date, start_time, capacity) VALUES (?, ?, ?, 5)").bind(theme.id, date, time).run();
    const update = await db.prepare("UPDATE availability SET booked_count = booked_count + ?, open_room = CASE WHEN booked_count = 0 THEN ? ELSE open_room END, status = CASE WHEN booked_count + ? >= capacity OR (booked_count = 0 AND ? = 0) THEN 'SOLD_OUT' ELSE 'OPEN' END, updated_at = CURRENT_TIMESTAMP WHERE theme_id = ? AND play_date = ? AND start_time = ? AND status = 'OPEN' AND booked_count + ? <= capacity AND (booked_count = 0 OR open_room = 1)").bind(partySize, payload.openRoom ? 1 : 0, partySize, payload.openRoom ? 1 : 0, theme.id, date, time, partySize).run();
    if (!update.meta.changes) return Response.json({ error: "선택한 시간은 방금 예약이 완료되었거나 남은 인원이 부족합니다." }, { status: 409 });
    try {
      await db.batch([
        db.prepare("INSERT INTO reservations (id, lookup_code, theme_id, play_date, start_time, customer_name, phone_hash, phone_masked, phone_encrypted, party_size, open_room, special_request, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(reservationId, lookupCode, theme.id, date, time, name, phoneHash, maskPhone(phone), phoneEncrypted, partySize, payload.openRoom ? 1 : 0, (payload.specialRequest ?? "").trim().slice(0, 300), totalAmount),
        db.prepare("INSERT INTO payments (id, reservation_id, amount) VALUES (?, ?, ?)").bind(crypto.randomUUID(), reservationId, totalAmount),
        db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES ('customer', 'RESERVATION_CREATED', 'reservation', ?, ?)").bind(reservationId, JSON.stringify({ themeId: theme.id, date, time, partySize })),
      ]);
    } catch (error) {
      await db.prepare("UPDATE availability SET booked_count = MAX(0, booked_count - ?), status = 'OPEN', updated_at = CURRENT_TIMESTAMP WHERE theme_id = ? AND play_date = ? AND start_time = ?").bind(partySize, theme.id, date, time).run();
      throw error;
    }
    return Response.json({ reservation: { id: reservationId, lookupCode, themeTitle: theme.title, playDate: date, startTime: time, partySize, totalAmount, status: "PENDING_PAYMENT", paymentStatus: "READY" }, payment: { provider: "KISPG", enabled: isKisConfigured() } }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "예약을 저장하지 못했습니다." }, { status: 503 });
  }
}
