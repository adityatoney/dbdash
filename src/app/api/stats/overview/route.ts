import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [totalMembers, totalFamilies, totalEvents, totalAttendance, totalGnan] =
      await Promise.all([
        prisma.member.count(),
        prisma.family.count(),
        prisma.event.count(),
        prisma.eventAttendance.count(),
        prisma.gnanRecord.count(),
      ]);

    // Get GP attendance by year (aggregate all GP events per year)
    const gpByYear = await prisma.$queryRaw<
      { year: number; attendance: bigint }[]
    >`
      SELECT e.year, COUNT(DISTINCT ea.member_id)::bigint AS attendance
      FROM event_attendance ea
      JOIN events e ON ea.event_id = e.event_id
      WHERE e.is_gp_event = true AND e.year > 0
      GROUP BY e.year
      ORDER BY e.year DESC
      LIMIT 2
    `;

    let latestGPAttendance = 0;
    let gpGrowthPct = 0;

    if (gpByYear.length >= 1) {
      latestGPAttendance = Number(gpByYear[0].attendance);
    }

    if (gpByYear.length >= 2) {
      const prev = Number(gpByYear[1].attendance);
      if (prev > 0) {
        gpGrowthPct = parseFloat(
          (((latestGPAttendance - prev) / prev) * 100).toFixed(1)
        );
      }
    }

    return NextResponse.json({
      totalMembers,
      totalFamilies,
      totalEvents,
      totalAttendance,
      latestGPAttendance,
      gpGrowthPct,
      totalGnan,
    });
  } catch (error) {
    console.error("Stats overview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch overview stats" },
      { status: 500 }
    );
  }
}
