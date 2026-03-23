"use client";

import { useState, useCallback } from "react";
import { Search, MapPin, Users, UserCheck, UserPlus } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/cards/kpi-card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/constants";

interface RadiusResult {
  center: {
    zip: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  radius: number;
  totalMembers: number;
  returningMembers: number;
  newMembers: number;
  topCities: {
    city: string;
    total: number;
    returning: number;
    new: number;
    lat: number;
    lng: number;
  }[];
}

const chartConfig = {
  returning: {
    label: "Returning (>1 event)",
    color: CHART_COLORS[0],
  },
  new: {
    label: "First-time (1 event)",
    color: CHART_COLORS[1],
  },
} satisfies ChartConfig;

const RADIUS_OPTIONS = [10, 25, 50, 100, 150, 200, 300];

export function RadiusSearch() {
  const [zipInput, setZipInput] = useState("");
  const [radius, setRadius] = useState("50");
  const [result, setResult] = useState<RadiusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    const zip = zipInput.trim();
    if (!zip || zip.length < 5) {
      setError("Please enter a valid 5-digit zip code");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/geography/radius?zip=${zip}&radius=${radius}`
      );
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to fetch radius data");
    } finally {
      setLoading(false);
    }
  }, [zipInput, radius]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // Chart data: top 10 cities as stacked bar
  const chartData =
    result?.topCities.slice(0, 10).map((c) => ({
      city: c.city.split(",")[0], // Just city name, no state
      returning: c.returning,
      new: c.new,
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-5" />
            Radius Search — Event Planning Tool
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Enter a zip code and radius to find how many members live within
            that area. Useful for identifying potential event locations and
            estimating attendance.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Center Zip Code
              </label>
              <input
                type="text"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={handleKeyDown}
                placeholder="e.g. 77479"
                className="flex h-9 w-[140px] rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                maxLength={5}
              />
            </div>
            <div className="space-y-1.5 w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">
                Radius (miles)
              </label>
              <Select value={radius} onValueChange={(v) => { if (v !== null) setRadius(v); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADIUS_OPTIONS.map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r} miles
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleSearch}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Search className="size-4" />
              {loading ? "Searching…" : "Search"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Center info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="size-4" />
            Showing members within{" "}
            <strong className="text-foreground">{result.radius} miles</strong>{" "}
            of{" "}
            <strong className="text-foreground">
              {result.center.city}, {result.center.state} ({result.center.zip})
            </strong>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <KpiCard
              title="Total Members"
              value={result.totalMembers.toLocaleString()}
              icon={Users}
              description="Attended at least 1 event"
            />
            <KpiCard
              title="Returning Members"
              value={result.returningMembers.toLocaleString()}
              icon={UserCheck}
              description="Attended more than 1 event"
              footnote="Members who have attended 2+ events across the entire dataset (2017-2025). These are your most engaged members and likely attendees for a new event."
            />
            <KpiCard
              title="First-time Members"
              value={result.newMembers.toLocaleString()}
              icon={UserPlus}
              description="Attended exactly 1 event"
              footnote="Members who have only attended 1 event so far. They may be re-engageable with a conveniently located event."
            />
          </div>

          {/* Charts + Table */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top cities stacked bar */}
            <Card>
              <CardHeader>
                <CardTitle>Top 10 Cities</CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ChartContainer
                    config={chartConfig}
                    className="min-h-[350px] w-full"
                  >
                    <BarChart
                      data={chartData}
                      layout="vertical"
                      margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v.toLocaleString()}
                      />
                      <YAxis
                        type="category"
                        dataKey="city"
                        tickLine={false}
                        axisLine={false}
                        width={110}
                        tick={{ fontSize: 12 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Bar
                        dataKey="returning"
                        stackId="a"
                        fill="var(--color-returning)"
                        name="Returning (>1 event)"
                        radius={[0, 0, 0, 0]}
                      />
                      <Bar
                        dataKey="new"
                        stackId="a"
                        fill="var(--color-new)"
                        name="First-time (1 event)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No city data available
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Detailed table */}
            <Card>
              <CardHeader>
                <CardTitle>Top 20 Cities Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Returning</TableHead>
                        <TableHead className="text-right">New</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.topCities.map((city, idx) => (
                        <TableRow key={city.city}>
                          <TableCell className="text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="font-medium">
                            {city.city}
                          </TableCell>
                          <TableCell className="text-right">
                            {city.total.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {city.returning.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {city.new.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
