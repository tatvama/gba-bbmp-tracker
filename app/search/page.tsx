import Link from "next/link";
import {
  Map,
  Users,
  Network,
  Wrench,
  FileWarning,
  Building2,
  SearchX,
} from "lucide-react";
import { CORP_NAME } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CorpPill, VerificationBadge } from "@/components/badges";
import { SearchBox } from "@/components/search-box";
import { globalSearch } from "@/lib/queries";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Search",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const results = term ? await globalSearch(term) : null;
  const total = results
    ? results.wards.length +
      results.contacts.length +
      results.divisions.length +
      results.subdivisions.length +
      results.complaints.length +
      results.gbaWards.length
    : 0;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero search */}
      <div className="mb-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mb-4 text-sm text-muted-foreground">
          Search across wards, contacts, divisions, sub-divisions and complaints.
        </p>
        <SearchBox initial={term} />
      </div>

      {!results && (
        <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center">
          <p className="text-sm font-medium text-foreground/60">
            Type a ward number, officer name, phone, or AC name to search.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Also press <kbd className="rounded border bg-card px-1.5 py-0.5 text-[10px]">⌘K</kbd> from any page to search quickly.
          </p>
        </div>
      )}

      {results && total === 0 && (
        <div className="rounded-xl border border-dashed bg-muted/30 py-16 text-center">
          <SearchX className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-semibold text-foreground/70">
            No results for &ldquo;{term}&rdquo;
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try a ward number, officer name, division, or sub-division.
          </p>
        </div>
      )}

      {results && total > 0 && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{total}</span> result
            {total === 1 ? "" : "s"} for &ldquo;{term}&rdquo;
          </p>

          <ResultGroup title="Wards" icon={Map} count={results.wards.length}>
            {results.wards.map((w) => (
              <ResultRow
                key={w.id}
                href={`/wards/${w.new_no}`}
                title={`#${w.new_no} · ${w.new_name}`}
                sub={w.assembly_constituency ?? ""}
              >
                {w.derived_corporation && (
                  <CorpPill
                    code={w.derived_corporation.code}
                    name={w.derived_corporation.code}
                    derived
                  />
                )}
                <VerificationBadge status={w.verification_status} />
              </ResultRow>
            ))}
          </ResultGroup>

          <ResultGroup
            title="Contacts"
            icon={Users}
            count={results.contacts.length}
          >
            {results.contacts.map((c) => (
              <ResultRow
                key={c.id}
                href={`/contacts/${c.id}`}
                title={c.full_name}
                sub={`${c.designation}${c.phone ? " · " + formatPhone(c.phone) : ""}`}
              >
                <VerificationBadge status={c.verification_status} />
              </ResultRow>
            ))}
          </ResultGroup>

          <ResultGroup
            title="GBA wards"
            icon={Building2}
            count={results.gbaWards.length}
          >
            {results.gbaWards.map((w) => (
              <ResultRow
                key={`${w.corporation_code}-${w.ward_no}`}
                href={`/corporations/${w.corporation_code}`}
                title={`${w.ward_name_en}`}
                sub={`${CORP_NAME[w.corporation_code] ?? w.corporation_code} · ward ${w.ward_no} · ${w.division} / ${w.subdivision}`}
              />
            ))}
          </ResultGroup>

          <ResultGroup
            title="Divisions"
            icon={Network}
            count={results.divisions.length}
          >
            {results.divisions.map((d) => (
              <ResultRow
                key={d.id}
                href={`/divisions/${d.id}`}
                title={d.name}
                sub="Division"
              />
            ))}
          </ResultGroup>

          <ResultGroup
            title="Sub-divisions"
            icon={Wrench}
            count={results.subdivisions.length}
          >
            {results.subdivisions.map((s) => (
              <ResultRow
                key={s.id}
                href={`/sub-divisions/${s.id}`}
                title={s.name}
                sub={s.division?.name ?? "Sub-division"}
              />
            ))}
          </ResultGroup>

          <ResultGroup
            title="Complaints / RTI"
            icon={FileWarning}
            count={results.complaints.length}
          >
            {results.complaints.map((c) => (
              <ResultRow
                key={c.id}
                href={`/complaints#${c.id}`}
                title={c.title}
                sub={c.type}
              >
                <Badge variant="muted">{c.status}</Badge>
              </ResultRow>
            ))}
          </ResultGroup>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-md bg-primary/8 p-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <Badge variant="muted" className="text-[10px]">
          {count}
        </Badge>
      </div>
      <Card className="shadow-sm">
        <CardContent className="divide-y p-0">{children}</CardContent>
      </Card>
    </section>
  );
}

function ResultRow({
  href,
  title,
  sub,
  children,
}: {
  href: string;
  title: string;
  sub?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3 transition-colors duration-100 hover:bg-muted/50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        {sub && (
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </Link>
  );
}
