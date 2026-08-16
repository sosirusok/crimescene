import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../chatgpt-auth";

export async function getAdminAccess() {
  const user = await getChatGPTUser();
  const config = env as unknown as Record<string, string | undefined>;
  const emails = (config.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return { user, configured: emails.length > 0, allowed: Boolean(user && emails.includes(user.email.toLowerCase())) };
}

export async function requireAdminApi() {
  const access = await getAdminAccess();
  if (!access.user) return { access, response: Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 }) };
  if (!access.configured) return { access, response: Response.json({ error: "ADMIN_EMAILS 환경변수를 먼저 설정해 주세요." }, { status: 503 }) };
  if (!access.allowed) return { access, response: Response.json({ error: "허용된 관리자 계정이 아닙니다." }, { status: 403 }) };
  return { access, response: null };
}
