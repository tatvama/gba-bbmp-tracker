"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  Search,
  ChevronRight,
  ChevronLeft,
  FileText,
  Clock,
  AlertOctagon,
  CheckCircle2,
  MapPin,
  Sparkles,
  RefreshCw,
  HelpCircle,
  TrendingUp,
  TrendingDown,
  Building2,
  ListFilter,
  Eye,
  ShieldCheck,
  Briefcase,
  Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/format";

import gbaWardsData from "@/data/gba_369_wards.json";
import bbmpWardsData from "@/data/bbmp225_wards.json";

export interface OrgTreemapRow {
  id: string;
  title: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  corporation: string | null;
  division: string | null;
  subDivision: string | null;
  wardNo: number | null;
  wardName: string | null;
  status: string;
  priority?: string;
  overdue?: boolean;
  zone?: string | null;
}

// Tree Node interface
interface TreeNode {
  id: string;
  label: string;
  type: "gba" | "bbmp" | "corporation" | "zone" | "division" | "subdivision" | "ward";
  number?: number;
  total: number;
  active: number;
  pending: number;
  overdue: number;
  closed: number;
  children: TreeNode[];
  childCount?: number;
  complaintsList?: OrgTreemapRow[];
}

const LEVEL_COLORS: Record<TreeNode["type"], { bg: string; text: string; border: string; borderSelected: string; ring: string; dot: string }> = {
  gba: { bg: "bg-blue-50/70 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/80 dark:border-blue-900/50", borderSelected: "border-blue-600 dark:border-blue-500", ring: "ring-blue-500/20", dot: "bg-blue-600" },
  bbmp: { bg: "bg-blue-50/70 dark:bg-blue-950/20", text: "text-blue-700 dark:text-blue-300", border: "border-blue-200/80 dark:border-blue-900/50", borderSelected: "border-blue-600 dark:border-blue-500", ring: "ring-blue-500/20", dot: "bg-blue-600" },
  corporation: { bg: "bg-emerald-50/70 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/80 dark:border-emerald-900/50", borderSelected: "border-emerald-600 dark:border-emerald-500", ring: "ring-emerald-500/20", dot: "bg-emerald-600" },
  zone: { bg: "bg-emerald-50/70 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-200/80 dark:border-emerald-900/50", borderSelected: "border-emerald-600 dark:border-emerald-500", ring: "ring-emerald-500/20", dot: "bg-emerald-600" },
  division: { bg: "bg-purple-50/70 dark:bg-purple-950/20", text: "text-purple-750 dark:text-purple-300", border: "border-purple-200/80 dark:border-purple-900/50", borderSelected: "border-purple-600 dark:border-purple-500", ring: "ring-purple-500/20", dot: "bg-purple-600" },
  subdivision: { bg: "bg-sky-50/70 dark:bg-sky-950/20", text: "text-sky-700 dark:text-sky-300", border: "border-sky-200/80 dark:border-sky-900/50", borderSelected: "border-sky-500", ring: "ring-sky-500/20", dot: "bg-sky-500" },
  ward: { bg: "bg-slate-50 dark:bg-slate-900/40", text: "text-slate-700 dark:text-slate-350", border: "border-slate-200/80 dark:border-slate-800", borderSelected: "border-slate-600 dark:border-slate-500", ring: "ring-slate-500/20", dot: "bg-slate-600" },
};

