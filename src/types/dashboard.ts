export interface ChartConfig {
  [key: string]: {
    label: string;
    color?: string;
    icon?: React.ComponentType;
  };
}

export interface FilterState {
  year?: number;
  eventType?: string;
  zone?: string;
}
