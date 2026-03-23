import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import zip2fips from "@/data/zip2fips.json";
import stateFips from "@/data/state-fips.json";

const zipToFips = zip2fips as Record<string, string>;
const stateToFips = stateFips as Record<string, string>;

export async function GET(request: NextRequest) {
  try {
    const state = request.nextUrl.searchParams.get("state");
    const yearParam = request.nextUrl.searchParams.get("year");

    if (!state) {
      return NextResponse.json(
        { error: "state parameter is required" },
        { status: 400 }
      );
    }

    const stateFipsCode = stateToFips[state];
    if (!stateFipsCode) {
      return NextResponse.json(
        { error: `Unknown state: ${state}` },
        { status: 400 }
      );
    }

    // Get member zip codes for the given state
    let rows: { zipcode: string; count: bigint }[];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      rows = await prisma.$queryRaw`
        SELECT ma.zipcode, COUNT(DISTINCT ea.member_id)::bigint AS count
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN member_addresses ma ON ea.member_id = ma.member_id AND ma.is_current = true
        WHERE e.year = ${year}
          AND ma.state = ${state}
          AND ma.country = 'United States'
          AND ma.zipcode IS NOT NULL
        GROUP BY ma.zipcode
        ORDER BY count DESC
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT zipcode, COUNT(DISTINCT member_id)::bigint AS count
        FROM member_addresses
        WHERE is_current = true
          AND state = ${state}
          AND country = 'United States'
          AND zipcode IS NOT NULL
        GROUP BY zipcode
        ORDER BY count DESC
      `;
    }

    // Aggregate zip codes into county FIPS codes
    const countyMap = new Map<string, number>();

    for (const row of rows) {
      const fips = zipToFips[row.zipcode];
      if (fips && fips.startsWith(stateFipsCode)) {
        const current = countyMap.get(fips) ?? 0;
        countyMap.set(fips, current + Number(row.count));
      }
    }

    const result = Array.from(countyMap.entries())
      .map(([fips, count]) => ({ fips, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      state,
      stateFips: stateFipsCode,
      counties: result,
    });
  } catch (error) {
    console.error("Geography counties error:", error);
    return NextResponse.json(
      { error: "Failed to fetch county data" },
      { status: 500 }
    );
  }
}
