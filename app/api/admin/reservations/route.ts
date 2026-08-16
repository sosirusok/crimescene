import { ensureDatabase } from "../../../../db/runtime";
import { requireAdminApi } from "../../../admin/access";

const reservationStatuses = ["PENDING_PAYMENT", "CONFIRMED", "COMPLETED", "CANCELED", "NO_SHOW"];
const paymentStatuses = ["READY", "PAID", "FAILED", "REFUNDED"];

export async function PATCH(request: Request) {
  const { access, response } = await requireAdminApi(); if (response) return response;
  const body = await request.json().catch(() => ({})) as { id?: string; status?: string; paymentStatus?: string };
  if (!body.id || !reservationStatuses.includes(body.status ?? "") || !paymentStatuses.includes(body.paymentStatus ?? "")) return Response.json({ error: "변경할 예약 상태를 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    const before = await db.prepare("SELECT status, payment_status, theme_id, play_date, start_time, party_size FROM reservations WHERE id = ?").bind(body.id).first() as { status: string; payment_status: string; theme_id: string; play_date: string; start_time: string; party_size: number } | null;
    if (!before) return Response.json({ error: "예약을 찾을 수 없습니다." }, { status: 404 });
    const wasHoldingSeat = !["CANCELED", "NO_SHOW"].includes(before.status);
    const willHoldSeat = !["CANCELED", "NO_SHOW"].includes(body.status);
    const statements = [
      db.prepare("UPDATE reservations SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, body.paymentStatus, body.id),
      db.prepare("UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE reservation_id = ?").bind(body.paymentStatus, body.id),
      db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES (?, 'ADMIN_RESERVATION_UPDATED', 'reservation', ?, ?)").bind(access.user!.email, body.id, JSON.stringify({ before, after: { status: body.status, paymentStatus: body.paymentStatus } })),
    ];
    if (wasHoldingSeat && !willHoldSeat) statements.splice(2, 0, db.prepare("UPDATE availability SET booked_count = MAX(0, booked_count - ?), status = 'OPEN', updated_at = CURRENT_TIMESTAMP WHERE theme_id = ? AND play_date = ? AND start_time = ?").bind(before.party_size, before.theme_id, before.play_date, before.start_time));
    if (!wasHoldingSeat && willHoldSeat) {
      const slot = await db.prepare("SELECT capacity, booked_count, status FROM availability WHERE theme_id = ? AND play_date = ? AND start_time = ?").bind(before.theme_id, before.play_date, before.start_time).first() as { capacity: number; booked_count: number; status: string } | null;
      if (!slot || slot.status === "BLOCKED" || slot.booked_count + before.party_size > slot.capacity) return Response.json({ error: "해당 회차에 예약을 복원할 좌석이 부족합니다." }, { status: 409 });
      statements.splice(2, 0, db.prepare("UPDATE availability SET booked_count = booked_count + ?, status = CASE WHEN booked_count + ? >= capacity THEN 'SOLD_OUT' ELSE 'OPEN' END, updated_at = CURRENT_TIMESTAMP WHERE theme_id = ? AND play_date = ? AND start_time = ?").bind(before.party_size, before.party_size, before.theme_id, before.play_date, before.start_time));
    }
    await db.batch(statements);
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "예약 상태를 변경하지 못했습니다." }, { status: 503 }); }
}
