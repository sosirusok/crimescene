import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://jhjbiejqtbidloxcwryr.supabase.co";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const UPSTREAM = `${SUPABASE_URL}/functions/v1/api`;
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_ORIGINS = new Set([
  "https://xn--oi2bkkl05a1gchcr33e50h.com",
  "https://www.xn--oi2bkkl05a1gchcr33e50h.com",
  "https://sosirusok.github.io",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : "https://xn--oi2bkkl05a1gchcr33e50h.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function suffixPath(url: URL) {
  const path = url.pathname;
  for (const marker of ["/functions/v1/customer-api", "/customer-api"]) {
    const index = path.indexOf(marker);
    if (index >= 0) return path.slice(index + marker.length) || "/";
  }
  return "/";
}

function hhmm(value: unknown) {
  return String(value ?? "").slice(0, 5);
}

function sanitizeIntroduction(value: unknown) {
  let text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  text = text
    .replace(/01[016789][\s-]?\d{3,4}[\s-]?\d{4}/g, "연락처 비공개")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "이메일 비공개");
  return text.slice(0, 160);
}

async function addBusinessName(payload: any) {
  if (!payload?.settings) return payload;
  const { data } = await db
    .from("store_settings")
    .select("business_name")
    .eq("id", 1)
    .maybeSingle();
  payload.settings.businessName = data?.business_name || "(주)싱글";
  return payload;
}

async function addOpenRoomIntroductions(payload: any, incoming: URL) {
  const playDate = incoming.searchParams.get("date") ?? "";
  const themes = Array.isArray(payload?.themes) ? payload.themes : [];
  const themeIds = themes.map((theme: any) => String(theme.id ?? "")).filter(Boolean);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate) || !themeIds.length) return payload;

  const { data, error } = await db
    .from("reservations")
    .select("theme_id,start_time,party_size,special_request,created_at")
    .eq("play_date", playDate)
    .eq("open_room", true)
    .in("status", ["CONFIRMED", "COMPLETED", "CANCEL_REQUESTED"])
    .in("theme_id", themeIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("open room introductions", error);
    return payload;
  }

  const grouped = new Map<string, Array<{ partySize: number; message: string }>>();
  for (const row of data ?? []) {
    const message = sanitizeIntroduction(row.special_request);
    if (!message) continue;
    const key = `${row.theme_id}|${hhmm(row.start_time)}`;
    const list = grouped.get(key) ?? [];
    list.push({ partySize: Number(row.party_size ?? 0), message });
    grouped.set(key, list);
  }

  for (const theme of themes) {
    if (!Array.isArray(theme.times)) continue;
    for (const slot of theme.times) {
      const key = `${theme.id}|${hhmm(slot.time)}`;
      slot.openRoomIntroductions = grouped.get(key) ?? [];
    }
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (!["GET", "POST"].includes(req.method)) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405, headers: cors(req) });
  }

  const incoming = new URL(req.url);
  const suffix = suffixPath(incoming);
  const target = new URL(`${UPSTREAM}${suffix}`);
  target.search = incoming.search;

  const headers = new Headers();
  const apikey = req.headers.get("apikey");
  const contentType = req.headers.get("content-type");
  const clientInfo = req.headers.get("x-client-info");
  const forwarded = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip");
  if (apikey) headers.set("apikey", apikey);
  if (contentType) headers.set("content-type", contentType);
  if (clientInfo) headers.set("x-client-info", clientInfo);
  if (forwarded) headers.set("x-forwarded-for", forwarded);
  headers.set("origin", "https://sosirusok.github.io");

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "POST" ? await req.arrayBuffer() : undefined,
      redirect: "manual",
    });

    const responseHeaders = new Headers(cors(req));
    responseHeaders.set("Content-Type", upstream.headers.get("content-type") ?? "application/json; charset=utf-8");
    responseHeaders.set("Cache-Control", "no-store");
    responseHeaders.set("X-Content-Type-Options", "nosniff");

    const bodyText = await upstream.text();
    if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").includes("application/json")) {
      return new Response(bodyText, { status: upstream.status, headers: responseHeaders });
    }

    let payload: any;
    try {
      payload = JSON.parse(bodyText);
    } catch {
      return new Response(bodyText, { status: upstream.status, headers: responseHeaders });
    }

    if (suffix === "/bootstrap") await addBusinessName(payload);
    if (suffix === "/availability") await addOpenRoomIntroductions(payload, incoming);

    return new Response(JSON.stringify(payload), { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    console.error("customer-api proxy", error);
    return Response.json(
      { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: cors(req) },
    );
  }
});
