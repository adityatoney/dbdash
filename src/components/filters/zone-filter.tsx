"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ZONE_NAMES } from "@/lib/constants";

interface ZoneFilterProps {
  value?: string;
  onChange: (value: string) => void;
}

export function ZoneFilter({ value, onChange }: ZoneFilterProps) {
  return (
    <Select value={value ?? "all"} onValueChange={(v) => { if (v !== null) onChange(v); }}>
      <SelectTrigger>
        <SelectValue placeholder="Zone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Zones</SelectItem>
        {ZONE_NAMES.map((zone) => (
          <SelectItem key={zone} value={zone}>
            {zone}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
