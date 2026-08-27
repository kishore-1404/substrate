import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { setSessionCookie } from "@/lib/auth";

// Powers the sidebar's "switch user" list — an internal-tool convenience,
// not a real account picker. Lists every account, no auth boundary between
// them (matches the mockup's fixed-demo-user switcher, generalized to real
// accounts).
export async function GET() {
  const rows = await db.select({ id: users.id, name: users.name }).from(users);
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const { userId } = (await req.json()) as { userId?: string };
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  await setSessionCookie(userId);
  return NextResponse.json({ ok: true });
}
