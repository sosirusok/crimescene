import { ensureDatabase } from "../../../../db/runtime";
import { requireAdminApi } from "../../../admin/access";

export async function PATCH(request: Request) {
  const { access, response } = await requireAdminApi(); if (response) return response;
  const body = await request.json().catch(() => ({})) as { id?: string; status?: string; response?: string };
  if (!body.id || !["NEW", "IN_PROGRESS", "ANSWERED", "CLOSED"].includes(body.status ?? "")) return Response.json({ error: "문의 상태를 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    const result = await db.prepare("UPDATE inquiries SET status = ?, response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, (body.response ?? "").trim().slice(0, 2000), body.id).run();
    if (!result.meta.changes) return Response.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
    await db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES (?, 'ADMIN_INQUIRY_UPDATED', 'inquiry', ?, ?)").bind(access.user!.email, body.id, JSON.stringify({ status: body.status })).run();
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "문의를 변경하지 못했습니다." }, { status: 503 }); }
}
