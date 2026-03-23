"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CHART_COLORS } from "@/lib/constants"

export interface AgeHistogramProps {
  data: { bucket: string; count: number }[]
}

const chartConfig = {
  count: {
    label: "Count",
    color: CHART_COLORS[0],
  },
} satisfies ChartConfig

export function AgeHistogram({ data }: AgeHistogramProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
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
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          width={80}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="count"
          fill="var(--color-count)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
