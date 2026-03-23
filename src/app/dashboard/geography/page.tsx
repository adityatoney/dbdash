"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Globe, MapPin, Map } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { RegionMap, type RegionView } from "@/components/charts/us-states-map";
import { RadiusSearch } from "@/components/charts/radius-search";
import { YearFilter } from "@/components/filters/year-filter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { StateData, ZoneData } from "@/types/api";

const zoneChartConfig = {
  attendance: {
    label: "Attendance",
    color: CHART_COLORS[0],
  },
} satisfies ChartConfig;

const REGION_LABELS: Record<RegionView, string> = {
  us: "United States",
  canada: "Canada",
};

const REGION_COUNTRY: Record<RegionView, string> = {
  us: "United States",
  canada: "Canada",
};

export default function GeographyPage() {
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<RegionView>("us");
  const [states, setStates] = useState<StateData[] | null>(null);
  const [zones, setZones] = useState<ZoneData[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const yearParam = yearFilter !== "all" ? `?year=${yearFilter}` : "";
      const [statesRes, zonesRes] = await Promise.all([
        fetch(`/api/geography/states${yearParam}`),
        fetch(`/api/geography/zones${yearParam}`),
      ]);
      const [statesData, zonesData] = await Promise.all([
        statesRes.json(),
        zonesRes.json(),
      ]);
      setStates(statesData);
      setZones(zonesData);
    } catch (error) {
      console.error("Failed to fetch geography data:", error);
    } finally {
      setLoading(false);
    }
  }, [yearFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter data by selected region
  const regionData = useMemo(
    () =>
      states?.filter((s) => s.country === REGION_COUNTRY[regionFilter]) ?? [],
    [states, regionFilter]
  );

  const totalRegions = regionData.length;
  const totalMembers = regionData.reduce((sum, s) => sum + s.count, 0);
  const topRegion = regionData.length
    ? regionData.reduce((a, b) => (a.count > b.count ? a : b)).state
    : "N/A";
  const top20 = regionData.slice(0, 20);

  const regionLabel = REGION_LABELS[regionFilter];
  const areaLabel = regionFilter === "us" ? "States" : "Provinces";

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Geography</h2>

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
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Region
            </label>
            <Select
              value={regionFilter}
              onValueChange={(v) => {
                if (v !== null) setRegionFilter(v as RegionView);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="us">United States</SelectItem>
                <SelectItem value="canada">Canada</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              title="Total Members"
              value={totalMembers.toLocaleString()}
              icon={Globe}
              description={
                yearFilter !== "all"
                  ? `${regionLabel} · ${yearFilter}`
                  : regionLabel
              }
            />
            <KpiCard
              title={`${areaLabel} Represented`}
              value={totalRegions}
              icon={MapPin}
              description={
                yearFilter !== "all" ? `In ${yearFilter}` : "All time"
              }
            />
            <KpiCard
              title={`Top ${regionFilter === "us" ? "State" : "Province"}`}
              value={topRegion}
              icon={Map}
              description="Highest member count"
            />
          </>
        )}
      </div>

      {/* Row 2: Region Map */}
      <Card>
        <CardHeader>
          <CardTitle>
            {regionLabel} Member Distribution
            {yearFilter !== "all" ? ` (${yearFilter})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading || !states ? (
            <Skeleton className="h-[400px] w-full" />
          ) : (
            <RegionMap data={states} region={regionFilter} yearFilter={yearFilter} />
          )}
        </CardContent>
      </Card>

      {/* Row 3: 2-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Zone Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !zones ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer
                config={zoneChartConfig}
                className="min-h-[300px] w-full"
              >
                <BarChart
                  data={zones}
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
                    dataKey="zone"
                    tickLine={false}
                    axisLine={false}
                    width={100}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="attendance"
                    fill="var(--color-attendance)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 20 {areaLabel}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !states ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>
                        {regionFilter === "us" ? "State" : "Province"}
                      </TableHead>
                      <TableHead className="text-right">Members</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {top20.map((row, idx) => (
                      <TableRow key={row.state}>
                        <TableCell className="text-muted-foreground">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.state}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.count.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Radius Search */}
      <RadiusSearch />
    </div>
  );
}
