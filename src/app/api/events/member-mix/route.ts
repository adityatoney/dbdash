import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");
    const typeParam = request.nextUrl.searchParams.get("type");

    const conditions: Prisma.Sql[] = [Prisma.sql`awd.event_at IS NOT NULL`];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      conditions.push(Prisma.sql`awd.year = ${year}`);
    }

    if (typeParam) {
      conditions.push(Prisma.sql`awd.type_name = ${typeParam}`);
    }

    const filteredWhere = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

    const rows = await prisma.$queryRaw<
      {
        type: string;
        total_members: bigint;
        new_members: bigint;
        returning_members: bigint;
      }[]
    >`
      WITH attendance_with_dates AS (
        SELECT
          ea.member_id,
          et.type_name,
          CASE
            WHEN e.start_date IS NOT NULL THEN e.start_date
            WHEN e.year >= 1 THEN make_date(e.year, 1, 1)::timestamp
            ELSE NULL
          END AS event_at,
          e.year
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN event_types et ON e.event_type_id = et.event_type_id
      ),
      member_first_event AS (
        SELECT
          awd.member_id,
          MIN(awd.event_at) AS first_event_at
        FROM attendance_with_dates awd
        WHERE awd.event_at IS NOT NULL
        GROUP BY awd.member_id
      ),
      scoped_member_type AS (
        SELECT
          awd.type_name AS type,
          awd.member_id,
          MIN(awd.event_at) AS first_type_event_at
        FROM attendance_with_dates awd
        ${filteredWhere}
        GROUP BY awd.type_name, awd.member_id
      )
      SELECT
        smt.type,
        COUNT(*)::bigint AS total_members,
        COUNT(*) FILTER (WHERE mfe.first_event_at = smt.first_type_event_at)::bigint AS new_members,
        COUNT(*) FILTER (WHERE mfe.first_event_at < smt.first_type_event_at)::bigint AS returning_members
      FROM scoped_member_type smt
      JOIN member_first_event mfe ON smt.member_id = mfe.member_id
      GROUP BY smt.type
      ORDER BY total_members DESC, smt.type ASC
    `;

    const result = rows.map((row) => ({
      type: row.type,
      totalMembers: Number(row.total_members),
      newMembers: Number(row.new_members),
      returningMembers: Number(row.returning_members),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Events member mix error:", error);
    return NextResponse.json(
      { error: "Failed to fetch event member mix" },
      { status: 500 }
    );
  }
}
