import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import zipCoords from "@/data/zip-coords.json";

const coords = zipCoords as unknown as Record<string, [number, number, string, string]>;

type RadiusMemberRow = {
  member_id: number;
  family_id: number;
  mahatma_id: bigint | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  email: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string;
  event_count: bigint;
};

function escapeCsv(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsv(rows: RadiusMemberRow[]) {
  const headers = [
    "member_id",
    "family_id",
    "mahatma_id",
    "first_name",
    "middle_name",
    "last_name",
    "email",
    "phone_primary",
    "phone_secondary",
    "address_line1",
    "address_line2",
    "city",
    "state",
    "zipcode",
    "event_count",
    "member_type",
  ];

  const lines = rows.map((row) =>
    [
      row.member_id,
      row.family_id,
      row.mahatma_id,
      row.first_name,
      row.middle_name,
      row.last_name,
      row.email,
      row.phone_primary,
      row.phone_secondary,
      row.address_line1,
      row.address_line2,
      row.city,
      row.state,
      row.zipcode,
      row.event_count,
      Number(row.event_count) > 1 ? "returning" : "first-time",
    ]
      .map((value) => escapeCsv(value))
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

// Haversine distance in miles
function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const centerZip = params.get("zip");
    const radiusStr = params.get("radius");
    const format = params.get("format");

    if (!centerZip || !radiusStr) {
      return NextResponse.json(
        { error: "zip and radius parameters are required" },
        { status: 400 }
      );
    }

    const centerCoord = coords[centerZip];
    if (!centerCoord) {
      return NextResponse.json(
        { error: `Unknown zip code: ${centerZip}` },
        { status: 400 }
      );
    }

    const [centerLat, centerLng, centerCity, centerState] = centerCoord;
    const radiusMiles = parseFloat(radiusStr);

    // Find all zip codes within radius
    const zipsInRadius: string[] = [];
    for (const [zip, [lat, lng]] of Object.entries(coords)) {
      if (haversine(centerLat, centerLng, lat, lng) <= radiusMiles) {
        zipsInRadius.push(zip);
      }
    }

    if (zipsInRadius.length === 0) {
      if (format === "csv") {
        const csv = buildCsv([]);
        const filename = `radius-members-${centerZip}-${radiusMiles}mi.csv`;
        return new NextResponse(csv, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      return NextResponse.json({
        center: { zip: centerZip, city: centerCity, state: centerState, lat: centerLat, lng: centerLng },
        radius: radiusMiles,
        totalMembers: 0,
        returningMembers: 0,
        newMembers: 0,
        topCities: [],
      });
    }

    // Query members within these zip codes
    // Total unique members (attended at least 1 event)
    const memberRows = await prisma.$queryRaw<RadiusMemberRow[]>`
      SELECT
        ma.member_id,
        m.family_id,
        m.mahatma_id,
        m.first_name,
        m.middle_name,
        m.last_name,
        m.email,
        m.phone_primary,
        m.phone_secondary,
        ma.address_line1,
        ma.address_line2,
        ma.city,
        ma.state,
        COUNT(DISTINCT ea.event_id)::bigint AS event_count,
        ma.zipcode
      FROM member_addresses ma
      JOIN members m ON ma.member_id = m.member_id
      JOIN event_attendance ea ON ma.member_id = ea.member_id
      WHERE ma.is_current = true
        AND ma.country = 'United States'
        AND ma.zipcode = ANY(${zipsInRadius})
      GROUP BY
        ma.member_id,
        m.family_id,
        m.mahatma_id,
        m.first_name,
        m.middle_name,
        m.last_name,
        m.email,
        m.phone_primary,
        m.phone_secondary,
        ma.address_line1,
        ma.address_line2,
        ma.city,
        ma.state,
        ma.zipcode
      ORDER BY COUNT(DISTINCT ea.event_id) DESC, m.last_name ASC, m.first_name ASC
    `;

    if (format === "csv") {
      const csv = buildCsv(memberRows);
      const filename = `radius-members-${centerZip}-${radiusMiles}mi.csv`;
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const totalMembers = memberRows.length;
    const returningMembers = memberRows.filter(
      (r) => Number(r.event_count) > 1
    ).length;
    const newMembers = totalMembers - returningMembers;

    // Aggregate by city for top cities breakdown
    const cityMap = new Map<
      string,
      { total: number; returning: number; lat: number; lng: number }
    >();

    for (const row of memberRows) {
      const coord = coords[row.zipcode];
      if (!coord) continue;
      const [lat, lng, city, state] = coord;
      const key = `${city}, ${state}`;
      if (!cityMap.has(key)) {
        cityMap.set(key, { total: 0, returning: 0, lat, lng });
      }
      const entry = cityMap.get(key)!;
      entry.total++;
      if (Number(row.event_count) > 1) entry.returning++;
    }

    const topCities = Array.from(cityMap.entries())
      .map(([city, data]) => ({
        city,
        total: data.total,
        returning: data.returning,
        new: data.total - data.returning,
        lat: data.lat,
        lng: data.lng,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    return NextResponse.json({
      center: {
        zip: centerZip,
        city: centerCity,
        state: centerState,
        lat: centerLat,
        lng: centerLng,
      },
      radius: radiusMiles,
      totalMembers,
      returningMembers,
      newMembers,
      topCities,
    });
  } catch (error) {
    console.error("Radius search error:", error);
    return NextResponse.json(
      { error: "Failed to perform radius search" },
      { status: 500 }
    );
  }
}
