import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import zipCoords from "@/data/zip-coords.json";

const coords = zipCoords as unknown as Record<string, [number, number, string, string]>;

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
    const memberRows = await prisma.$queryRaw<
      { member_id: number; event_count: bigint; zipcode: string }[]
    >`
      SELECT
        ma.member_id,
        COUNT(DISTINCT ea.event_id)::bigint AS event_count,
        ma.zipcode
      FROM member_addresses ma
      JOIN event_attendance ea ON ma.member_id = ea.member_id
      WHERE ma.is_current = true
        AND ma.country = 'United States'
        AND ma.zipcode = ANY(${zipsInRadius})
      GROUP BY ma.member_id, ma.zipcode
    `;

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
