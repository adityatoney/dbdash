"use client"

import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CHART_COLORS } from "@/lib/constants"

export interface RoomUtilizationBarProps {
  data: { event: string; year: number; booked: number; rate: number }[]
}

const chartConfig = {
  booked: {
    label: "Rooms Booked",
    color: CHART_COLORS[0],
  },
} satisfies ChartConfig

export function RoomUtilizationBar({ data }: RoomUtilizationBarProps) {
  const chartData = data.map((d) => ({
    ...d,
    label: `${d.event} (${d.year})`,
  }))

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <BarChart
        data={chartData}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          angle={-45}
          textAnchor="end"
          height={80}
          interval={0}
          className="text-[10px]"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => value.toLocaleString()}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <span>
                  {Number(value).toLocaleString()} rooms ({item.payload.rate}%
                  utilization)
                </span>
              )}
            />
          }
        />
        <Bar dataKey="booked" fill="var(--color-booked)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
