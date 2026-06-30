import {
  LayoutDashboard,
  Search,
  Map,
  Building2,
  LayoutGrid,
  Users,
  Upload,
  Settings,
  FileText,
  Files,
  FilePlus2,
  CalendarClock,
  BarChart3,
  SlidersHorizontal,
  ClipboardList,
  Network,
  Images,
  Gauge,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "main" | "rti" | "complaints" | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/search", label: "Search", icon: Search, group: "main" },
  { href: "/wards", label: "Wards", icon: Map, group: "main" },
  { href: "/corporations", label: "Corporations", icon: Building2, group: "main" },
  { href: "/explorer", label: "Tree Map", icon: LayoutGrid, group: "main" },
  { href: "/contacts", label: "Contacts", icon: Users, group: "main" },
  { href: "/officers", label: "Officers", icon: Network, group: "main" },

  { href: "/rti", label: "RTI Dashboard", icon: FileText, group: "rti" },
  { href: "/rti/all", label: "All RTIs", icon: Files, group: "rti" },
  { href: "/rti/new", label: "New RTI", icon: FilePlus2, group: "rti" },
  { href: "/rti/calendar", label: "RTI Calendar", icon: CalendarClock, group: "rti" },
  { href: "/rti/reports", label: "RTI Reports", icon: BarChart3, group: "rti" },
  { href: "/rti/settings", label: "RTI Settings", icon: SlidersHorizontal, group: "rti" },

  // Minimal, ZIP-first flow. The in-app forensic-analyser pages (audit wizard,
  // bill/MB audit, job audit runner, risk, fraud analytics) are intentionally NOT
  // in the menu — the skill does the analysis; the app stores + tracks. Those
  // routes still exist and stay reachable from a complaint / contractor page.
  { href: "/complaints/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "complaints" },
  { href: "/complaints", label: "Complaints", icon: ClipboardList, group: "complaints" },
  { href: "/complaints/import", label: "Upload (ZIP or letter)", icon: Upload, group: "complaints" },
  { href: "/complaints/duplicate-photos", label: "Duplicate Photos", icon: Images, group: "complaints" },
  { href: "/complaints/contractors", label: "Contractor Intelligence", icon: Building2, group: "complaints" },
  { href: "/complaints/oversight", label: "Forensic Oversight", icon: Gauge, group: "complaints" },
  { href: "/complaints/settings", label: "Settings", icon: SlidersHorizontal, group: "complaints" },

  { href: "/import", label: "Import", icon: Upload, group: "admin" },
  { href: "/settings", label: "Settings", icon: Settings, group: "admin" },
];

/** Sidebar section order + headings (null = no heading). */
export const NAV_SECTIONS: { group: NavGroup; label: string | null }[] = [
  { group: "main", label: null },
  { group: "rti", label: "RTI" },
  { group: "complaints", label: "Complaints" },
  { group: "admin", label: "Admin" },
];
