import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");

    let rows: { state: string; country: string; count: bigint }[];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      rows = await prisma.$queryRaw`
        SELECT ma.state, ma.country, COUNT(DISTINCT ea.member_id)::bigint AS count
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN member_addresses ma ON ea.member_id = ma.member_id AND ma.is_current = true
        WHERE e.year = ${year} AND ma.state IS NOT NULL AND ma.country IN ('United States', 'Canada')
        GROUP BY ma.state, ma.country
        ORDER BY count DESC
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT state, country, COUNT(DISTINCT member_id)::bigint AS count
        FROM member_addresses
        WHERE is_current = true AND state IS NOT NULL AND country IN ('United States', 'Canada')
        GROUP BY state, country
        ORDER BY count DESC
      `;
    }

    const result = rows.map((r) => ({
      state: r.state,
      country: r.country,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Geography states error:", error);
    return NextResponse.json(
      { error: "Failed to fetch state data" },
      { status: 500 }
    );
  }
}
