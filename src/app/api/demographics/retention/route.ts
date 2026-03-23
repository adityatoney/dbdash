import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.$queryRaw<
      { bucket: string; count: bigint }[]
    >`
      SELECT sub2.bucket, COUNT(*)::bigint AS count
      FROM (
        SELECT
          CASE
            WHEN event_count = 1 THEN '1 event'
            WHEN event_count BETWEEN 2 AND 3 THEN '2-3 events'
            WHEN event_count BETWEEN 4 AND 5 THEN '4-5 events'
            WHEN event_count BETWEEN 6 AND 10 THEN '6-10 events'
            ELSE '11+ events'
          END AS bucket
        FROM (
          SELECT member_id, COUNT(DISTINCT event_id) AS event_count
          FROM event_attendance
          GROUP BY member_id
        ) sub
      ) sub2
      GROUP BY sub2.bucket
      ORDER BY
        CASE sub2.bucket
          WHEN '1 event' THEN 1
          WHEN '2-3 events' THEN 2
          WHEN '4-5 events' THEN 3
          WHEN '6-10 events' THEN 4
          ELSE 5
        END
    `;

    const result = rows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demographics retention error:", error);
    return NextResponse.json(
      { error: "Failed to fetch retention data" },
      { status: 500 }
    );
  }
}
