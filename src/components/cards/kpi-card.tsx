import type { LucideIcon } from "lucide-react";
import { ArrowUp, ArrowDown, Info } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  description?: string;
  footnote?: string;
  trend?: { value: number; isPositive: boolean };
  icon?: LucideIcon;
}

export function KpiCard({ title, value, description, footnote, trend, icon: Icon }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {footnote && (
            <Tooltip>
              <TooltipTrigger className="cursor-help">
                <Info className="size-3.5 text-muted-foreground/60" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[240px] text-xs">
                {footnote}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {Icon && <Icon className="size-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend && (
            <Badge
              variant={trend.isPositive ? "default" : "destructive"}
              className={cn(
                "gap-0.5 text-xs",
                trend.isPositive
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              )}
            >
              {trend.isPositive ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
              {Math.abs(trend.value)}%
            </Badge>
          )}
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
