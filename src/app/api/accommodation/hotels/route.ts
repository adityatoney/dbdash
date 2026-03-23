import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { hotel: string; bookings: bigint }[]
    >`
      SELECT h.hotel_name AS hotel, COUNT(rb.booking_id)::bigint AS bookings
      FROM room_bookings rb
      JOIN hotels h ON rb.hotel_id = h.hotel_id
      GROUP BY h.hotel_name
      ORDER BY bookings DESC
    `;

    const result = rows.map((r) => ({
      hotel: r.hotel,
      bookings: Number(r.bookings),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Accommodation hotels error:", error);
    return NextResponse.json(
      { error: "Failed to fetch hotel data" },
      { status: 500 }
    );
  }
}
