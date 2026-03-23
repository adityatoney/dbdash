import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      {
        year: number;
        total: bigint;
        new_members: bigint;
        returning_members: bigint;
      }[]
    >`
      WITH first_years AS (
        SELECT ea.member_id, MIN(e.year) AS first_year
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        WHERE e.year > 0
        GROUP BY ea.member_id
      ),
      yearly_attendees AS (
        SELECT DISTINCT e.year, ea.member_id
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        WHERE e.year > 0
      )
      SELECT
        ya.year,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE fy.first_year = ya.year)::bigint AS new_members,
        COUNT(*) FILTER (WHERE fy.first_year < ya.year)::bigint AS returning_members
      FROM yearly_attendees ya
      JOIN first_years fy ON ya.member_id = fy.member_id
      GROUP BY ya.year
      ORDER BY ya.year
    `;

    const result = rows.map((r) => ({
      year: r.year,
      total: Number(r.total),
      newMembers: Number(r.new_members),
      returningMembers: Number(r.returning_members),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Growth retention error:", error);
    return NextResponse.json(
      { error: "Failed to fetch retention data" },
      { status: 500 }
    );
  }
}
