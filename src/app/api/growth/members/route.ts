import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { year: number; newMembers: bigint }[]
    >`
      SELECT first_year AS year, COUNT(*)::bigint AS "newMembers"
      FROM (
        SELECT ea.member_id, MIN(e.year) AS first_year
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        WHERE e.year > 0
        GROUP BY ea.member_id
      ) sub
      GROUP BY first_year
      ORDER BY first_year
    `;

    const result = rows.map((r) => ({
      year: r.year,
      count: Number(r.newMembers),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Growth members error:", error);
    return NextResponse.json(
      { error: "Failed to fetch member growth" },
      { status: 500 }
    );
  }
}
