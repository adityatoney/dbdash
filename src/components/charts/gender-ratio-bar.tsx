"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { GENDER_COLORS } from "@/lib/constants"

export interface GenderRatioBarProps {
  data: { year: number; male: number; female: number }[]
}

const chartConfig = {
  male: {
    label: "Male",
    color: GENDER_COLORS.male,
  },
  female: {
    label: "Female",
    color: GENDER_COLORS.female,
  },
} satisfies ChartConfig

export function GenderRatioBar({ data }: GenderRatioBarProps) {
  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
        <Bar
          dataKey="male"
          stackId="gender"
          fill="var(--color-male)"
          radius={[0, 0, 0, 0]}
        />
        <Bar
          dataKey="female"
          stackId="gender"
          fill="var(--color-female)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  )
}
