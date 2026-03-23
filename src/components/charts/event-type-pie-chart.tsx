"use client"

import { PieChart, Pie, Cell } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { CHART_COLORS } from "@/lib/constants"

export interface EventTypePieChartProps {
  data: { type: string; count: number; percentage: number }[]
}

export function EventTypePieChart({ data }: EventTypePieChartProps) {
  const chartConfig = data.reduce<ChartConfig>((acc, item, index) => {
    acc[item.type] = {
      label: item.type,
      color: CHART_COLORS[index % CHART_COLORS.length],
    }
    return acc
  }, {})

  const renderLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percentage,
  }: {
    cx: number
    cy: number
    midAngle: number
    innerRadius: number
    outerRadius: number
    percentage: number
  }) => {
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 1.4
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    if (percentage < 3) return null

    return (
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        className="text-xs fill-muted-foreground"
      >
        {`${percentage.toFixed(1)}%`}
      </text>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <span>
                  {name}: {Number(value).toLocaleString()}
                </span>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent nameKey="type" />} />
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          outerRadius={100}
          dataKey="count"
          nameKey="type"
          label={renderLabel}
          labelLine={false}
        >
          {data.map((entry, index) => (
            <Cell
              key={`cell-${entry.type}`}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
