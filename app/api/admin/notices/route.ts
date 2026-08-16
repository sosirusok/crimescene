import { ensureDatabase } from "../../../../db/runtime";
import { requireAdminApi } from "../../../admin/access";

export async function POST(request: Request) {
  const { access, response } = await requireAdminApi(); if (response) return response;
  const body = await request.json().catch(() => ({})) as { title?: string; content?: string; pinned?: boolean };
  const title = body.title?.trim() ?? ""; const content = body.content?.trim() ?? "";
  if (title.length < 2 || title.length > 100 || content.length < 5 || content.length > 2000) return Response.json({ error: "공지 제목과 내용을 확인해 주세요." }, { status: 400 });
  try {
    const db = await ensureDatabase(); const result = await db.prepare("INSERT INTO notices (title, content, pinned, published) VALUES (?, ?, ?, 1)").bind(title, content, body.pinned ? 1 : 0).run();
    await db.prepare("INSERT INTO audit_logs (actor, action, target_type, target_id, metadata) VALUES (?, 'ADMIN_NOTICE_CREATED', 'notice', ?, '{}')").bind(access.user!.email, String(result.meta.last_row_id)).run();
    return Response.json({ ok: true, id: result.meta.last_row_id }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "공지를 등록하지 못했습니다." }, { status: 503 }); }
}
