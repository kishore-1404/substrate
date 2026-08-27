import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { name, email, password } = (await req.json()) as { name?: string; email?: string; password?: string };
  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json({ error: "name, email, and password are required" }, { status: 400 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });

  const [user] = await db
    .insert(users)
    .values({ name: name.trim(), email: email.trim(), passwordHash: hashPassword(password) })
    .returning();

  await setSessionCookie(user.id);
  return NextResponse.json({ userId: user.id });
}
