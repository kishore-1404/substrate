import { cookies } from "next/headers";
import { randomBytes, scryptSync } from "node:crypto";

// Lightweight session: the cookie holds the user id directly, not a signed
// token. That's a real limitation — a client can forge this cookie's value
// to impersonate any user id — acceptable for a single-team internal tool
// at this stage, not for anything exposed publicly. Upgrade to a signed/
// httpOnly session token (or a real auth provider) before that changes.
const SESSION_COOKIE = "session_uid";

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setSessionCookie(userId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

// Hashed for basic hygiene (never store plaintext), but login does not
// verify it yet — "lightweight real accounts", not full auth.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
