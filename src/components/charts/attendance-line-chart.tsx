"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CHART_COLORS } from "@/lib/constants"

export interface AttendanceLineChartProps {
  data: { year: number; total: number; gpAttendance: number }[]
}

const chartConfig = {
  total: {
    label: "Total Attendance",
    color: CHART_COLORS[0], // blue
  },
  gpAttendance: {
    label: "GP Attendance",
    color: CHART_COLORS[6], // yellow/gold
  },
} satisfies ChartConfig

export function AttendanceLineChart({ data }: AttendanceLineChartProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => String(value)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="total"
          stroke="var(--color-total)"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          type="monotone"
          dataKey="gpAttendance"
          stroke="var(--color-gpAttendance)"
          strokeWidth={2}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ChartContainer>
  )
}