export function OrgTreemap({ rows, className }: { rows: OrgTreemapRow[]; className?: string }) {
  const [treeType, setTreeType] = React.useState<"GBA" | "BBMP">("GBA");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "active" | "pending" | "overdue" | "closed">("all");
  const [levelFilter, setLevelFilter] = React.useState<"all" | "corporation" | "division" | "subdivision" | "ward">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  
  // Selection path tracking: starts at Root ["GBA"] or ["BBMP"]
  const [selectedPath, setSelectedPath] = React.useState<string[]>(["GBA"]);

  // Set initial selected path when treeType switches
  React.useEffect(() => {
    setSelectedPath([treeType]);
  }, [treeType]);

  // Mobile layout check
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const checkSize = () => setIsMobile(window.innerWidth < 768);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  // 1. Construct Static Hierarchies from JSON Files
  const gbaStaticRoot = React.useMemo<TreeNode>(() => {
    return {
      id: "GBA",
      label: "Greater Bengaluru Authority",
      type: "gba" as const,
      total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
      children: gbaWardsData.corporations.map((corp) => {
        const corpId = `GBA::${corp.name}`;
        return {
          id: corpId,
          label: corp.name,
          type: "corporation" as const,
          total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
          children: corp.divisions.map((div) => {
            const divId = `${corpId}::${div.name}`;
            return {
              id: divId,
              label: div.name,
              type: "division" as const,
              total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
              children: div.subdivisions.map((sub) => {
                const subId = `${divId}::${sub.name}`;
                return {
                  id: subId,
                  label: sub.name,
                  type: "subdivision" as const,
                  total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
                  children: sub.wards.map((wardArr: any) => {
                    const wNo = Number(wardArr[0]);
                    const wNameEn = String(wardArr[1] || `Ward ${wNo}`);
                    const wardId = `${subId}::${wNo}`;
                    return {
                      id: wardId,
                      label: wNameEn,
                      number: wNo,
                      type: "ward" as const,
                      total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
                      children: []
                    };
                  })
                };
              })
            };
          })
        };
      })
    };
  }, []);

  const bbmpStaticRoot = React.useMemo<TreeNode>(() => {
    const zonesMap = new Map<string, Map<string, Array<{ new_no: number; new_name: string }>>>();

    for (const w of bbmpWardsData.wards) {
      const zoneName = w.zone || "Unassigned Zone";
      const divName = w.division || "Unassigned Division";
      if (!zonesMap.has(zoneName)) {
        zonesMap.set(zoneName, new Map());
      }
      const divsMap = zonesMap.get(zoneName)!;
      if (!divsMap.has(divName)) {
        divsMap.set(divName, []);
      }
      divsMap.get(divName)!.push({ new_no: w.new_no, new_name: w.new_name });
    }

    return {
      id: "BBMP",
      label: "Bruhat Bengaluru Mahanagara Palike",
      type: "bbmp" as const,
      total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
      children: Array.from(zonesMap.entries()).map(([zoneName, divsMap]) => {
        const zoneId = `BBMP::${zoneName}`;
        return {
          id: zoneId,
          label: zoneName,
          type: "zone" as const,
          total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
          children: Array.from(divsMap.entries()).map(([divName, wardsList]) => {
            const divId = `${zoneId}::${divName}`;
            return {
              id: divId,
              label: divName,
              type: "division" as const,
              total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
              children: wardsList.map((ward) => {
                const wardId = `${divId}::${ward.new_no}`;
                return {
                  id: wardId,
                  label: ward.new_name,
                  number: ward.new_no,
                  type: "ward" as const,
                  total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
                  children: []
                };
              })
            };
          })
        };
      })
    };
  }, []);

  // Filter complaints based on the status toolbar filter
  const filteredComplaints = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => {
      if (statusFilter === "closed" && r.status !== "Resolved" && r.status !== "Closed") return false;
      if (statusFilter === "overdue" && !r.overdue) return false;
      if (statusFilter === "pending") {
        const isClosed = r.status === "Resolved" || r.status === "Closed";
        const isActive = !isClosed && !r.overdue && (
          r.status === "Assigned To Engineer" ||
          r.status === "Work In Progress" ||
          r.status === "Site Visit Done" ||
          r.status === "Reply Received" ||
          r.status === "Action Taken Report Received" ||
          r.status === "Under Review" ||
          r.status === "Reopened" ||
          r.status === "Escalated" ||
          r.status === "Partially Resolved"
        );
        if (isClosed || r.overdue || isActive) return false;
      }
      if (statusFilter === "active") {
        const isClosed = r.status === "Resolved" || r.status === "Closed";
        const isActive = !isClosed && !r.overdue && (
          r.status === "Assigned To Engineer" ||
          r.status === "Work In Progress" ||
          r.status === "Site Visit Done" ||
          r.status === "Reply Received" ||
          r.status === "Action Taken Report Received" ||
          r.status === "Under Review" ||
          r.status === "Reopened" ||
          r.status === "Escalated" ||
          r.status === "Partially Resolved"
        );
        if (!isActive) return false;
      }
      return true;
    });
  }, [rows, statusFilter]);

  // 2. Clone and Aggregate Dynamic Data onto Static Wards Tree Bottom-Up
  const compiledHierarchy = React.useMemo<TreeNode>(() => {
    const cloneTree = (node: TreeNode): TreeNode => ({
      id: node.id,
      label: node.label,
      type: node.type,
      number: node.number,
      total: 0, active: 0, pending: 0, overdue: 0, closed: 0,
      children: node.children.map(cloneTree),
      complaintsList: []
    });

    const rootClone = cloneTree(treeType === "GBA" ? gbaStaticRoot : bbmpStaticRoot);

    // Build map for instant ward lookup
    const wardMap = new Map<number, TreeNode>();
    const indexWards = (node: TreeNode) => {
      if (node.type === "ward" && node.number !== undefined) {
        wardMap.set(node.number, node);
      }
      node.children.forEach(indexWards);
    };
    indexWards(rootClone);

    // Populate dynamic complaints on wards
    for (const r of filteredComplaints) {
      if (r.wardNo !== null && r.wardNo !== undefined) {
        const wardNode = wardMap.get(r.wardNo);
        if (wardNode) {
          if (!wardNode.complaintsList) wardNode.complaintsList = [];
          wardNode.complaintsList.push(r);
          wardNode.total++;

          if (r.status === "Resolved" || r.status === "Closed") {
            wardNode.closed++;
          } else if (r.overdue) {
            wardNode.overdue++;
          } else if (
            r.status === "Assigned To Engineer" ||
            r.status === "Work In Progress" ||
            r.status === "Site Visit Done" ||
            r.status === "Reply Received" ||
            r.status === "Action Taken Report Received" ||
            r.status === "Under Review" ||
            r.status === "Reopened" ||
            r.status === "Escalated" ||
            r.status === "Partially Resolved"
          ) {
            wardNode.active++;
          } else {
            wardNode.pending++;
          }
        }
      }
    }

    // Dynamic aggregation bottom-up
    const aggregate = (node: TreeNode): { total: number; active: number; pending: number; overdue: number; closed: number } => {
      if (node.type === "ward") {
        return {
          total: node.total,
          active: node.active,
          pending: node.pending,
          overdue: node.overdue,
          closed: node.closed,
        };
      }

      let total = 0, active = 0, pending = 0, overdue = 0, closed = 0;
      for (const child of node.children) {
        const childStats = aggregate(child);
        total += childStats.total;
        active += childStats.active;
        pending += childStats.pending;
        overdue += childStats.overdue;
        closed += childStats.closed;
      }

      node.total = total;
      node.active = active;
      node.pending = pending;
      node.overdue = overdue;
      node.closed = closed;
      node.childCount = node.children.length;

      return { total, active, pending, overdue, closed };
    };

    aggregate(rootClone);
    return rootClone;
  }, [treeType, filteredComplaints, gbaStaticRoot, bbmpStaticRoot]);

  // Find currently active selected node details based on selectedPath
  const selectedNodeDetails = React.useMemo<TreeNode | null>(() => {
    const targetId = selectedPath[selectedPath.length - 1];
    if (!targetId) return null;

    const findNode = (node: TreeNode, id: string): TreeNode | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const res = findNode(child, id);
        if (res) return res;
      }
      return null;
    };
    return findNode(compiledHierarchy, targetId);
  }, [compiledHierarchy, selectedPath]);

  // Recursively collect all complaints under the subtree of the selected path's endpoint
  const selectedSubtreeComplaints = React.useMemo(() => {
    if (!selectedNodeDetails) return [];
    
    const collect = (node: TreeNode, accum: OrgTreemapRow[] = []) => {
      if (node.complaintsList && node.complaintsList.length > 0) {
        accum.push(...node.complaintsList);
      }
      for (const child of node.children) {
        collect(child, accum);
      }
      return accum;
    };
    return collect(selectedNodeDetails);
  }, [selectedNodeDetails]);

  // Area Summary Card statistics calculations
  const currentAreaSummary = React.useMemo(() => {
    if (!selectedNodeDetails) return null;

    const complaints = selectedSubtreeComplaints;
    const total = selectedNodeDetails.total;
    const active = selectedNodeDetails.active;
    const pending = selectedNodeDetails.pending;
    const overdue = selectedNodeDetails.overdue;
    const closed = selectedNodeDetails.closed;

    // 1. Top categories
    const categories: Record<string, number> = {};
    complaints.forEach((c) => {
      const typeStr = c.type || "Other";
      categories[typeStr] = (categories[typeStr] || 0) + 1;
    });
    const sortedCategories = Object.entries(categories)
      .map(([label, count]) => ({
        label,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 2. Most Affected Child Area
    const childScores = selectedNodeDetails.children.map(c => ({
      name: c.label,
      total: c.total
    })).sort((a, b) => b.total - a.total);
    const mostAffectedChild = childScores[0] ? `${childScores[0].name} (${childScores[0].total} complaints)` : "N/A";

    // 3. Average Resolution Time
    const resolved = complaints.filter(c => c.status === "Resolved" || c.status === "Closed");
    let avgResolutionTime = "N/A";
    if (resolved.length > 0) {
      let totalMs = 0;
      resolved.forEach((c) => {
        const start = new Date(c.createdAt).getTime();
        const end = new Date(c.updatedAt).getTime();
        totalMs += Math.max(0, end - start);
      });
      const avgDays = Math.round(totalMs / resolved.length / (1000 * 60 * 60 * 24));
      avgResolutionTime = `${avgDays} Day${avgDays === 1 ? "" : "s"}`;
    }

    // 4. Priority breakdown counts
    const priorityCounts = { Urgent: 0, High: 0, Medium: 0, Low: 0 };
    complaints.forEach((c) => {
      const p = c.priority || "Medium";
      if (p === "Urgent") priorityCounts.Urgent++;
      else if (p === "High") priorityCounts.High++;
      else if (p === "Medium") priorityCounts.Medium++;
      else if (p === "Low") priorityCounts.Low++;
    });

    // 5. Parent node ID resolution
    const parts = selectedNodeDetails.id.split("::");
    const parentName = parts.length > 1 ? parts[parts.length - 2] : "None (Root)";

    // 6. Recent complaints (sort by createdAt descending)
    const recentComplaints = [...complaints]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // 7. Calculate trend text
    const now = new Date().getTime();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
    let currentWeek = 0;
    let previousWeek = 0;

    complaints.forEach((c) => {
      const t = new Date(c.createdAt).getTime();
      if (t >= sevenDaysAgo) currentWeek++;
      else if (t >= fourteenDaysAgo && t < sevenDaysAgo) previousWeek++;
    });

    let trendText = "Stable (0% vs last week)";
    let trendDirection: "up" | "down" | "flat" = "flat";
    if (currentWeek > previousWeek) {
      const pct = previousWeek > 0 ? Math.round(((currentWeek - previousWeek) / previousWeek) * 100) : 100;
      trendText = `+${pct}% vs last week`;
      trendDirection = "up";
    } else if (currentWeek < previousWeek) {
      const pct = previousWeek > 0 ? Math.round(((previousWeek - currentWeek) / previousWeek) * 100) : 100;
      trendText = `-${pct}% vs last week`;
      trendDirection = "down";
    }

    return {
      name: selectedNodeDetails.label,
      type: selectedNodeDetails.type,
      parent: parentName,
      children: selectedNodeDetails.children.map(c => c.label),
      total,
      active,
      pending,
      overdue,
      closed,
      categories: sortedCategories,
      mostAffectedChild,
      avgResolutionTime,
      recent: recentComplaints,
      priority: priorityCounts,
      trendText,
      trendDirection
    };
  }, [selectedNodeDetails, selectedSubtreeComplaints]);

  // Filtering lists of children inside columns using search criteria
  const filterItems = React.useCallback((items: TreeNode[]) => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    
    // Return items that match search OR contain descendants that match
    const hasMatchingDescendant = (node: TreeNode): boolean => {
      if (node.label.toLowerCase().includes(q)) return true;
      if (node.number && node.number.toString() === q) return true;
      if (node.type === "ward" && `ward ${node.number}`.includes(q)) return true;
      return node.children.some(hasMatchingDescendant);
    };
    
    return items.filter(hasMatchingDescendant);
  }, [searchQuery]);

  // Compute dynamic lists of columns to render based on current selectedPath
  const explorerColumns = React.useMemo(() => {
    const cols: Array<{
      title: string;
      level: string;
      items: TreeNode[];
      selectedId: string | null;
    }> = [];

    // Level 0: Always render Corporation or Zone list
    cols.push({
      title: treeType === "GBA" ? "Corporations" : "Zones",
      level: treeType === "GBA" ? "corporation" : "zone",
      items: compiledHierarchy.children,
      selectedId: selectedPath[1] || null
    });

    let currentNode: TreeNode = compiledHierarchy;
    // Walk down the path hierarchy
    for (let i = 1; i < selectedPath.length; i++) {
      const nextId = selectedPath[i];
      const match = currentNode.children.find(c => c.id === nextId);
      if (match && match.children.length > 0 && match.children[0]) {
        let title = "Wards";
        const childType = match.children[0].type;
        if (childType === "division") title = "Divisions";
        else if (childType === "subdivision") title = "Sub-Divisions";

        cols.push({
          title,
          level: childType,
          items: match.children,
          selectedId: selectedPath[i + 1] || null
        });
        currentNode = match;
      } else {
        break;
      }
    }

    return cols;
  }, [treeType, compiledHierarchy, selectedPath]);

  // Drill down selection trigger
  const handleCardClick = (levelIndex: number, nodeId: string) => {
    const nextPath = selectedPath.slice(0, levelIndex + 1);
    nextPath.push(nodeId);
    setSelectedPath(nextPath);
  };

  // Breadcrumb navigate back
  const handleBreadcrumbClick = (idx: number) => {
    const nextPath = selectedPath.slice(0, idx + 1);
    setSelectedPath(nextPath);
  };

  // Level selector filter execution (prunes selection path to that depth)
  const handleLevelFilterChange = (level: string) => {
    setLevelFilter(level as any);
    if (level === "all") return;
    
    // Truncate path appropriately
    let maxLen = 1;
    if (level === "corporation") maxLen = 2;
    else if (level === "division") maxLen = 3;
    else if (level === "subdivision") maxLen = 4;
    else if (level === "ward") maxLen = 5;

    if (selectedPath.length > maxLen) {
      setSelectedPath(selectedPath.slice(0, maxLen));
    }
  };

  const handleReset = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setLevelFilter("all");
    setSelectedPath([treeType]);
  };

  // Determine standard visibility classes for columns based on viewport
  const getColumnVisibilityClass = (idx: number, total: number) => {
    const isLast = idx === total - 1;
    const isWithinLast3 = idx >= total - 3;
    
    return cn(
      "flex-1 min-w-[220px] max-w-full md:max-w-[33.33%] lg:max-w-[20%] border dark:border-slate-800 rounded-xl bg-card overflow-hidden flex flex-col h-[400px] transition-all duration-300 shadow-3xs",
      isLast ? "flex animate-fade-in" : "hidden md:flex",
      isWithinLast3 ? "md:flex" : "md:hidden lg:flex"
    );
  };

  // Extract complaints specifically for the selected ward
  const isWardSelected = selectedNodeDetails?.type === "ward";
  const wardComplaints = isWardSelected ? selectedSubtreeComplaints : [];

  return (
    <div className="space-y-6">
      
      {/* Page Header Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 gap-4">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <Network className="h-5.5 w-5.5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-slate-50">Complaints by Area Explorer</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Navigate structured workloads, case aggregates, and real-time statistics across BBMP and GBA boundaries.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 text-xs font-bold text-slate-550 flex items-center gap-1.5 self-start md:self-auto shrink-0 select-none">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span>Active Filter Yield:</span>
          <span className="text-slate-900 dark:text-white font-black">{filteredComplaints.length} cases</span>
        </div>
      </div>

      {/* Top Toolbar */}
      <div className="flex flex-col gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-900/40 shadow-3xs no-print">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          {/* GBA/BBMP Segmented Switch */}
          <div className="flex items-center gap-3">
            <span className="text-slate-450 uppercase tracking-wider text-[10px] font-bold select-none">Current Hierarchy:</span>
            <div className="inline-flex bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              {(["GBA", "BBMP"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setTreeType(type)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-[11px] font-black cursor-pointer transition-all",
                    treeType === type 
                      ? "bg-blue-650 text-white shadow-xs" 
                      : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-250"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs font-bold text-slate-450 select-none">
            Viewing: <span className="text-slate-700 dark:text-slate-200 font-extrabold">{treeType === "GBA" ? "Greater Bengaluru Authority (GBA)" : "Bruhat Bengaluru Mahanagara Palike (BBMP)"}</span>
          </div>
        </div>

        <div className="h-[1px] bg-slate-100 dark:bg-slate-850" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Search Input */}
            <div className="relative flex items-center bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xs">
              <Search className="h-3.5 w-3.5 text-slate-450 absolute left-2.5" />
              <Input
                placeholder="Search hierarchy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 pr-8 border-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 text-xs w-[180px] font-bold text-slate-700 dark:text-slate-200"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-655 text-xs font-black p-0.5 rounded-full"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Level Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 uppercase tracking-wider text-[9px] font-bold select-none">Level:</span>
              <select
                value={levelFilter}
                onChange={(e) => handleLevelFilterChange(e.target.value)}
                className="bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer font-bold text-slate-700 dark:text-slate-205 shadow-2xs"
              >
                <option value="all">All Levels</option>
                <option value="corporation">{treeType === "GBA" ? "Corporations" : "Zones"}</option>
                <option value="division">Divisions</option>
                {treeType === "GBA" && <option value="subdivision">Sub-Divisions</option>}
                <option value="ward">Wards</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 uppercase tracking-wider text-[9px] font-bold select-none">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-white dark:bg-slate-955 border border-slate-200 dark:border-slate-800 rounded-lg px-2.5 py-1 text-xs outline-none cursor-pointer font-bold text-slate-700 dark:text-slate-205 shadow-2xs"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8 text-[10px] font-bold rounded-lg px-2.5 bg-white dark:bg-slate-955 border-slate-200 dark:border-slate-800 cursor-pointer shrink-0"
          >
            Reset Explorer
          </Button>
        </div>
      </div>

      {/* Visual Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-slate-450 select-none bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 p-2.5 rounded-lg">
        {selectedPath.map((nodeId, idx) => {
          const name = nodeId === "GBA" ? "GBA" : nodeId === "BBMP" ? "BBMP" : nodeId.split("::").pop();
          return (
            <React.Fragment key={nodeId}>
              {idx > 0 && <ChevronRight className="h-3 w-3 text-slate-350 shrink-0 mx-1" />}
              <span
                onClick={() => handleBreadcrumbClick(idx)}
                className={cn(
                  "cursor-pointer hover:underline",
                  idx === selectedPath.length - 1 ? "text-blue-600 dark:text-blue-400 font-extrabold" : ""
                )}
              >
                {name}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Drill-Down Columns Canvas */}
      <div className="w-full flex flex-col md:flex-row gap-4 h-[440px] items-stretch overflow-hidden">
        {explorerColumns.map((col, idx) => {
          const filteredItems = filterItems(col.items);

          return (
            <div key={idx} className={getColumnVisibilityClass(idx, explorerColumns.length)}>
              {/* Column Title Header */}
              <div className="px-3.5 py-2.5 bg-slate-50/90 dark:bg-slate-900/90 border-b border-slate-150 dark:border-slate-800 select-none flex items-center justify-between shrink-0 font-bold">
                <span className="text-xs font-black text-slate-900 dark:text-slate-105">{col.title}</span>
                <Badge variant="secondary" className="text-[9px] font-black leading-none py-0.5 px-1 bg-slate-200/50">
                  {filteredItems.length}
                </Badge>
              </div>

              {/* Column Body Scroll list */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
                {filteredItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <FileText className="h-6 w-6 text-slate-350 mb-1" />
                    <p className="text-[10px] text-slate-405 font-bold italic">No matching areas</p>
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selectedPath[idx + 1] === item.id;
                    const style = LEVEL_COLORS[item.type] || LEVEL_COLORS.ward;
                    
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleCardClick(idx, item.id)}
                        className={cn(
                          "p-2.5 rounded-lg border transition-all duration-200 cursor-pointer select-none relative group",
                          isSelected
                            ? "border-blue-500 bg-blue-50/15 dark:bg-blue-950/20 shadow-xs scale-[1.01]"
                            : "border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700 bg-white hover:bg-slate-50/40 dark:bg-slate-900/40 shadow-3xs"
                        )}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            {item.type === "ward" && item.number ? (
                              <span className="text-[9px] text-slate-450 font-bold block leading-none mb-0.5">Ward {item.number}</span>
                            ) : null}
                            <span className="text-xs font-black text-slate-850 dark:text-slate-105 truncate block leading-tight" title={item.label}>
                              {item.label}
                            </span>
                          </div>
                          
                          {/* Indicator dot */}
                          <div className={cn("h-1.5 w-1.5 rounded-full shrink-0 mt-1", style.dot)} />
                        </div>

                        {/* Counts and Children metadata summary */}
                        <div className="flex items-center justify-between text-[8px] font-bold text-slate-405 mt-2.5 border-t border-slate-100 dark:border-slate-800/80 pt-1.5">
                          <span className="font-extrabold text-slate-700 dark:text-slate-300">{item.total} cases</span>
                          {item.childCount && item.childCount > 0 ? (
                            <span>{item.childCount} child node{item.childCount === 1 ? "" : "s"}</span>
                          ) : null}
                        </div>

                        {/* Mini-grid metrics preview */}
                        <div className="grid grid-cols-4 gap-0.5 text-center text-[7.5px] font-bold text-slate-400 mt-1">
                          <div className="bg-slate-100/50 rounded py-0.5">Act: {item.active}</div>
                          <div className="bg-slate-100/50 rounded py-0.5">Pend: {item.pending}</div>
                          <div className="bg-slate-100/50 rounded py-0.5">Clsd: {item.closed}</div>
                          <div className="bg-slate-100/50 rounded py-0.5 text-rose-500">Ovd: {item.overdue}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Side-by-side: Complaint list & Contextual Summary Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-stretch">
        
        {/* Left Column: Complaint details list (Rendered only when a Ward is selected) */}
        <div className={cn("min-w-0 flex flex-col", isWardSelected ? "lg:col-span-3" : "hidden")}>
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0 select-none">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-900 dark:text-slate-105 uppercase tracking-widest leading-none">Local Complaint list</h4>
                  <span className="text-[10px] text-slate-450 block mt-1 font-bold">Registered complaints in Ward No. {selectedNodeDetails?.number} ({selectedNodeDetails?.label})</span>
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] font-black py-0.5">
                {wardComplaints.length} cases
              </Badge>
            </div>

            {/* Complaints list grid/table */}
            <div className="flex-1 overflow-x-auto min-h-[300px]">
              {wardComplaints.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-20 select-none">
                  <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-xs text-slate-500 font-bold">Zero active complaints inside this ward boundary</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Administrative structures are preserved cleanly</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50/50 dark:bg-slate-900/50 text-[9.5px] uppercase tracking-wider font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">Case Number</th>
                      <th className="py-2.5 px-4">Subject</th>
                      <th className="py-2.5 px-4">Category</th>
                      <th className="py-2.5 px-4">Priority</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Filed Date</th>
                      <th className="py-2.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {wardComplaints.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-950/20 transition-all font-medium">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-200">
                          {c.id.slice(0, 8)}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 max-w-[200px] truncate" title={c.title}>
                          {c.title}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {c.type || "Other"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[9px] font-bold border",
                            c.priority === "Urgent" ? "bg-rose-50 text-rose-700 border-rose-100" :
                            c.priority === "High" ? "bg-amber-50 text-amber-700 border-amber-100" :
                            "bg-slate-50 text-slate-655 border-slate-150"
                          )}>
                            {c.priority || "Medium"}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider",
                            c.status === "Resolved" || c.status === "Closed" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" :
                            c.overdue ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" :
                            "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                          )}>
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 font-mono">
                          {formatDate(c.createdAt)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button asChild size="sm" variant="ghost" className="h-7 text-[10px] font-extrabold hover:text-blue-600">
                            <Link href={`/complaints/${c.id}`}>
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Contextual Summary Panel (Always visible) */}
        <div className={cn("min-w-0 flex flex-col", isWardSelected ? "lg:col-span-1" : "lg:col-span-4")}>
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden flex flex-col h-full">
            <div className="p-4 border-b border-slate-150 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 select-none">
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <MapPin className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Area Summary</span>
                  <span className="text-sm font-black text-slate-900 dark:text-slate-105 truncate block mt-0.5" title={currentAreaSummary?.name}>
                    {currentAreaSummary?.name || "No Area Selected"}
                  </span>
                </div>
              </div>
              <Badge variant="secondary" className="text-[8px] font-black uppercase tracking-wider py-0.5 shrink-0">
                Level: {currentAreaSummary?.type || "None"}
              </Badge>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-5">
              
              {/* Parent & Child details */}
              <div className="grid grid-cols-2 gap-3 text-[10px] font-bold border-b border-slate-100 dark:border-slate-850 pb-4">
                <div className="p-2 bg-slate-50 dark:bg-slate-950/20 border border-slate-155 dark:border-slate-855 rounded-lg">
                  <span className="text-slate-400 block uppercase tracking-wider mb-0.5">Parent Boundary:</span>
                  <span className="text-slate-700 dark:text-slate-200 font-extrabold truncate block">{currentAreaSummary?.parent || "—"}</span>
                </div>
                <div className="p-2 bg-slate-50 dark:bg-slate-950/20 border border-slate-155 dark:border-slate-855 rounded-lg">
                  <span className="text-slate-400 block uppercase tracking-wider mb-0.5">Direct Children:</span>
                  <span className="text-slate-700 dark:text-slate-200 font-extrabold block">{currentAreaSummary?.children.length || 0} nodes</span>
                </div>
              </div>

              {/* Status breakdown deck */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-2 gap-2 text-center border-b border-slate-100 dark:border-slate-850 pb-4">
                <div className="p-2 border border-slate-150 dark:border-slate-800 rounded-lg bg-slate-50/50">
                  <span className="text-lg font-black text-slate-900 dark:text-slate-50 block leading-tight">{currentAreaSummary?.total}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest block mt-0.5">Total Cases</span>
                </div>
                <div className="p-2 border border-slate-150 dark:border-slate-800 rounded-lg bg-slate-50/50">
                  <span className="text-lg font-black text-blue-600 block leading-tight">{currentAreaSummary?.active}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest block mt-0.5">Active</span>
                </div>
                <div className="p-2 border border-slate-150 dark:border-slate-800 rounded-lg bg-slate-50/50">
                  <span className="text-lg font-black text-amber-500 block leading-tight">{currentAreaSummary?.pending}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest block mt-0.5">Pending</span>
                </div>
                <div className="p-2 border border-slate-150 dark:border-slate-800 rounded-lg bg-slate-50/50">
                  <span className="text-lg font-black text-rose-500 block leading-tight">{currentAreaSummary?.overdue}</span>
                  <span className="text-[8px] text-slate-400 uppercase font-black tracking-widest block mt-0.5">Overdue</span>
                </div>
              </div>

              {/* Priority statistics */}
              <div className="space-y-2 border-b border-slate-100 dark:border-slate-855 pb-4">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Priority Breakdown</h4>
                <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold">
                  <div className="p-1 rounded bg-rose-50/60 text-rose-700 border border-rose-100/40">
                    <span className="block font-black">{currentAreaSummary?.priority.Urgent || 0}</span>
                    <span className="text-[7.5px] uppercase font-bold">Urg</span>
                  </div>
                  <div className="p-1 rounded bg-amber-50/60 text-amber-700 border border-amber-100/40">
                    <span className="block font-black">{currentAreaSummary?.priority.High || 0}</span>
                    <span className="text-[7.5px] uppercase font-bold">High</span>
                  </div>
                  <div className="p-1 rounded bg-blue-50/60 text-blue-700 border border-blue-100/40">
                    <span className="block font-black">{currentAreaSummary?.priority.Medium || 0}</span>
                    <span className="text-[7.5px] uppercase font-bold">Med</span>
                  </div>
                  <div className="p-1 rounded bg-slate-50 text-slate-500 border border-slate-150">
                    <span className="block font-black">{currentAreaSummary?.priority.Low || 0}</span>
                    <span className="text-[7.5px] uppercase font-bold">Low</span>
                  </div>
                </div>
              </div>

              {/* Categories list progress bars */}
              <div className="space-y-3 border-b border-slate-100 dark:border-slate-855 pb-4">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subtree Categories</h4>
                {currentAreaSummary && currentAreaSummary.categories.length === 0 ? (
                  <p className="text-xs text-slate-450 italic text-center py-2 font-bold">No categories recorded</p>
                ) : (
                  <div className="space-y-2.5">
                    {currentAreaSummary?.categories.map((c) => (
                      <div key={c.label} className="space-y-1 font-bold text-[11px]">
                        <div className="flex justify-between items-center text-slate-655 dark:text-slate-355 leading-none">
                          <span className="truncate pr-2">{c.label}</span>
                          <span className="shrink-0">{c.count} ({c.pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${c.pct}%` }}
                            className="h-full bg-blue-600 rounded-full"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent complaint timeline */}
              <div className="space-y-2.5">
                <h4 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recent Activity</h4>
                {currentAreaSummary && currentAreaSummary.recent.length === 0 ? (
                  <p className="text-xs text-slate-450 italic text-center py-4 font-bold">No recent cases</p>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-855 space-y-2">
                    {currentAreaSummary?.recent.map((c) => (
                      <li key={c.id} className="pt-2 first:pt-0">
                        <Link href={`/complaints/${c.id}`} className="block group">
                          <div className="flex items-start justify-between gap-2.5">
                            <span className="text-[11px] font-bold text-slate-755 group-hover:text-blue-650 dark:text-slate-300 dark:group-hover:text-blue-400 transition-colors line-clamp-2 leading-tight">
                              {c.title}
                            </span>
                            <ChevronRight className="h-3.5 w-3.5 text-slate-350 group-hover:text-blue-500 shrink-0 transition-colors mt-0.5" />
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[8.5px] font-bold text-slate-400 uppercase">
                            <span className="font-mono bg-slate-50 dark:bg-slate-950 px-1 border rounded">{c.id.slice(0, 8)}</span>
                            <span>&middot;</span>
                            <Badge variant={c.overdue ? "destructive" : "secondary"} className="text-[7.5px] px-1 font-black py-0">
                              {c.status}
                            </Badge>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

            </div>

            {/* Bottom details status bar */}
            <div className="p-3 bg-slate-50/40 dark:bg-slate-900/40 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-[10px] font-bold text-slate-450 rounded-b-xl shrink-0 select-none">
              <div>
                <span className="text-[8px] text-slate-400 uppercase tracking-wider block">Avg Resolution Duration</span>
                <span className="text-slate-800 dark:text-slate-205 mt-0.5 block flex items-center gap-1 truncate font-black">
                  <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {currentAreaSummary?.avgResolutionTime}
                </span>
              </div>
              <div>
                <span className="text-[8px] text-slate-400 uppercase tracking-wider block">Weekly Trend</span>
                <span className={cn("mt-0.5 block flex items-center gap-1 truncate font-black", currentAreaSummary?.trendDirection === "up" ? "text-rose-600" : currentAreaSummary?.trendDirection === "down" ? "text-emerald-600" : "text-slate-600")}>
                  {currentAreaSummary?.trendDirection === "up" ? <TrendingUp className="h-3.5 w-3.5 shrink-0" /> : currentAreaSummary?.trendDirection === "down" ? <TrendingDown className="h-3.5 w-3.5 shrink-0" /> : <Activity className="h-3.5 w-3.5 shrink-0" />}
                  {currentAreaSummary?.trendText}
                </span>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
