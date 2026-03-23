"use client";

import { useEffect, useState } from "react";
import { BedDouble, Building, Hotel } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { RoomUtilizationBar } from "@/components/charts/room-utilization-bar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/constants";
import type {
  RoomUtilization,
  RoomTypePreference,
  HotelComparison,
} from "@/types/api";

const roomTypeConfig = {
  count: {
    label: "Bookings",
    color: CHART_COLORS[3],
  },
} satisfies ChartConfig;

export default function AccommodationPage() {
  const [utilization, setUtilization] = useState<RoomUtilization[] | null>(null);
  const [roomTypes, setRoomTypes] = useState<RoomTypePreference[] | null>(null);
  const [hotels, setHotels] = useState<HotelComparison[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [utilRes, roomRes, hotelRes] = await Promise.all([
          fetch("/api/accommodation/utilization"),
          fetch("/api/accommodation/room-types"),
          fetch("/api/accommodation/hotels"),
        ]);
        const [utilData, roomData, hotelData] = await Promise.all([
          utilRes.json(),
          roomRes.json(),
          hotelRes.json(),
        ]);
        setUtilization(utilData);
        setRoomTypes(roomData);
        setHotels(hotelData);
      } catch (error) {
        console.error("Failed to fetch accommodation data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const totalBookings = utilization?.reduce((sum, d) => sum + d.booked, 0) ?? 0;
  const mostPopularRoom = roomTypes?.length
    ? roomTypes.reduce((a, b) => (a.count > b.count ? a : b)).type
    : "N/A";
  const topHotel = hotels?.length
    ? hotels.reduce((a, b) => (a.bookings > b.bookings ? a : b)).hotel
    : "N/A";

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Accommodation</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Total Room Bookings"
              value={totalBookings.toLocaleString()}
              icon={BedDouble}
              description="Across all events"
            />
            <KpiCard
              title="Most Popular Room Type"
              value={mostPopularRoom}
              icon={Building}
              description="Highest booking count"
            />
            <KpiCard
              title="Top Hotel"
              value={topHotel}
              icon={Hotel}
              description="Most bookings"
            />
          </>
        )}
      </div>

      {/* Row 2: Room Utilization */}
      <Card>
        <CardHeader>
          <CardTitle>Room Utilization</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !utilization ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <RoomUtilizationBar data={utilization} />
          )}
        </CardContent>
      </Card>

      {/* Row 3: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Room Type Preferences</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !roomTypes ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={roomTypeConfig} className="min-h-[300px] w-full">
                <BarChart
                  data={roomTypes}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="count"
                    fill="var(--color-count)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hotel Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !hotels ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Hotel</TableHead>
                      <TableHead className="text-right">Bookings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hotels.map((hotel, idx) => (
                      <TableRow key={hotel.hotel}>
                        <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium">{hotel.hotel}</TableCell>
                        <TableCell className="text-right">{hotel.bookings.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
