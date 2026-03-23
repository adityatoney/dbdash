"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "react-simple-maps";
import stateFips from "@/data/state-fips.json";
import stateCenters from "@/data/state-centers.json";

const US_STATES_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const US_COUNTIES_URL =
  "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
const CANADA_PROVINCES_URL = "/canada-provinces.json";

const stateToFips = stateFips as Record<string, string>;
const stateGeo = stateCenters as unknown as Record<
  string,
  { center: [number, number]; scale: number }
>;

export type RegionView = "us" | "canada";

export interface RegionMapProps {
  data: { state: string; country: string; count: number }[];
  region: RegionView;
  yearFilter?: string;
}

interface CountyData {
  fips: string;
  count: number;
}

function getColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#e5e7eb";
  const ratio = Math.min(value / max, 1);
  const r = Math.round(219 - ratio * (219 - 30));
  const g = Math.round(234 - ratio * (234 - 58));
  const b = Math.round(254 - ratio * (254 - 138));
  return `rgb(${r}, ${g}, ${b})`;
}

const PROJECTION_CONFIG: Record<
  RegionView,
  {
    projection: string;
    config: Record<string, unknown>;
    geoUrl: string;
    countryFilter: string;
  }
> = {
  us: {
    projection: "geoAlbersUsa",
    config: { scale: 1000 },
    geoUrl: US_STATES_URL,
    countryFilter: "United States",
  },
  canada: {
    projection: "geoMercator",
    config: { center: [-95, 60] as [number, number], scale: 500 },
    geoUrl: CANADA_PROVINCES_URL,
    countryFilter: "Canada",
  },
};

// ─── Tooltip helper ───
function useTooltip() {
  const [content, setContent] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [show, setShow] = useState(false);

  const onEnter = useCallback(
    (evt: React.MouseEvent | unknown, text: string) => {
      setContent(text);
      const e = evt as React.MouseEvent;
      setPos({ x: e.nativeEvent?.offsetX ?? 0, y: e.nativeEvent?.offsetY ?? 0 });
      setShow(true);
    },
    []
  );
  const onMove = useCallback((evt: React.MouseEvent | unknown) => {
    const e = evt as React.MouseEvent;
    setPos({ x: e.nativeEvent?.offsetX ?? 0, y: e.nativeEvent?.offsetY ?? 0 });
  }, []);
  const onLeave = useCallback(() => setShow(false), []);

  return { content, pos, show, onEnter, onMove, onLeave };
}

