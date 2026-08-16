import { themes } from "../../data/themes";
import { ensureDatabase, isReservableDate } from "../../../db/runtime";

type SlotRow = { theme_id: string; start_time: string; capacity: number; booked_count: number; open_room: number; status: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const themeId = url.searchParams.get("theme")?.toUpperCase();
  if (!isReservableDate(date)) return Response.json({ error: "오늘부터 14일 이내의 날짜를 선택해 주세요." }, { status: 400 });
  const selectedThemes = themeId ? themes.filter((theme) => theme.id === themeId) : themes;
  if (!selectedThemes.length) return Response.json({ error: "존재하지 않는 테마입니다." }, { status: 404 });
  try {
    const db = await ensureDatabase();
    const statements = selectedThemes.flatMap((theme) => theme.times.map((time) => db.prepare("INSERT OR IGNORE INTO availability (theme_id, play_date, start_time, capacity) VALUES (?, ?, ?, 5)").bind(theme.id, date, time)));
    if (statements.length) await db.batch(statements);
    const placeholders = selectedThemes.map(() => "?").join(",");
    const result = await db.prepare(`SELECT theme_id, start_time, capacity, booked_count, open_room, status FROM availability WHERE play_date = ? AND theme_id IN (${placeholders}) ORDER BY theme_id, start_time`).bind(date, ...selectedThemes.map((theme) => theme.id)).all();
    const rows = result.results as unknown as SlotRow[];
    return Response.json({ date, themes: selectedThemes.map((theme) => ({ id: theme.id, title: theme.title, shortTitle: theme.shortTitle, image: theme.image, times: rows.filter((row) => row.theme_id === theme.id).map((row) => ({ time: row.start_time, status: row.status, capacity: row.capacity, bookedCount: row.booked_count, remaining: Math.max(0, row.capacity - row.booked_count), openRoom: Boolean(row.open_room) })) })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "예약 현황을 불러오지 못했습니다." }, { status: 503 });
  }
}
