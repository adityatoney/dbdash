import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { column: string; year: number; nullPct: number }[]
    >`
      SELECT column_name AS column, year, null_pct AS "nullPct"
      FROM (
        -- members: mahatma_id
        SELECT 'mahatma_id' AS column_name, e.year,
          ROUND(100.0 * COUNT(CASE WHEN m.mahatma_id IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1) AS null_pct
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- members: middle_name
        SELECT 'middle_name', e.year,
          ROUND(100.0 * COUNT(CASE WHEN m.middle_name IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- members: email
        SELECT 'email', e.year,
          ROUND(100.0 * COUNT(CASE WHEN m.email IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- members: phone_primary
        SELECT 'phone_primary', e.year,
          ROUND(100.0 * COUNT(CASE WHEN m.phone_primary IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- members: photo_filename
        SELECT 'photo_filename', e.year,
          ROUND(100.0 * COUNT(CASE WHEN m.photo_filename IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN members m ON ea.member_id = m.member_id
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- event_attendance: checked_in_time_utc
        SELECT 'checked_in_time_utc', e.year,
          ROUND(100.0 * COUNT(CASE WHEN ea.checked_in_time_utc IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        GROUP BY e.year

        UNION ALL

        -- room_bookings: hotel_id (attendance rows without booking or booking without hotel)
        SELECT 'hotel_id', e.year,
          ROUND(100.0 * COUNT(CASE WHEN rb.hotel_id IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        LEFT JOIN room_bookings rb ON ea.member_id = rb.member_id AND ea.event_id = rb.event_id
        GROUP BY e.year

        UNION ALL

        -- room_bookings: room_type_id
        SELECT 'room_type_id', e.year,
          ROUND(100.0 * COUNT(CASE WHEN rb.room_type_id IS NULL THEN 1 END) / NULLIF(COUNT(*), 0), 1)
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        LEFT JOIN room_bookings rb ON ea.member_id = rb.member_id AND ea.event_id = rb.event_id
        GROUP BY e.year
      ) sub
      ORDER BY column_name, year
    `;

    const result = rows.map((r) => ({
      column: r.column,
      year: r.year,
      nullPct: Number(r.nullPct),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Data quality error:", error);
    return NextResponse.json(
      { error: "Failed to fetch data quality metrics" },
      { status: 500 }
    );
  }
}
