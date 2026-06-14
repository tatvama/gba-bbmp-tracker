import Link from "next/link";
import {
  PhoneOff,
  ShieldAlert,
  GitMerge,
  Building2,
  Clock,
  CopyX,
  FileWarning,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

const REPORTS = [
  { href: "/reports/missing-contacts", title: "Missing engineer contacts", desc: "Sub-divisions with no officer on record.", icon: PhoneOff },
  { href: "/reports/pending-verification", title: "Pending verification", desc: "Contacts not yet verified.", icon: ShieldAlert },
  { href: "/reports/mapping", title: "Ward → sub-division mapping", desc: "Full lineage with derived corporation.", icon: GitMerge },
  { href: "/reports/by-corporation", title: "Corporation-wise contacts", desc: "Contacts grouped by corporation.", icon: Building2 },
  { href: "/reports/recent", title: "Recently changed", desc: "Latest contact edits.", icon: Clock },
  { href: "/reports/duplicates", title: "Duplicate contacts", desc: "Matched by phone / email / name.", icon: CopyX },
  { href: "/reports/complaints-pending", title: "Complaint / RTI pending", desc: "Open complaints and RTIs.", icon: FileWarning },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Reports" description="Exportable views for field work and review. Every report exports to CSV and XLSX." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href}>
              <Card className="h-full transition-colors hover:border-primary/50">
                <CardContent className="flex h-full flex-col gap-2 p-5">
                  <Icon className="h-5 w-5 text-primary" />
                  <h2 className="font-medium">{r.title}</h2>
                  <p className="text-sm text-muted-foreground">{r.desc}</p>
                  <span className="mt-auto flex items-center gap-1 pt-2 text-sm text-primary">
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
