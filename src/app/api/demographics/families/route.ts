import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const families = await prisma.family.groupBy({
      by: ["memberCount"],
      _count: { familyId: true },
      orderBy: { memberCount: "asc" },
    });

    const result = families.map((f) => ({
      size: f.memberCount,
      count: f._count.familyId,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demographics families error:", error);
    return NextResponse.json(
      { error: "Failed to fetch family demographics" },
      { status: 500 }
    );
  }
}
