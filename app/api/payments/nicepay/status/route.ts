import { env } from "cloudflare:workers";

export async function GET() {
  const config = env as unknown as Record<string, string | undefined>;
  const environment = config.NICEPAY_ENVIRONMENT;
  const enabled = Boolean(config.NICEPAY_CLIENT_ID && config.NICEPAY_SECRET_KEY && ["sandbox", "production"].includes(environment ?? ""));
  return Response.json({ provider: "NICEPAY", enabled, environment: environment || "not-configured", mode: enabled ? "configured" : "onsite" });
}
