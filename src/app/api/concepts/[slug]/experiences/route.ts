import { NextRequest, NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { concepts, experiences } from "@/lib/db/schema";

// Powers the Experience player's version switcher — every generated variant
// for this concept (canonical + each "explain differently" request),
// oldest first so "Original" is always index 0.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [concept] = await db.select().from(concepts).where(eq(concepts.slug, slug));
  if (!concept) return NextResponse.json({ error: "concept not found" }, { status: 404 });

  const rows = await db
    .select({
      id: experiences.id,
      title: experiences.title,
      generationRequest: experiences.generationRequest,
      createdAt: experiences.createdAt,
    })
    .from(experiences)
    .where(eq(experiences.conceptId, concept.id))
    .orderBy(asc(experiences.createdAt));

  return NextResponse.json({ versions: rows });
}
