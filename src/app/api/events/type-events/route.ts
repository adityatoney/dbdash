import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const typeParam = request.nextUrl.searchParams.get("type");

    if (!typeParam) {
      return NextResponse.json(
        { error: "type parameter is required" },
        { status: 400 }
      );
    }

    const conditions: Prisma.Sql[] = [Prisma.sql`et.type_name = ${typeParam}`];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      conditions.push(Prisma.sql`e.year = ${year}`);
    }

    const rows = await prisma.$queryRaw<
      {
        event_id: number;
        event_name: string;
        year: number;
        start_date: Date | null;
        end_date: Date | null;
        attendance: bigint;
      }[]
    >`
      SELECT
        e.event_id,
        e.event_name,
        e.year,
        e.start_date,
        e.end_date,
        COUNT(ea.attendance_id)::bigint AS attendance
      FROM events e
      JOIN event_types et ON e.event_type_id = et.event_type_id
      LEFT JOIN event_attendance ea ON e.event_id = ea.event_id
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY e.event_id, e.event_name, e.year, e.start_date, e.end_date
      ORDER BY attendance DESC, e.start_date DESC NULLS LAST, e.event_name ASC
    `;

    return NextResponse.json(
      rows.map((row) => ({
        eventId: row.event_id,
        eventName: row.event_name,
        year: row.year,
        startDate: row.start_date?.toISOString() ?? null,
        endDate: row.end_date?.toISOString() ?? null,
        attendance: Number(row.attendance),
      }))
    );
  } catch (error) {
    console.error("Events type events error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events for type" },
      { status: 500 }
    );
  }
}
