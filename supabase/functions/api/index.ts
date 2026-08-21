import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { cors, db, paymentState, publicTheme, reply, routePath, settingsRow, themeRows, verifyAdmin } from "./core.ts";
import { availability, bootstrap, cancelReservation, createReservation, inquiry, login, lookup } from "./public.ts";
import { adminAction } from "./admin.ts";
import { abortNicepay, nicepayResult, nicepayReturn, nicepayWebhook, prepareNicepay } from "./payment.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const url = new URL(req.url), path = routePath(url);
  try {
    if (path === "/" || path === "/health") return reply(req, { ok: true, service: "crimescene-api", version: "5.0.0", database: "supabase-postgres", paymentProvider: "NICEPAY" });
    if (path === "/bootstrap" && req.method === "GET") return bootstrap(req);
    if (path === "/themes" && req.method === "GET") return reply(req, { themes: (await themeRows(true)).map(publicTheme) });
    if (path === "/availability" && req.method === "GET") return availability(req, url);
    if (path === "/notices" && req.method === "GET") {
      const { data, error } = await db.from("notices").select("id,title,content,pinned,published,created_at,updated_at").eq("published", true).order("pinned", { ascending: false }).order("created_at", { ascending: false }); if (error) throw error; return reply(req, { notices: data ?? [] });
    }
    if (path === "/payment/status" && req.method === "GET") { const settings = await settingsRow(); return reply(req, paymentState(settings)); }
    if (path === "/payments/nicepay/prepare" && req.method === "POST") return prepareNicepay(req);
    if (path === "/payments/nicepay/abort" && req.method === "POST") return abortNicepay(req);
    if (path === "/payments/nicepay/result" && req.method === "POST") return nicepayResult(req);
    if (path === "/payments/nicepay/return" && req.method === "POST") return nicepayReturn(req);
    if (path === "/payments/nicepay/webhook" && req.method === "POST") return nicepayWebhook(req);
    if (path === "/reservations" && req.method === "POST") return createReservation(req);
    if (path === "/reservations/lookup" && req.method === "POST") return lookup(req);
    if (path === "/reservations/cancel" && req.method === "POST") return cancelReservation(req);
    if (path === "/inquiries" && req.method === "POST") return inquiry(req);
    if (path === "/admin/login" && req.method === "POST") return login(req);
    if (path.startsWith("/admin/")) { const user = await verifyAdmin(req); if (!user) return reply(req, { error: "관리자 로그인이 필요합니다." }, 401); return adminAction(req, path, user); }
    return reply(req, { error: "API 경로를 찾을 수 없습니다." }, 404);
  } catch (error) {
    console.error(path, error);
    return reply(req, { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
});
