"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YEARS } from "@/lib/constants";

interface YearFilterProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
}

export function YearFilter({ value, onChange, label = "Year" }: YearFilterProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value ?? "all"} onValueChange={(v) => { if (v !== null) onChange(v); }}>
        <SelectTrigger>
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Years</SelectItem>
          {YEARS.map((year) => (
            <SelectItem key={year} value={String(year)}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
