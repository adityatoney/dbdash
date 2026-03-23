import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const byYear = request.nextUrl.searchParams.get("byYear") === "true";

    if (byYear) {
      const rows = await prisma.$queryRaw<
        { year: number; male: bigint; female: bigint }[]
      >`
        SELECT
          e.year,
          COUNT(CASE WHEN m.gender = 'M' THEN 1 END)::bigint AS male,
          COUNT(CASE WHEN m.gender = 'F' THEN 1 END)::bigint AS female
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year
        ORDER BY e.year
      `;

      const result = rows.map((r) => ({
        year: r.year,
        male: Number(r.male),
        female: Number(r.female),
      }));

      return NextResponse.json(result);
    }

    // Overall counts
    const genderCounts = await prisma.member.groupBy({
      by: ["gender"],
      _count: { memberId: true },
    });

    let male = 0;
    let female = 0;
    for (const g of genderCounts) {
      if (g.gender === "M") male = g._count.memberId;
      if (g.gender === "F") female = g._count.memberId;
    }

    return NextResponse.json({ male, female });
  } catch (error) {
    console.error("Demographics gender error:", error);
    return NextResponse.json(
      { error: "Failed to fetch gender demographics" },
      { status: 500 }
    );
  }
}
