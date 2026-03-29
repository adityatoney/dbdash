"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Calendar,
  MapPin,
  Users,
  Building2,
  AlertTriangle,
  Upload,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Growth Trends", href: "/dashboard/growth", icon: TrendingUp },
  { label: "Event Analytics", href: "/dashboard/events", icon: Calendar },
  { label: "Geography", href: "/dashboard/geography", icon: MapPin },
  { label: "Demographics", href: "/dashboard/demographics", icon: Users },
  { label: "Accommodation", href: "/dashboard/accommodation", icon: Building2 },
  { label: "Data Quality", href: "/dashboard/data-quality", icon: AlertTriangle },
  { label: "Upload", href: "/dashboard/upload", icon: Upload },
  { label: "NL Query", href: "/dashboard/nl-query", icon: MessageSquare },
] as const;

interface SidebarProps {
  className?: string;
  onNavClick?: () => void;
}

export function Sidebar({ className, onNavClick }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className={cn("flex h-full flex-col", className)}>
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <LayoutDashboard className="size-5" />
          <span>DBDash</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
