import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      {
        event: string;
        year: number;
        booked: bigint;
        total: bigint;
      }[]
    >`
      SELECT
        e.event_name AS event,
        e.year,
        COUNT(CASE WHEN rb.room_booked = true THEN 1 END)::bigint AS booked,
        COUNT(rb.booking_id)::bigint AS total
      FROM room_bookings rb
      JOIN events e ON rb.event_id = e.event_id
      WHERE e.is_gp_event = true
      GROUP BY e.event_name, e.year
      ORDER BY e.year
    `;

    const result = rows.map((r) => ({
      event: r.event,
      year: r.year,
      booked: Number(r.booked),
      rate:
        Number(r.total) > 0
          ? parseFloat(
              ((Number(r.booked) / Number(r.total)) * 100).toFixed(1)
            )
          : 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Accommodation utilization error:", error);
    return NextResponse.json(
      { error: "Failed to fetch utilization data" },
      { status: 500 }
    );
  }
}