// ─── County drill-down view ───
function CountyMap({
  stateName,
  yearFilter,
  onBack,
}: {
  stateName: string;
  yearFilter?: string;
  onBack: () => void;
}) {
  const [counties, setCounties] = useState<CountyData[]>([]);
  const [loading, setLoading] = useState(true);
  const tt = useTooltip();

  const fipsPrefix = stateToFips[stateName] ?? "";
  const geo = stateGeo[stateName] ?? { center: [-98, 39] as [number, number], scale: 1200 };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ state: stateName });
        if (yearFilter && yearFilter !== "all") params.set("year", yearFilter);
        const res = await fetch(`/api/geography/counties?${params}`);
        const data = await res.json();
        if (!cancelled) setCounties(data.counties ?? []);
      } catch (err) {
        console.error("Failed to load county data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [stateName, yearFilter]);

  const countByFips = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of counties) m.set(c.fips, c.count);
    return m;
  }, [counties]);

  const maxCount = useMemo(() => {
    if (counties.length === 0) return 0;
    return Math.max(...counties.map((c) => c.count));
  }, [counties]);

  const geoStyle = {
    default: { outline: "none" },
    hover: { outline: "none", fill: "#60a5fa" },
    pressed: { outline: "none" },
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        Loading county data…
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-2 inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
      >
        ← Back to all states
      </button>

      {tt.show && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: tt.pos.x + 10, top: tt.pos.y - 10 }}
        >
          {tt.content}
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{
          center: geo.center,
          scale: geo.scale,
        }}
        className="w-full h-auto"
        style={{ maxHeight: 500 }}
      >
        {/* State outline for context (rendered first, behind counties) */}
        <Geographies geography={US_STATES_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => g.properties?.name === stateName)
              .map((g) => (
                <Geography
                  key={`outline-${g.rsmKey}`}
                  geography={g}
                  fill="#f1f5f9"
                  stroke="#475569"
                  strokeWidth={1.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
          }
        </Geographies>

        {/* Counties within the state, colored by member count */}
        <Geographies geography={US_COUNTIES_URL}>
          {({ geographies }) =>
            geographies
              .filter((g) => {
                const id = String(g.id).padStart(5, "0");
                return id.startsWith(fipsPrefix);
              })
              .map((g) => {
                const id = String(g.id).padStart(5, "0");
                const name = g.properties?.name ?? "Unknown";
                const count = countByFips.get(id) ?? 0;

                return (
                  <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={getColor(count, maxCount)}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                    style={geoStyle}
                    onMouseEnter={(evt) =>
                      tt.onEnter(
                        evt,
                        `${name} County: ${count.toLocaleString()} members`
                      )
                    }
                    onMouseMove={tt.onMove}
                    onMouseLeave={tt.onLeave}
                  />
                );
              })
          }
        </Geographies>
      </ComposableMap>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <div
          className="h-3 w-32 rounded"
          style={{
            background: "linear-gradient(to right, #dbeafe, #1e3a8a)",
          }}
        />
        <span>{maxCount.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Main region map (states / provinces overview) ───
export function RegionMap({ data, region, yearFilter }: RegionMapProps) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const tt = useTooltip();

  // Reset drill-down when region changes
  useEffect(() => {
    setSelectedState(null);
  }, [region]);

  const config = PROJECTION_CONFIG[region];

  const regionData = useMemo(
    () => data.filter((d) => d.country === config.countryFilter),
    [data, config.countryFilter]
  );

  const countByName = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of regionData) map.set(d.state, d.count);
    return map;
  }, [regionData]);

  const maxCount = useMemo(() => {
    if (regionData.length === 0) return 0;
    return Math.max(...regionData.map((d) => d.count));
  }, [regionData]);

  // If a US state is selected, show the county drill-down
  if (selectedState && region === "us") {
    return (
      <CountyMap
        stateName={selectedState}
        yearFilter={yearFilter}
        onBack={() => setSelectedState(null)}
      />
    );
  }

  const geoStyle = {
    default: { outline: "none" },
    hover: { outline: "none", fill: "#60a5fa" },
    pressed: { outline: "none" },
  };

  return (
    <div className="relative w-full">
      {tt.show && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: tt.pos.x + 10, top: tt.pos.y - 30 }}
        >
          {tt.content}
        </div>
      )}
      <ComposableMap
        projection={config.projection}
        projectionConfig={config.config}
        className="w-full h-auto"
        style={{ maxHeight: 500 }}
      >
        <Geographies geography={config.geoUrl}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const name = geo.properties?.name ?? "";
              const count = countByName.get(name) ?? 0;
              const isClickable = region === "us" && stateToFips[name];

              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={getColor(count, maxCount)}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                  style={{
                    ...geoStyle,
                    default: {
                      ...geoStyle.default,
                      cursor: isClickable ? "pointer" : "default",
                    },
                  }}
                  onClick={() => {
                    if (isClickable) setSelectedState(name);
                  }}
                  onMouseEnter={(evt) =>
                    tt.onEnter(
                      evt,
                      `${name}: ${count.toLocaleString()} members${isClickable ? " (click to drill down)" : ""}`
                    )
                  }
                  onMouseMove={tt.onMove}
                  onMouseLeave={tt.onLeave}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>0</span>
        <div
          className="h-3 w-32 rounded"
          style={{
            background: "linear-gradient(to right, #dbeafe, #1e3a8a)",
          }}
        />
        <span>{maxCount.toLocaleString()}</span>
      </div>
      {region === "us" && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          Click a state to see county-level distribution
        </p>
      )}
    </div>
  );
}
