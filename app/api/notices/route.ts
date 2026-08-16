import { ensureDatabase } from "../../../db/runtime";

type NoticeRow = { id: number; title: string; content: string; pinned: number; created_at: string };

export async function GET() {
  try {
    const db = await ensureDatabase();
    const result = await db.prepare("SELECT id, title, content, pinned, created_at FROM notices WHERE published = 1 ORDER BY pinned DESC, created_at DESC, id DESC").all();
    return Response.json({ notices: (result.results as unknown as NoticeRow[]).map((notice) => ({ ...notice, pinned: Boolean(notice.pinned) })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "공지사항을 불러오지 못했습니다." }, { status: 503 });
  }
}
