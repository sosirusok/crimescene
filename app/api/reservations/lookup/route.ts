import { themes } from "../../../data/themes";
import { ensureDatabase, hashPhone, normalizePhone } from "../../../../db/runtime";

type ReservationRow = { id: string; lookup_code: string; theme_id: string; play_date: string; start_time: string; customer_name: string; phone_masked: string; party_size: number; open_room: number; total_amount: number; status: string; payment_status: string; created_at: string };

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { customerName?: string; phone?: string; lookupCode?: string };
  const name = payload.customerName?.trim() ?? "";
  const phone = normalizePhone(payload.phone ?? "");
  if (name.length < 2 || !/^01\d{8,9}$/.test(phone)) return Response.json({ error: "예약자 이름과 휴대폰 번호를 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    const phoneHash = await hashPhone(phone);
    const query = payload.lookupCode?.trim()
      ? db.prepare("SELECT * FROM reservations WHERE customer_name = ? AND phone_hash = ? AND lookup_code = ? ORDER BY created_at DESC LIMIT 10").bind(name, phoneHash, payload.lookupCode.trim().toUpperCase())
      : db.prepare("SELECT * FROM reservations WHERE customer_name = ? AND phone_hash = ? ORDER BY created_at DESC LIMIT 10").bind(name, phoneHash);
    const result = await query.all();
    const rows = result.results as unknown as ReservationRow[];
    return Response.json({ reservations: rows.map((row) => ({ id: row.id, lookupCode: row.lookup_code, themeId: row.theme_id, themeTitle: themes.find((theme) => theme.id === row.theme_id)?.title ?? row.theme_id, playDate: row.play_date, startTime: row.start_time, customerName: row.customer_name, phoneMasked: row.phone_masked, partySize: row.party_size, openRoom: Boolean(row.open_room), totalAmount: row.total_amount, status: row.status, paymentStatus: row.payment_status, createdAt: row.created_at })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "예약을 조회하지 못했습니다." }, { status: 503 }); }
}
