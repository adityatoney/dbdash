"use client"

import { useState, useMemo } from "react"
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps"

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"

export interface WorldHeatmapProps {
  data: { country: string; iso: string; count: number }[]
}

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#e5e7eb" // gray-200
  const ratio = Math.min(value / max, 1)
  // Interpolate from light blue (#dbeafe) to dark blue (#1e3a8a)
  const r = Math.round(219 - ratio * (219 - 30))
  const g = Math.round(234 - ratio * (234 - 58))
  const b = Math.round(254 - ratio * (254 - 138))
  return `rgb(${r}, ${g}, ${b})`
}

export function WorldHeatmap({ data }: WorldHeatmapProps) {
  const [tooltipContent, setTooltipContent] = useState("")
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const [showTooltip, setShowTooltip] = useState(false)

  const countByIso = useMemo(() => {
    const map = new Map<string, { country: string; count: number }>()
    for (const d of data) {
      map.set(d.iso, { country: d.country, count: d.count })
    }
    return map
  }, [data])

  const maxCount = useMemo(() => {
    if (data.length === 0) return 0
    return Math.max(...data.map((d) => d.count))
  }, [data])

  return (
    <div className="relative w-full">
      {showTooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: tooltipPos.x + 10, top: tooltipPos.y - 30 }}
        >
          {tooltipContent}
        </div>
      )}
      <ComposableMap
        projectionConfig={{ scale: 147, center: [0, 20] }}
        className="w-full h-auto"
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const isoCode = geo.properties?.ISO_A3 || geo.id
              const entry = countByIso.get(isoCode)
              const count = entry?.count ?? 0
              const name = entry?.country ?? geo.properties?.name ?? "Unknown"

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getColor(count, maxCount)}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#60a5fa" },
                    pressed: { outline: "none" },
                  }}
                  onMouseEnter={(evt) => {
                    setTooltipContent(
                      `${name}: ${count.toLocaleString()}`
                    )
                    setTooltipPos({
                      x: (evt as unknown as React.MouseEvent).nativeEvent?.offsetX ?? 0,
                      y: (evt as unknown as React.MouseEvent).nativeEvent?.offsetY ?? 0,
                    })
                    setShowTooltip(true)
                  }}
                  onMouseMove={(evt) => {
                    setTooltipPos({
                      x: (evt as unknown as React.MouseEvent).nativeEvent?.offsetX ?? 0,
                      y: (evt as unknown as React.MouseEvent).nativeEvent?.offsetY ?? 0,
                    })
                  }}
                  onMouseLeave={() => {
                    setShowTooltip(false)
                  }}
                />
              )
            })
          }
        </Geographies>
      </ComposableMap>
      {/* Color Legend */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <div
          className="h-3 w-32 rounded"
          style={{
            background:
              "linear-gradient(to right, #dbeafe, #1e3a8a)",
          }}
        />
        <span>{maxCount.toLocaleString()}</span>
      </div>
    </div>
  )
}
