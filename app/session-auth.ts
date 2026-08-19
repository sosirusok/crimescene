import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type SessionUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const EMAIL_HEADERS = [
  "cf-access-authenticated-user-email",
  "x-authenticated-user-email",
] as const;

const NAME_HEADERS = [
  "cf-access-authenticated-user-name",
  "x-authenticated-user-name",
] as const;

export async function getSessionUser(): Promise<SessionUser | null> {
  const requestHeaders = await headers();
  const email = firstHeader(requestHeaders, EMAIL_HEADERS);
  if (!email) return null;

  const fullName = firstHeader(requestHeaders, NAME_HEADERS);
  return {
    displayName: fullName ?? email,
    email,
    fullName,
  };
}

export async function requireSessionUser(returnTo: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (user) return user;
  redirect(sessionSignInPath(returnTo));
}

export function sessionSignInPath(returnTo: string): string {
  return authPath(process.env.AUTH_SIGN_IN_PATH, safeRelativeReturnPath(returnTo));
}

export function sessionSignOutPath(returnTo = "/"): string {
  return authPath(process.env.AUTH_SIGN_OUT_PATH, safeRelativeReturnPath(returnTo));
}

function authPath(configuredPath: string | undefined, returnTo: string): string {
  const path = configuredPath?.trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) return returnTo;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}return_to=${encodeURIComponent(returnTo)}`;
}

function firstHeader(
  requestHeaders: Awaited<ReturnType<typeof headers>>,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = requestHeaders.get(name)?.trim();
    if (value) return safeDecodeURIComponent(value) ?? value;
  }
  return null;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
