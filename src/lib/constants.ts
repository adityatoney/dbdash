export const CHART_COLORS = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#dc2626", // red-600
  "#9333ea", // purple-600
  "#ea580c", // orange-600
  "#0891b2", // cyan-600
  "#ca8a04", // yellow-600
  "#e11d48", // rose-600
  "#4f46e5", // indigo-600
] as const;

export const GENDER_COLORS = {
  male: "#2563eb",
  female: "#e11d48",
} as const;

export const EVENT_TYPE_NAMES = [
  "Cruise",
  "Gurupurnima",
  "Learning",
  "Retreat",
  "Satsang",
  "Shibir",
  "Virtual",
  "Youth Camp",
  "Other",
] as const;

export const ZONE_NAMES = [
  "Northeast",
  "Southeast",
  "Midwest",
  "Southwest",
  "West",
  "Northwest",
  "Central",
  "Mid-Atlantic",
  "New England",
] as const;

export const YEAR_RANGE = {
  start: 2017,
  end: 2025,
} as const;

export const YEARS = Array.from(
  { length: YEAR_RANGE.end - YEAR_RANGE.start + 1 },
  (_, i) => YEAR_RANGE.start + i
);
