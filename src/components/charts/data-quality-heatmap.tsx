"use client"

import { useMemo } from "react"
import { YEARS } from "@/lib/constants"

export interface DataQualityHeatmapProps {
  data: { column: string; year: number; nullPct: number }[]
}

function getCellColor(nullPct: number): string {
  // green (0%) -> yellow (30%) -> orange (60%) -> red (100%)
  if (nullPct <= 0) return "#22c55e" // green-500
  if (nullPct <= 30) {
    // green to yellow
    const ratio = nullPct / 30
    const r = Math.round(34 + ratio * (234 - 34))
    const g = Math.round(197 + ratio * (179 - 197))
    const b = Math.round(94 - ratio * 94)
    return `rgb(${r}, ${g}, ${b})`
  }
  if (nullPct <= 60) {
    // yellow to orange
    const ratio = (nullPct - 30) / 30
    const r = Math.round(234 + ratio * (249 - 234))
    const g = Math.round(179 - ratio * (179 - 115))
    const b = Math.round(0 + ratio * 22)
    return `rgb(${r}, ${g}, ${b})`
  }
  // orange to red
  const ratio = Math.min((nullPct - 60) / 40, 1)
  const r = Math.round(249 - ratio * (249 - 239))
  const g = Math.round(115 - ratio * (115 - 68))
  const b = Math.round(22 + ratio * (68 - 22))
  return `rgb(${r}, ${g}, ${b})`
}

function getTextColor(nullPct: number): string {
  // Use white text on dark backgrounds (high null %), black on light
  return nullPct > 50 ? "#ffffff" : "#000000"
}

export function DataQualityHeatmap({ data }: DataQualityHeatmapProps) {
  const { sortedColumns, cellMap } = useMemo(() => {
    const map = new Map<string, Map<number, number>>()
    const avgMap = new Map<string, { sum: number; count: number }>()

    for (const d of data) {
      if (!map.has(d.column)) {
        map.set(d.column, new Map())
        avgMap.set(d.column, { sum: 0, count: 0 })
      }
      map.get(d.column)!.set(d.year, d.nullPct)
      const avg = avgMap.get(d.column)!
      avg.sum += d.nullPct
      avg.count += 1
    }

    // Sort by average null rate, worst at top
    const sorted = Array.from(avgMap.entries())
      .sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count)
      .map(([col]) => col)

    return { sortedColumns: sorted, cellMap: map }
  }, [data])

  return (
    <div className="w-full">
      {/* Color Legend */}
      <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Null Rate:</span>
        <div className="flex items-center gap-1">
          <div
            className="h-4 w-6 rounded-sm border border-border/30"
            style={{ backgroundColor: getCellColor(0) }}
          />
          <span>0%</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-4 w-6 rounded-sm border border-border/30"
            style={{ backgroundColor: getCellColor(30) }}
          />
          <span>30%</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-4 w-6 rounded-sm border border-border/30"
            style={{ backgroundColor: getCellColor(60) }}
          />
          <span>60%</span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className="h-4 w-6 rounded-sm border border-border/30"
            style={{ backgroundColor: getCellColor(100) }}
          />
          <span>100%</span>
        </div>
      </div>

      {/* Heatmap Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 z-10 bg-muted/90 border-b border-r border-border px-3 py-2 text-left font-medium text-muted-foreground min-w-[160px]">
                Column
              </th>
              {YEARS.map((year) => (
                <th
                  key={year}
                  className="border-b border-border px-3 py-2 text-center font-medium text-muted-foreground min-w-[70px]"
                >
                  {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedColumns.map((column, rowIdx) => {
              const yearMap = cellMap.get(column)
              return (
                <tr
                  key={column}
                  className={rowIdx % 2 === 0 ? "" : "bg-muted/20"}
                >
                  <td className="sticky left-0 z-10 border-r border-border px-3 py-2 font-mono font-medium bg-background">
                    {column}
                  </td>
                  {YEARS.map((year) => {
                    const nullPct = yearMap?.get(year) ?? 0
                    const bgColor = getCellColor(nullPct)
                    const textColor = getTextColor(nullPct)
                    return (
                      <td
                        key={year}
                        className="border-border px-3 py-2 text-center font-mono"
                        style={{
                          backgroundColor: bgColor,
                          color: textColor,
                        }}
                      >
                        {nullPct.toFixed(1)}%
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
