import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const typeParam = request.nextUrl.searchParams.get("type");

    const eventWhere: Record<string, unknown> = {};
    if (yearParam) {
      eventWhere.year = parseInt(yearParam, 10);
    }
    if (typeParam) {
      eventWhere.eventType = { typeName: typeParam };
    }

    const whereClause: Record<string, unknown> = {};
    if (Object.keys(eventWhere).length > 0) {
      whereClause.event = eventWhere;
    }

    const attendances = await prisma.eventAttendance.findMany({
      where: whereClause,
      select: {
        eventId: true,
        event: {
          select: {
            eventTypeId: true,
            eventType: { select: { typeName: true } },
          },
        },
      },
    });

    // Group by event type, then count per event to get average
    const typeEventMap = new Map<
      string,
      { eventIds: Set<number>; totalAttendance: number }
    >();

    for (const att of attendances) {
      const typeName = att.event.eventType.typeName;
      if (!typeEventMap.has(typeName)) {
        typeEventMap.set(typeName, { eventIds: new Set(), totalAttendance: 0 });
      }
      const entry = typeEventMap.get(typeName)!;
      entry.eventIds.add(att.eventId);
      entry.totalAttendance++;
    }

    const result = Array.from(typeEventMap.entries())
      .map(([type, data]) => ({
        type,
        totalAttendance: data.totalAttendance,
        avgAttendance: Math.round(data.totalAttendance / data.eventIds.size),
        totalEvents: data.eventIds.size,
      }))
      .sort((a, b) => b.totalAttendance - a.totalAttendance);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Events attendance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event attendance" },
      { status: 500 }
    );
  }
}
