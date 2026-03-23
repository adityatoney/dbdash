import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const records = await prisma.$queryRaw<{ year: number; count: bigint }[]>`
      SELECT EXTRACT(YEAR FROM gnan_date)::int AS year, COUNT(*)::bigint AS count
      FROM gnan_records
      WHERE gnan_date IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM gnan_date)
      ORDER BY year
    `;

    const result = records.map((r) => ({
      year: r.year,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Growth gnan error:", error);
    return NextResponse.json(
      { error: "Failed to fetch gnan growth" },
      { status: 500 }
    );
  }
}
