import { route } from "../api/router.ts";

// Public customer-site endpoint. It runs the api router in this same isolate (no second Edge Function hop) and only
// exposes the paths the customer site and its CI use; /admin/* and NICEPAY's server callbacks stay on the api function.
const ALLOWED_ORIGINS = new Set([
  "https://xn--oi2bkkl05a1gchcr33e50h.com",
  "https://www.xn--oi2bkkl05a1gchcr33e50h.com",
  "https://sosirusok.github.io",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
]);

export const CUSTOMER_PATHS = new Set([
  "/", "/health", "/bootstrap", "/themes", "/availability", "/notices", "/payment/status",
  "/payments/nicepay/prepare", "/payments/nicepay/abort", "/payments/nicepay/result",
  "/reservations", "/reservations/lookup", "/reservations/cancel", "/inquiries",
]);

export function cors(req: Request) {
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

export function suffixPath(url: URL) {
  const path = url.pathname;
  for (const marker of ["/functions/v1/customer-api", "/customer-api"]) {
    const index = path.indexOf(marker);
    if (index >= 0) return path.slice(index + marker.length) || "/";
  }
  return "/";
}

function responseHeaders(req: Request, contentType: string | null) {
  const headers = new Headers(cors(req));
  headers.set("Content-Type", contentType ?? "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

export async function handleCustomer(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (!["GET", "POST"].includes(req.method)) {
    return Response.json({ error: "허용되지 않은 요청입니다." }, { status: 405, headers: cors(req) });
  }
  const suffix = suffixPath(new URL(req.url));
  if (!CUSTOMER_PATHS.has(suffix)) {
    return new Response(JSON.stringify({ error: "API 경로를 찾을 수 없습니다." }), { status: 404, headers: responseHeaders(req, "application/json") });
  }
  try {
    // The incoming request is handed over as is, so rate limits key on its own x-forwarded-for / cf-connecting-ip.
    const response = await route(req, suffix, { customer: true });
    return new Response(response.body, { status: response.status, headers: responseHeaders(req, response.headers.get("content-type")) });
  } catch (error) {
    console.error("customer-api", suffix, error);
    return Response.json(
      { error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: cors(req) },
    );
  }
}
