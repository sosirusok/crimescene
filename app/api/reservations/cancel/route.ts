import { ensureDatabase, hashPhone, normalizePhone } from "../../../../db/runtime";

type CancelRow = { id: string; theme_id: string; play_date: string; start_time: string; party_size: number; status: string; payment_status: string };

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { lookupCode?: string; customerName?: string; phone?: string; reason?: string };
  const code = payload.lookupCode?.trim().toUpperCase() ?? "";
  const name = payload.customerName?.trim() ?? "";
  const phone = normalizePhone(payload.phone ?? "");
  if (!code || name.length < 2 || !/^01\d{8,9}$/.test(phone)) return Response.json({ error: "예약 정보를 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    const phoneHash = await hashPhone(phone);
    const found = await db.prepare("SELECT id, theme_id, play_date, start_time, party_size, status, payment_status FROM reservations WHERE lookup_code = ? AND customer_name = ? AND phone_hash = ? LIMIT 1").bind(code, name, phoneHash).first() as unknown as CancelRow | null;
    if (!found) return Response.json({ error: "일치하는 예약이 없습니다." }, { status: 404 });
    if (["CANCELED", "CANCEL_REQUESTED"].includes(found.status)) return Response.json({ error: "이미 취소된 예약입니다." }, { status: 409 });
    const playAt = new Date(`${found.play_date}T${found.start_time}:00+09:00`).getTime();
    const within24Hours = playAt - Date.now() < 24 * 60 * 60 * 1000;
    if (within24Hours) return Response.json({ error: "이용 24시간 전부터는 온라인 취소가 제한됩니다. 매장으로 문의해 주세요." }, { status: 409 });
    const nextStatus = found.payment_status === "PAID" ? "CANCEL_REQUESTED" : "CANCELED";
    const statements = [
      db.prepare("UPDATE reservations SET status = ?, cancellation_reason = ?, canceled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(nextStatus, (payload.reason ?? "고객 온라인 취소").slice(0, 200), found.id),
      db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES ('customer', ?, 'reservation', ?, ?)").bind(nextStatus, found.id, JSON.stringify({ lookupCode: code })),
    ];
    if (nextStatus === "CANCELED") statements.splice(1, 0, db.prepare("UPDATE availability SET booked_count = MAX(0, booked_count - ?), status = 'OPEN', updated_at = CURRENT_TIMESTAMP WHERE theme_id = ? AND play_date = ? AND start_time = ?").bind(found.party_size, found.theme_id, found.play_date, found.start_time));
    await db.batch(statements);
    return Response.json({ status: nextStatus, message: nextStatus === "CANCEL_REQUESTED" ? "취소 요청이 접수되었습니다. 결제 취소 확인 후 최종 처리됩니다." : "예약이 취소되었습니다." });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "예약을 취소하지 못했습니다." }, { status: 503 }); }
}
