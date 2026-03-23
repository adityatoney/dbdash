import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const eventType = request.nextUrl.searchParams.get("eventType");

    const whereClause: Record<string, unknown> = {};
    if (eventType) {
      whereClause.event = {
        eventType: { typeName: eventType },
      };
    }

    const attendances = await prisma.eventAttendance.findMany({
      where: whereClause,
      select: {
        memberId: true,
        event: {
          select: {
            year: true,
            isGpEvent: true,
          },
        },
      },
    });

    const yearMap = new Map<
      number,
      { members: Set<number>; gpMembers: Set<number> }
    >();

    for (const att of attendances) {
      const year = att.event.year;
      if (!yearMap.has(year)) {
        yearMap.set(year, { members: new Set(), gpMembers: new Set() });
      }
      const entry = yearMap.get(year)!;
      entry.members.add(att.memberId);
      if (att.event.isGpEvent) {
        entry.gpMembers.add(att.memberId);
      }
    }

    const result = Array.from(yearMap.entries())
      .map(([year, data]) => ({
        year,
        total: data.members.size,
        gpAttendance: data.gpMembers.size,
      }))
      .sort((a, b) => a.year - b.year);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Growth attendance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance growth" },
      { status: 500 }
    );
  }
}
