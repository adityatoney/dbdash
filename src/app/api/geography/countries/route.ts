import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ISO_MAP: Record<string, string> = {
  "United States": "USA",
  "USA": "USA",
  "US": "USA",
  "India": "IND",
  "Canada": "CAN",
  "United Kingdom": "GBR",
  "UK": "GBR",
  "Australia": "AUS",
  "Germany": "DEU",
  "France": "FRA",
  "Japan": "JPN",
  "China": "CHN",
  "Brazil": "BRA",
  "Mexico": "MEX",
  "Italy": "ITA",
  "Spain": "ESP",
  "South Korea": "KOR",
  "Netherlands": "NLD",
  "Singapore": "SGP",
  "New Zealand": "NZL",
  "South Africa": "ZAF",
  "Kenya": "KEN",
  "Nigeria": "NGA",
  "UAE": "ARE",
  "United Arab Emirates": "ARE",
  "Saudi Arabia": "SAU",
  "Thailand": "THA",
  "Malaysia": "MYS",
  "Indonesia": "IDN",
  "Pakistan": "PAK",
  "Bangladesh": "BGD",
  "Sri Lanka": "LKA",
  "Nepal": "NPL",
  "Tanzania": "TZA",
  "Uganda": "UGA",
  "Ghana": "GHA",
  "Zambia": "ZMB",
  "Belgium": "BEL",
  "Switzerland": "CHE",
  "Sweden": "SWE",
  "Norway": "NOR",
  "Denmark": "DNK",
  "Finland": "FIN",
  "Ireland": "IRL",
  "Portugal": "PRT",
  "Austria": "AUT",
  "Poland": "POL",
  "Russia": "RUS",
  "Turkey": "TUR",
  "Israel": "ISR",
  "Philippines": "PHL",
};

export async function GET(request: NextRequest) {
  try {
    const yearParam = request.nextUrl.searchParams.get("year");

    let rows: { country: string; count: bigint }[];

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      // Members who attended events in that year, grouped by their country
      rows = await prisma.$queryRaw`
        SELECT ma.country, COUNT(DISTINCT ea.member_id)::bigint AS count
        FROM event_attendance ea
        JOIN events e ON ea.event_id = e.event_id
        JOIN member_addresses ma ON ea.member_id = ma.member_id AND ma.is_current = true
        WHERE e.year = ${year} AND ma.country IS NOT NULL
        GROUP BY ma.country
        ORDER BY count DESC
      `;
    } else {
      rows = await prisma.$queryRaw`
        SELECT country, COUNT(DISTINCT member_id)::bigint AS count
        FROM member_addresses
        WHERE is_current = true AND country IS NOT NULL
        GROUP BY country
        ORDER BY count DESC
      `;
    }

    const result = rows.map((r) => ({
      country: r.country,
      iso: ISO_MAP[r.country] || null,
      count: Number(r.count),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Geography countries error:", error);
    return NextResponse.json(
      { error: "Failed to fetch country data" },
      { status: 500 }
    );
  }
}
