import { env } from "cloudflare:workers";

export async function GET() {
  const config = env as unknown as Record<string, string | undefined>;
  const enabled = Boolean(config.KIS_MID && config.KIS_API_KEY && config.KIS_PAY_REQUEST_URL);
  return Response.json({ provider: "KISPG", enabled, mode: enabled ? "configured" : "awaiting-merchant-contract" });
}
