import { decryptPhone, ensureDatabase } from "../../../../db/runtime";
import { themes } from "../../../data/themes";
import { requireAdminApi } from "../../../admin/access";

type ReservationRow = { id: string; lookup_code: string; theme_id: string; play_date: string; start_time: string; customer_name: string; phone_masked: string; phone_encrypted: string | null; party_size: number; open_room: number; total_amount: number; status: string; payment_status: string; created_at: string };
type InquiryRow = { id: string; customer_name: string; phone_masked: string; phone_encrypted: string | null; subject: string; content: string; status: string; response: string | null; created_at: string };

export async function GET() {
  const { response } = await requireAdminApi(); if (response) return response;
  try {
    const db = await ensureDatabase();
    const [reservationsResult, inquiriesResult, metricsResult, revenueResult] = await Promise.all([
      db.prepare("SELECT id, lookup_code, theme_id, play_date, start_time, customer_name, phone_masked, phone_encrypted, party_size, open_room, total_amount, status, payment_status, created_at FROM reservations ORDER BY play_date DESC, start_time DESC LIMIT 100").all(),
      db.prepare("SELECT id, customer_name, phone_masked, phone_encrypted, subject, content, status, response, created_at FROM inquiries ORDER BY created_at DESC LIMIT 50").all(),
      db.prepare("SELECT COUNT(*) total, SUM(CASE WHEN status NOT IN ('CANCELED','CANCEL_REQUESTED') THEN 1 ELSE 0 END) active, SUM(CASE WHEN play_date = date('now', '+9 hours') THEN 1 ELSE 0 END) today FROM reservations").first(),
      db.prepare("SELECT COALESCE(SUM(total_amount), 0) amount FROM reservations WHERE payment_status = 'PAID'").first(),
    ]);
    const reservationRows = reservationsResult.results as unknown as ReservationRow[];
    const inquiryRows = inquiriesResult.results as unknown as InquiryRow[];
    const reservations = await Promise.all(reservationRows.map(async (row) => ({ ...row, phone: await decryptPhone(row.phone_encrypted) ?? row.phone_masked, open_room: Boolean(row.open_room), theme_title: themes.find((theme) => theme.id === row.theme_id)?.shortTitle ?? row.theme_id, phone_encrypted: undefined })));
    const inquiries = await Promise.all(inquiryRows.map(async (row) => ({ ...row, phone: await decryptPhone(row.phone_encrypted) ?? row.phone_masked, phone_encrypted: undefined })));
    return Response.json({ metrics: { ...metricsResult, revenue: (revenueResult as { amount?: number } | null)?.amount ?? 0 }, reservations, inquiries });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "운영 데이터를 불러오지 못했습니다." }, { status: 503 }); }
}
