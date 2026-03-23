import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const typeParam = request.nextUrl.searchParams.get("type");

    const conditions: Prisma.Sql[] = [Prisma.sql`e.start_date IS NOT NULL`];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      conditions.push(Prisma.sql`e.year = ${year}`);
    }
    if (typeParam) {
      conditions.push(Prisma.sql`et.type_name = ${typeParam}`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

    const rows = await prisma.$queryRaw<
      { month: number; count: bigint }[]
    >`
      SELECT EXTRACT(MONTH FROM e.start_date)::int AS month, COUNT(*)::bigint AS count
      FROM events e
      JOIN event_types et ON e.event_type_id = et.type_id
      ${whereClause}
      GROUP BY EXTRACT(MONTH FROM e.start_date)
      ORDER BY month
    `;

    const result = rows.map((r) => ({
      month: r.month,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Events seasonal error:", error);
    return NextResponse.json(
      { error: "Failed to fetch seasonal data" },
      { status: 500 }
    );
  }
}
