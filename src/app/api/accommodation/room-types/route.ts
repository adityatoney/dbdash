import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { type: string; count: bigint }[]
    >`
      SELECT rt.canonical_name AS type, COUNT(rb.booking_id)::bigint AS count
      FROM room_bookings rb
      JOIN room_types rt ON rb.room_type_id = rt.room_type_id
      GROUP BY rt.canonical_name
      ORDER BY count DESC
    `;

    const result = rows.map((r) => ({
      type: r.type,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Accommodation room-types error:", error);
    return NextResponse.json(
      { error: "Failed to fetch room type data" },
      { status: 500 }
    );
  }
}
