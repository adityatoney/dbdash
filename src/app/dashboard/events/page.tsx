"use client";

import { useEffect, useState, useCallback } from "react";
import { Calendar, Users, Star } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { EventTypePieChart } from "@/components/charts/event-type-pie-chart";
import { SeasonalRadar } from "@/components/charts/seasonal-radar";
import { YearFilter } from "@/components/filters/year-filter";
import { EventTypeFilter } from "@/components/filters/event-type-filter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { EventDistribution } from "@/types/api";

const totalAttendanceConfig = {
  totalAttendance: {
    label: "Total Attendance",
    color: CHART_COLORS[4],
  },
} satisfies ChartConfig;

interface EventAttendance {
  type: string;
  totalAttendance: number;
  avgAttendance: number;
  totalEvents: number;
}

interface SeasonalData {
  month: string;
  count: number;
}

export default function EventsPage() {
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [distribution, setDistribution] = useState<EventDistribution[] | null>(null);
  const [attendanceByType, setAttendanceByType] = useState<EventAttendance[] | null>(null);
  const [seasonal, setSeasonal] = useState<SeasonalData[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter !== "all") params.set("year", yearFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const queryStr = params.toString();
      const query = queryStr ? `?${queryStr}` : "";

      const [distRes, attRes, seasonalRes] = await Promise.all([
        fetch(`/api/events/distribution${query}`),
        fetch(`/api/events/attendance${query}`),
        fetch(`/api/events/seasonal${query}`),
      ]);
      const [distData, attData, seasonalData] = await Promise.all([
        distRes.json(),
        attRes.json(),
        seasonalRes.json(),
      ]);
      setDistribution(distData);
      setAttendanceByType(attData);
      setSeasonal(seasonalData);
    } catch (error) {
      console.error("Failed to fetch events data:", error);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalEvents = distribution?.reduce((sum, d) => sum + d.count, 0) ?? 0;
  const totalAttendees = attendanceByType?.length
    ? attendanceByType.reduce((sum, d) => sum + d.totalAttendance, 0)
    : 0;
  const mostPopularType = distribution?.length
    ? distribution.reduce((a, b) => (a.count > b.count ? a : b)).type
    : "N/A";

  const filterDescription = [
    yearFilter !== "all" ? yearFilter : null,
    typeFilter !== "all" ? typeFilter : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Event Analytics</h2>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-[180px]">
          <YearFilter
            value={yearFilter}
            onChange={setYearFilter}
            label="Filter by Year"
          />
        </div>
        <div className="w-[200px]">
          <EventTypeFilter
            value={typeFilter}
            onChange={setTypeFilter}
            label="Filter by Event Type"
          />
        </div>
      </div>

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
              title="Total Events"
              value={totalEvents.toLocaleString()}
              icon={Calendar}
              description={filterDescription || "All time"}
            />
            <KpiCard
              title="Total Attendees"
              value={totalAttendees.toLocaleString()}
              icon={Users}
              description={filterDescription || "All time"}
            />
            <KpiCard
              title="Most Popular Type"
              value={mostPopularType}
              icon={Star}
              description="Highest event count"
            />
          </>
        )}
      </div>

      {/* Row 2: Event Distribution Pie */}
      <Card>
        <CardHeader>
          <CardTitle>Event Type Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !distribution ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <EventTypePieChart data={distribution} />
          )}
        </CardContent>
      </Card>

      {/* Row 3: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Total Attendance by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !attendanceByType ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={totalAttendanceConfig} className="min-h-[300px] w-full">
                <BarChart
                  data={attendanceByType}
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
                    dataKey="totalAttendance"
                    fill="var(--color-totalAttendance)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Seasonal Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !seasonal ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <SeasonalRadar data={seasonal} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
