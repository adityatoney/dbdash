export interface OverviewStats {
  totalMembers: number;
  totalFamilies: number;
  totalEvents: number;
  totalAttendance: number;
  latestGPAttendance: number;
  gpGrowthPct: number;
  totalGnan: number;
}

export interface TimeSeriesPoint {
  year: number;
  value: number;
  label?: string;
}

export interface AttendanceTrend {
  year: number;
  total: number;
  gpAttendance: number;
}

export interface EventDistribution {
  type: string;
  count: number;
  percentage: number;
}

export interface GeoData {
  country: string;
  iso: string;
  count: number;
}

export interface StateData {
  state: string;
  country: string;
  count: number;
}

export interface ZoneData {
  zone: string;
  attendance: number;
}

export interface AgeDistribution {
  bucket: string;
  count: number;
}

export interface GenderData {
  year: number;
  male: number;
  female: number;
}

export interface FamilySize {
  size: number;
  count: number;
}

export interface RetentionData {
  bucket: string;
  count: number;
}

export interface RoomUtilization {
  event: string;
  year: number;
  booked: number;
  capacity: number;
  rate: number;
}

export interface RoomTypePreference {
  type: string;
  count: number;
}

export interface HotelComparison {
  hotel: string;
  bookings: number;
}

export interface DataQualityCell {
  column: string;
  year: number;
  nullPct: number;
}

export interface DataQualityLogEntry {
  id: number;
  sourceSheet: string;
  sourceRow: number;
  columnName: string;
  issueType: string;
  originalValue: string;
  imputedValue: string;
  resolution: string;
  loggedAt: string;
}
