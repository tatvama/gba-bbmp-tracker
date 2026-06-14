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
  Smartphone,
  ScanLine,
  Construction,
  Network,
  ScanSearch,
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
  { href: "/rti/road-work", label: "Road Work RTI", icon: Construction, group: "rti" },
  { href: "/rti/road-work/analyze", label: "Reply Analyzer", icon: ScanSearch, group: "rti" },
  { href: "/rti/calendar", label: "RTI Calendar", icon: CalendarClock, group: "rti" },
  { href: "/rti/reports", label: "RTI Reports", icon: BarChart3, group: "rti" },
  { href: "/rti/settings", label: "RTI Settings", icon: SlidersHorizontal, group: "rti" },

  { href: "/complaints/dashboard", label: "Complaint Dashboard", icon: LayoutDashboard, group: "complaints" },
  { href: "/complaints", label: "Complaints", icon: ClipboardList, group: "complaints" },
  { href: "/complaints/new", label: "New Complaint", icon: FilePlus2, group: "complaints" },
  { href: "/complaints/road-work", label: "Road Work Complaint", icon: Construction, group: "complaints" },
  { href: "/complaints/mobile/upload", label: "Mobile Upload", icon: Smartphone, group: "complaints" },
  { href: "/complaints/ocr-queue", label: "OCR Queue", icon: ScanLine, group: "complaints" },
  { href: "/complaints/reports", label: "Complaint Reports", icon: BarChart3, group: "complaints" },
  { href: "/complaints/settings", label: "Complaint Settings", icon: SlidersHorizontal, group: "complaints" },

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
