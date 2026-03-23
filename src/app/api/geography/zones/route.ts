import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");

    let rows: { zone: string; attendance: bigint }[];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      rows = await prisma.$queryRaw`
        SELECT z.zone_name AS zone, COUNT(ea.attendance_id)::bigint AS attendance
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN zones z ON e.zone_id = z.zone_id
        WHERE e.year = ${year}
        GROUP BY z.zone_name
        ORDER BY attendance DESC
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT z.zone_name AS zone, COUNT(ea.attendance_id)::bigint AS attendance
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN zones z ON e.zone_id = z.zone_id
        GROUP BY z.zone_name
        ORDER BY attendance DESC
      `;
    }

    const result = rows.map((r) => ({
      zone: r.zone,
      attendance: Number(r.attendance),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Geography zones error:", error);
    return NextResponse.json(
      { error: "Failed to fetch zone data" },
      { status: 500 }
    );
  }
}
