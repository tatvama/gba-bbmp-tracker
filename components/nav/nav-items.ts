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
  Printer,
  Stamp,
  Workflow,
  HardHat,
  type LucideIcon,
} from "lucide-react";

export type NavGroup = "main" | "rti" | "complaints" | "admin";

export interface NavItem {
  href: string;
  /** English default — used as the command-palette search fallback and as a
   *  last resort if translation ever fails; the rendered label always goes
   *  through t(labelKey) via the "navigation" i18n namespace. */
  label: string;
  /** Key into lib/i18n/dictionaries/navigation.ts. */
  labelKey: string;
  icon: LucideIcon;
  group: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, group: "main" },
  { href: "/wards", label: "Wards", labelKey: "nav.wards", icon: Map, group: "main" },
  { href: "/corporations", label: "Corporations", labelKey: "nav.corporations", icon: Building2, group: "main" },
  { href: "/explorer", label: "Tree Map", labelKey: "nav.treeMap", icon: LayoutGrid, group: "main" },
  { href: "/contacts", label: "Contacts", labelKey: "nav.contacts", icon: Users, group: "main" },
  { href: "/officers", label: "Officers", labelKey: "nav.officers", icon: Network, group: "main" },
  { href: "/bbmp-works/search", label: "Work Search", labelKey: "nav.workSearch", icon: HardHat, group: "main" },

  { href: "/rti", label: "RTI Dashboard", labelKey: "nav.rtiDashboard", icon: FileText, group: "rti" },
  { href: "/rti/all", label: "All RTIs", labelKey: "nav.allRtis", icon: Files, group: "rti" },
  { href: "/rti/new", label: "New RTI", labelKey: "nav.newRti", icon: FilePlus2, group: "rti" },
  { href: "/rti/calendar", label: "RTI Calendar", labelKey: "nav.rtiCalendar", icon: CalendarClock, group: "rti" },
  { href: "/rti/reports", label: "RTI Reports", labelKey: "nav.rtiReports", icon: BarChart3, group: "rti" },
  { href: "/rti/settings", label: "RTI Settings", labelKey: "nav.rtiSettings", icon: SlidersHorizontal, group: "rti" },

  // Minimal, ZIP-first flow. The in-app forensic-analyser pages (audit wizard,
  // bill/MB audit, job audit runner, risk, fraud analytics) are intentionally NOT
  // in the menu — the skill does the analysis; the app stores + tracks. Those
  // routes still exist and stay reachable from a complaint / contractor page.
  { href: "/complaints/dashboard", label: "Dashboard", labelKey: "nav.complaintsDashboard", icon: LayoutDashboard, group: "complaints" },
  { href: "/complaints", label: "Complaints", labelKey: "nav.complaints", icon: ClipboardList, group: "complaints" },
  { href: "/complaints/import", label: "Upload (ZIP or letter)", labelKey: "nav.uploadZipOrLetter", icon: Upload, group: "complaints" },
  { href: "/complaints/acknowledgments", label: "Attach Acknowledgments", labelKey: "nav.attachAcknowledgments", icon: Stamp, group: "complaints" },
  { href: "/complaints/print-queue", label: "Print Queue", labelKey: "nav.printQueue", icon: Printer, group: "complaints" },
  { href: "/complaints/duplicate-photos", label: "Duplicate Photos", labelKey: "nav.duplicatePhotos", icon: Images, group: "complaints" },
  { href: "/complaints/contractors", label: "Contractor Intelligence", labelKey: "nav.contractorIntelligence", icon: Building2, group: "complaints" },
  { href: "/complaints/oversight", label: "Forensic Oversight", labelKey: "nav.forensicOversight", icon: Gauge, group: "complaints" },
  { href: "/complaints/settings", label: "Settings", labelKey: "nav.complaintsSettings", icon: SlidersHorizontal, group: "complaints" },

  { href: "/import", label: "Import", labelKey: "nav.import", icon: Upload, group: "admin" },
  { href: "/settings", label: "Settings", labelKey: "nav.settings", icon: Settings, group: "admin" },
];

/** Sidebar section order + headings (null = no heading). labelKey is null
 *  exactly when label is (the "main" group has no visible heading at all). */
export const NAV_SECTIONS: { group: NavGroup; label: string | null; labelKey: string | null }[] = [
  { group: "main", label: null, labelKey: null },
  { group: "rti", label: "RTI", labelKey: "nav.section.rti" },
  { group: "complaints", label: "Complaints", labelKey: "nav.section.complaints" },
  { group: "admin", label: "Admin", labelKey: "nav.section.admin" },
];
