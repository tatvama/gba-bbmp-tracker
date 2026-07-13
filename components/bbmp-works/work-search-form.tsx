"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { WorkSearchRequest } from "@/lib/bbmp-works/types";

type FieldKey = keyof WorkSearchRequest;

const PRIMARY_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "jobNumber", label: "Job number" },
  { key: "wardNumber", label: "Ward number" },
  { key: "wardName", label: "Ward name" },
  { key: "workName", label: "Work name" },
  { key: "division", label: "Division" },
];

const MORE_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "workNumber", label: "Work number" },
  { key: "tenderNumber", label: "Tender number" },
  { key: "workOrderNumber", label: "Work order number" },
  { key: "zone", label: "Zone" },
  { key: "subDivision", label: "Sub-division" },
  { key: "location", label: "Location" },
  { key: "layoutName", label: "Layout name" },
  { key: "roadName", label: "Road name" },
  { key: "contractorName", label: "Contractor name" },
  { key: "engineerName", label: "Engineer / officer name" },
];

export function WorkSearchForm({ initial }: { initial?: WorkSearchRequest }) {
  const router = useRouter();
  const [values, setValues] = React.useState<WorkSearchRequest>(initial ?? {});
  const [showMore, setShowMore] = React.useState(() => MORE_FIELDS.some((f) => !!initial?.[f.key]));

  function setField(key: FieldKey, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value && value.trim()) params.set(key, value.trim());
    }
    const qs = params.toString();
    router.push(qs ? `/bbmp-works/search?${qs}` : "/bbmp-works/search");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRIMARY_FIELDS.map((f) => (
          <div key={f.key}>
            <Label variant="field" className="mb-1 block">
              {f.label}
            </Label>
            <Input
              value={values[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              placeholder={f.label}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
      >
        {showMore ? "Fewer filters" : "More filters"}
        {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {showMore && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MORE_FIELDS.map((f) => (
            <div key={f.key}>
              <Label variant="field" className="mb-1 block">
                {f.label}
              </Label>
              <Input
                value={values[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                placeholder={f.label}
              />
            </div>
          ))}
        </div>
      )}

      <div>
        <Button type="submit">
          <Search className="h-4 w-4" /> Search
        </Button>
      </div>
    </form>
  );
}
