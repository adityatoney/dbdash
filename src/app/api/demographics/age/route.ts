import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");

    let rows: { bucket: string; count: bigint }[];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      rows = await prisma.$queryRaw`
        SELECT sub.bucket, COUNT(*)::bigint AS count FROM (
          SELECT
            CASE
              WHEN ea.age_at_event BETWEEN 0 AND 10 THEN '0-10'
              WHEN ea.age_at_event BETWEEN 11 AND 17 THEN '11-17'
              WHEN ea.age_at_event BETWEEN 18 AND 25 THEN '18-25'
              WHEN ea.age_at_event BETWEEN 26 AND 35 THEN '26-35'
              WHEN ea.age_at_event BETWEEN 36 AND 45 THEN '36-45'
              WHEN ea.age_at_event BETWEEN 46 AND 55 THEN '46-55'
              WHEN ea.age_at_event BETWEEN 56 AND 65 THEN '56-65'
              ELSE '65+'
            END AS bucket
          FROM event_attendance ea
          JOIN events e ON ea.event_id = e.event_id
          WHERE ea.age_at_event IS NOT NULL AND e.year = ${year}
        ) sub
        GROUP BY sub.bucket
        ORDER BY
          CASE sub.bucket
            WHEN '0-10' THEN 1 WHEN '11-17' THEN 2 WHEN '18-25' THEN 3
            WHEN '26-35' THEN 4 WHEN '36-45' THEN 5 WHEN '46-55' THEN 6
            WHEN '56-65' THEN 7 ELSE 8
          END
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT sub.bucket, COUNT(*)::bigint AS count FROM (
          SELECT
            CASE
              WHEN age_at_event BETWEEN 0 AND 10 THEN '0-10'
              WHEN age_at_event BETWEEN 11 AND 17 THEN '11-17'
              WHEN age_at_event BETWEEN 18 AND 25 THEN '18-25'
              WHEN age_at_event BETWEEN 26 AND 35 THEN '26-35'
              WHEN age_at_event BETWEEN 36 AND 45 THEN '36-45'
              WHEN age_at_event BETWEEN 46 AND 55 THEN '46-55'
              WHEN age_at_event BETWEEN 56 AND 65 THEN '56-65'
              ELSE '65+'
            END AS bucket
          FROM event_attendance
          WHERE age_at_event IS NOT NULL
        ) sub
        GROUP BY sub.bucket
        ORDER BY
          CASE sub.bucket
            WHEN '0-10' THEN 1 WHEN '11-17' THEN 2 WHEN '18-25' THEN 3
            WHEN '26-35' THEN 4 WHEN '36-45' THEN 5 WHEN '46-55' THEN 6
            WHEN '56-65' THEN 7 ELSE 8
          END
      `;
    }

    const result = rows.map((r) => ({
      bucket: r.bucket,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Demographics age error:", error);
    return NextResponse.json(
      { error: "Failed to fetch age demographics" },
      { status: 500 }
    );
  }
}
