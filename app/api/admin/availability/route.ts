import { ensureDatabase } from "../../../../db/runtime";
import { themes } from "../../../data/themes";
import { requireAdminApi } from "../../../admin/access";

export async function PATCH(request: Request) {
  const { access, response } = await requireAdminApi(); if (response) return response;
  const body = await request.json().catch(() => ({})) as { themeId?: string; playDate?: string; startTime?: string; status?: string };
  const theme = themes.find((item) => item.id === body.themeId);
  if (!theme || !/^\d{4}-\d{2}-\d{2}$/.test(body.playDate ?? "") || !theme.times.includes(body.startTime ?? "") || !["OPEN", "BLOCKED"].includes(body.status ?? "")) return Response.json({ error: "회차 정보를 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase();
    await db.prepare("INSERT INTO availability (theme_id, play_date, start_time, capacity, status) VALUES (?, ?, ?, 5, ?) ON CONFLICT(theme_id, play_date, start_time) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP").bind(theme.id, body.playDate, body.startTime, body.status).run();
    await db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES (?, 'ADMIN_SLOT_UPDATED', 'availability', ?, ?)").bind(access.user!.email, `${theme.id}:${body.playDate}:${body.startTime}`, JSON.stringify({ status: body.status })).run();
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "회차를 변경하지 못했습니다." }, { status: 503 }); }
}
