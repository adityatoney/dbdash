"use client";

import { useEffect, useState } from "react";
import { User, Users, Home } from "lucide-react";
import { KpiCard } from "@/components/cards/kpi-card";
import { AgeHistogram } from "@/components/charts/age-histogram";
import { GenderRatioBar } from "@/components/charts/gender-ratio-bar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CHART_COLORS } from "@/lib/constants";
import type {
  AgeDistribution,
  GenderData,
  FamilySize,
  RetentionData,
} from "@/types/api";

const familyChartConfig = {
  count: {
    label: "Families",
    color: CHART_COLORS[3],
  },
} satisfies ChartConfig;

const retentionChartConfig = {
  count: {
    label: "Members",
    color: CHART_COLORS[5],
  },
} satisfies ChartConfig;

export default function DemographicsPage() {
  const [age, setAge] = useState<AgeDistribution[] | null>(null);
  const [gender, setGender] = useState<GenderData[] | null>(null);
  const [families, setFamilies] = useState<FamilySize[] | null>(null);
  const [retention, setRetention] = useState<RetentionData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [ageRes, genderRes, familiesRes, retentionRes] = await Promise.all([
          fetch("/api/demographics/age"),
          fetch("/api/demographics/gender?byYear=true"),
          fetch("/api/demographics/families"),
          fetch("/api/demographics/retention"),
        ]);
        const [ageData, genderData, familiesData, retentionData] = await Promise.all([
          ageRes.json(),
          genderRes.json(),
          familiesRes.json(),
          retentionRes.json(),
        ]);
        setAge(ageData);
        setGender(genderData);
        setFamilies(familiesData);
        setRetention(retentionData);
      } catch (error) {
        console.error("Failed to fetch demographics data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Compute KPI values
  const avgAge = age?.length
    ? (() => {
        // Estimate average from buckets: parse midpoint of each range
        let totalWeight = 0;
        let totalCount = 0;
        for (const bucket of age) {
          const match = bucket.bucket.match(/(\d+)/);
          const midpoint = match ? parseInt(match[1], 10) + 5 : 30;
          totalWeight += midpoint * bucket.count;
          totalCount += bucket.count;
        }
        return totalCount > 0 ? Math.round(totalWeight / totalCount) : 0;
      })()
    : 0;

  const genderSplit = gender?.length
    ? (() => {
        const totalM = gender.reduce((s, d) => s + d.male, 0);
        const totalF = gender.reduce((s, d) => s + d.female, 0);
        const total = totalM + totalF;
        if (total === 0) return "N/A";
        return `${Math.round((totalM / total) * 100)}% M / ${Math.round((totalF / total) * 100)}% F`;
      })()
    : "N/A";

  const avgFamilySize = families?.length
    ? (() => {
        const totalMembers = families.reduce((s, d) => s + d.size * d.count, 0);
        const totalFamilies = families.reduce((s, d) => s + d.count, 0);
        return totalFamilies > 0 ? (totalMembers / totalFamilies).toFixed(1) : "0";
      })()
    : "0";

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Demographics</h2>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Avg Age"
              value={avgAge}
              icon={User}
              description="Estimated from age buckets"
            />
            <KpiCard
              title="Gender Split"
              value={genderSplit}
              icon={Users}
              description="Male / Female ratio"
            />
            <KpiCard
              title="Avg Family Size"
              value={avgFamilySize}
              icon={Home}
              description="Members per family"
            />
          </>
        )}
      </div>

      {/* Row 2: Age & Gender charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Age Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !age ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <AgeHistogram data={age} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gender Ratio by Year</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !gender ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <GenderRatioBar data={gender} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Family size & Retention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Family Size Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !families ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={familyChartConfig} className="min-h-[300px] w-full">
                <BarChart data={families} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="size"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value} members`}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member Retention Buckets</CardTitle>
          </CardHeader>
          <CardContent>
            {loading || !retention ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ChartContainer config={retentionChartConfig} className="min-h-[300px] w-full">
                <BarChart data={retention} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="bucket"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
