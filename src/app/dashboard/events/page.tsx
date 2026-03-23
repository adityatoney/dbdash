"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Calendar, Users, Star } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { EventTypePieChart } from "@/components/charts/event-type-pie-chart";
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
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CHART_COLORS } from "@/lib/constants";
import type { EventDistribution } from "@/types/api";

const totalAttendanceConfig = {
  totalAttendance: {
    label: "Total Attendance",
    color: CHART_COLORS[4],
  },
} satisfies ChartConfig;

const memberMixConfig = {
  newMembers: {
    label: "New Members",
    color: CHART_COLORS[1],
  },
  returningMembers: {
    label: "Returning Members",
    color: CHART_COLORS[0],
  },
} satisfies ChartConfig;

interface EventAttendance {
  type: string;
  totalAttendance: number;
  avgAttendance: number;
  totalEvents: number;
}

interface MemberMixData {
  type: string;
  totalMembers: number;
  newMembers: number;
  returningMembers: number;
}

interface TypeEventData {
  eventId: number;
  eventName: string;
  year: number;
  startDate: string | null;
  endDate: string | null;
  attendance: number;
}

type BreakdownSortKey = "date" | "year" | "attendance";
type BreakdownSortDirection = "asc" | "desc";

export default function EventsPage() {
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [distribution, setDistribution] = useState<EventDistribution[] | null>(null);
  const [attendanceByType, setAttendanceByType] = useState<EventAttendance[] | null>(null);
  const [memberMix, setMemberMix] = useState<MemberMixData[] | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [typeEvents, setTypeEvents] = useState<TypeEventData[] | null>(null);
  const [typeEventsLoading, setTypeEventsLoading] = useState(false);
  const [breakdownSort, setBreakdownSort] = useState<{
    key: BreakdownSortKey;
    direction: BreakdownSortDirection;
  }>({
    key: "attendance",
    direction: "desc",
  });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter !== "all") params.set("year", yearFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const queryStr = params.toString();
      const query = queryStr ? `?${queryStr}` : "";

      const [distRes, attRes, memberMixRes] = await Promise.all([
        fetch(`/api/events/distribution${query}`),
        fetch(`/api/events/attendance${query}`),
        fetch(`/api/events/member-mix${query}`),
      ]);
      const [distData, attData, memberMixData] = await Promise.all([
        distRes.json(),
        attRes.json(),
        memberMixRes.json(),
      ]);
      setDistribution(distData);
      setAttendanceByType(attData);
      setMemberMix(Array.isArray(memberMixData) ? memberMixData : []);
    } catch (error) {
      console.error("Failed to fetch events data:", error);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (typeFilter !== "all") {
      setSelectedType(typeFilter);
      return;
    }

    setSelectedType(null);
    setTypeEvents(null);
  }, [typeFilter]);

  useEffect(() => {
    if (!selectedType) {
      setTypeEvents(null);
      return;
    }

    let cancelled = false;

    async function fetchTypeEvents() {
      setTypeEventsLoading(true);
      try {
        const params = new URLSearchParams({ type: selectedType });
        if (yearFilter !== "all") params.set("year", yearFilter);

        const res = await fetch(`/api/events/type-events?${params.toString()}`);
        const data = await res.json();

        if (!cancelled) {
          setTypeEvents(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to fetch type event details:", error);
        if (!cancelled) {
          setTypeEvents([]);
        }
      } finally {
        if (!cancelled) {
          setTypeEventsLoading(false);
        }
      }
    }

    fetchTypeEvents();

    return () => {
      cancelled = true;
    };
  }, [selectedType, yearFilter]);

  const handleTypeSelect = useCallback((payload?: { type?: string }) => {
    if (!payload?.type) return;
    setSelectedType(payload.type);
  }, []);

  const formatEventDate = useCallback((dateValue: string | null) => {
    if (!dateValue) return "Date unavailable";
    return new Date(dateValue).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, []);

  const handleBreakdownSort = useCallback((key: BreakdownSortKey) => {
    setBreakdownSort((current) => {
      if (current.key === key) {
        return {
          key,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }

      return {
        key,
        direction: key === "attendance" ? "desc" : "asc",
      };
    });
  }, []);

  const renderSortIcon = useCallback(
    (key: BreakdownSortKey) => {
      if (breakdownSort.key !== key) {
        return <ArrowUpDown className="size-3.5 text-muted-foreground/70" />;
      }

      return breakdownSort.direction === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : (
        <ArrowDown className="size-3.5" />
      );
    },
    [breakdownSort.direction, breakdownSort.key]
  );

  const sortedTypeEvents = useMemo(() => {
    if (!typeEvents) return null;

    const getTimestamp = (dateValue: string | null) =>
      dateValue ? new Date(dateValue).getTime() : Number.NEGATIVE_INFINITY;

    return [...typeEvents].sort((a, b) => {
      switch (breakdownSort.key) {
        case "date":
          if (breakdownSort.direction === "desc") {
            return (
              getTimestamp(b.startDate) - getTimestamp(a.startDate) ||
              b.year - a.year ||
              a.eventName.localeCompare(b.eventName)
            );
          }
          return (
            getTimestamp(a.startDate) - getTimestamp(b.startDate) ||
            a.year - b.year ||
            a.eventName.localeCompare(b.eventName)
          );
        case "year":
          if (breakdownSort.direction === "desc") {
            return (
              b.year - a.year ||
              getTimestamp(b.startDate) - getTimestamp(a.startDate) ||
              a.eventName.localeCompare(b.eventName)
            );
          }
          return (
            a.year - b.year ||
            getTimestamp(a.startDate) - getTimestamp(b.startDate) ||
            a.eventName.localeCompare(b.eventName)
          );
        default:
          if (breakdownSort.direction === "asc") {
            return a.attendance - b.attendance || a.eventName.localeCompare(b.eventName);
          }
          return b.attendance - a.attendance || a.eventName.localeCompare(b.eventName);
      }
    });
  }, [breakdownSort, typeEvents]);

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
                    onClick={(data) => handleTypeSelect(data as { type?: string })}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>New vs Returning Mix by Event Type</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !memberMix ? (
              <Skeleton className="h-[300px] w-full" />
            ) : memberMix.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No member mix data available for the selected filters.
              </p>
            ) : (
              <ChartContainer config={memberMixConfig} className="min-h-[300px] w-full">
                <BarChart
                  data={memberMix}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 80, bottom: 5 }}
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
                    dataKey="returningMembers"
                    stackId="members"
                    fill="var(--color-returningMembers)"
                    radius={[0, 0, 0, 0]}
                    name="Returning Members"
                    onClick={(data) => handleTypeSelect(data as { type?: string })}
                  />
                  <Bar
                    dataKey="newMembers"
                    stackId="members"
                    fill="var(--color-newMembers)"
                    radius={[0, 4, 4, 0]}
                    name="New Members"
                    onClick={(data) => handleTypeSelect(data as { type?: string })}
                  />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {selectedType
              ? `${selectedType} Event Breakdown`
              : "Event Breakdown by Type"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedType ? (
            <p className="text-sm text-muted-foreground">
              Click a bar in either event-type chart to see the individual events contributing to that bucket.
            </p>
          ) : typeEventsLoading || typeEvents === null ? (
            <Skeleton className="h-[260px] w-full" />
          ) : typeEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No event details available for {selectedType}.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-auto px-2 py-1"
                        onClick={() => handleBreakdownSort("date")}
                      >
                        Date
                        {renderSortIcon("date")}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1"
                          onClick={() => handleBreakdownSort("year")}
                        >
                          Year
                          {renderSortIcon("year")}
                        </Button>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1"
                          onClick={() => handleBreakdownSort("attendance")}
                        >
                          Attendance
                          {renderSortIcon("attendance")}
                        </Button>
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTypeEvents?.map((event) => (
                    <TableRow key={event.eventId}>
                      <TableCell className="font-medium whitespace-normal">
                        {event.eventName}
                      </TableCell>
                      <TableCell>
                        {formatEventDate(event.startDate)}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.year}
                      </TableCell>
                      <TableCell className="text-right">
                        {event.attendance.toLocaleString()}
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
  );
}
