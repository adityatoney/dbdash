import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const typeParam = request.nextUrl.searchParams.get("type");

    // Build where clause for events
    const whereClause: Record<string, unknown> = {};
    if (yearParam) {
      whereClause.year = parseInt(yearParam, 10);
    }
    if (typeParam) {
      whereClause.eventType = { typeName: typeParam };
    }

    const events = await prisma.event.groupBy({
      by: ["eventTypeId"],
      where: whereClause,
      _count: { eventId: true },
    });

    const totalEvents = events.reduce((sum, e) => sum + e._count.eventId, 0);

    const eventTypeIds = events.map((e) => e.eventTypeId);
    const eventTypes = await prisma.eventType.findMany({
      where: { eventTypeId: { in: eventTypeIds } },
    });
    const typeMap = new Map(
      eventTypes.map((t) => [t.eventTypeId, t.typeName])
    );

    const result = events
      .map((e) => ({
        type: typeMap.get(e.eventTypeId) || "Unknown",
        count: e._count.eventId,
        percentage: totalEvents > 0
          ? parseFloat(((e._count.eventId / totalEvents) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Events distribution error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event distribution" },
      { status: 500 }
    );
  }
}
