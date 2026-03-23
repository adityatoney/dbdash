"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVENT_TYPE_NAMES } from "@/lib/constants";

interface EventTypeFilterProps {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
}

export function EventTypeFilter({ value, onChange, label = "Event Type" }: EventTypeFilterProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select value={value ?? "all"} onValueChange={(v) => { if (v !== null) onChange(v); }}>
        <SelectTrigger>
          <SelectValue placeholder="Event Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Event Types</SelectItem>
          {EVENT_TYPE_NAMES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
