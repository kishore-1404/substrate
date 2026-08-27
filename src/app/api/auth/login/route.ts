import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { setSessionCookie } from "@/lib/auth";

// "Lightweight" per design: looks up by email only, does not verify the
// password. Fine for an internal tool with no real security boundary yet;
// see lib/auth.ts's note on the session cookie itself.
export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  if (!email?.trim()) return NextResponse.json({ error: "email is required" }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.email, email.trim()));
  if (!user) return NextResponse.json({ error: "No account with that email." }, { status: 404 });

  await setSessionCookie(user.id);
  return NextResponse.json({ userId: user.id });
}
