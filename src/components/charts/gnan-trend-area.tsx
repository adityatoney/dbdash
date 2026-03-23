"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CHART_COLORS } from "@/lib/constants"

export interface GnanTrendAreaProps {
  data: { year: number; count: number }[]
}

const chartConfig = {
  count: {
    label: "Gnan Count",
    color: CHART_COLORS[3], // purple
  },
  cumulative: {
    label: "Cumulative Total",
    color: CHART_COLORS[0], // blue
  },
} satisfies ChartConfig

type TimeRange = "all" | "2000" | "2010" | "2017"

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "2000", label: "Since 2000" },
  { value: "2010", label: "Since 2010" },
  { value: "2017", label: "Since 2017" },
]

export function GnanTrendArea({ data }: GnanTrendAreaProps) {
  const [timeRange, setTimeRange] = React.useState<TimeRange>("all")

  // Build cumulative data and filter by time range
  const chartData = React.useMemo(() => {
    const startYear = timeRange === "all" ? 0 : parseInt(timeRange)

    // Calculate cumulative from all data (even before filter)
    let cumulative = 0
    const withCumulative = data.map((d) => {
      cumulative += d.count
      return { ...d, cumulative }
    })

    return withCumulative.filter((d) => d.year >= startYear)
  }, [data, timeRange])

  const totalInRange = React.useMemo(
    () => chartData.reduce((sum, d) => sum + d.count, 0),
    [chartData]
  )

  const peakYear = React.useMemo(() => {
    if (chartData.length === 0) return null
    return chartData.reduce((best, d) => (d.count > best.count ? d : best))
  }, [chartData])

  return (
    <div className="space-y-4">
      {/* Header with stats and filter */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Total in Range</p>
            <p className="text-2xl font-bold">{totalInRange.toLocaleString()}</p>
          </div>
          {peakYear && (
            <div>
              <p className="text-xs text-muted-foreground">Peak Year</p>
              <p className="text-2xl font-bold">
                {peakYear.year}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  ({peakYear.count.toLocaleString()})
                </span>
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Desktop: inline buttons */}
          <div className="hidden sm:flex gap-1">
            {TIME_RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  timeRange === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Mobile: select */}
          <div className="sm:hidden w-[140px]">
            <Select
              value={timeRange}
              onValueChange={(v) => {
                if (v !== null) setTimeRange(v as TimeRange)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <ChartContainer config={chartConfig} className="aspect-auto h-[350px] w-full">
        <ComposedChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fillGnan" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-count)"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="var(--color-count)"
                stopOpacity={0.05}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={40}
            tickFormatter={(value) => String(value)}
          />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => value.toLocaleString()}
            width={50}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)
            }
            width={45}
          />
          <ChartTooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(value) => `Year ${value}`}
              />
            }
          />
          <Bar
            yAxisId="left"
            dataKey="count"
            fill="url(#fillGnan)"
            stroke="var(--color-count)"
            strokeWidth={1}
            radius={[2, 2, 0, 0]}
            name="Gnan Count"
          />
          <Line
            yAxisId="right"
            dataKey="cumulative"
            type="monotone"
            stroke="var(--color-cumulative)"
            strokeWidth={2}
            dot={false}
            name="Cumulative Total"
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
