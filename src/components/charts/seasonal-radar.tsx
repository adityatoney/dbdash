"use client"

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CHART_COLORS } from "@/lib/constants"

export interface SeasonalRadarProps {
  data: { month: string; count: number }[]
}

const chartConfig = {
  count: {
    label: "Events",
    color: CHART_COLORS[5], // cyan
  },
} satisfies ChartConfig

export function SeasonalRadar({ data }: SeasonalRadarProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="month"
          className="text-xs"
          tickLine={false}
        />
        <PolarRadiusAxis
          angle={30}
          domain={[0, "auto"]}
          tickFormatter={(value) => value.toLocaleString()}
          className="text-xs"
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Radar
          name="count"
          dataKey="count"
          stroke="var(--color-count)"
          fill="var(--color-count)"
          fillOpacity={0.3}
          strokeWidth={2}
        />
      </RadarChart>
    </ChartContainer>
  )
}
