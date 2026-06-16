"use client";

import * as React from "react";
import { Calculator } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { expectedBituminous, reconcile } from "@/lib/forensics/material-balance";

/** Theoretical bituminous-material calculator: expected mix/bitumen for a paved
 *  area vs the billed bitumen quantity (over/under-billing indicator). */
export function MaterialCalculator() {
  const [area, setArea] = React.useState("");
  const [thk, setThk] = React.useState("40");
  const [layer, setLayer] = React.useState<"BC" | "DBM">("BC");
  const [billed, setBilled] = React.useState("");

  const a = parseFloat(area), t = parseFloat(thk), b = parseFloat(billed);
  const exp = Number.isFinite(a) && Number.isFinite(t) && a > 0 && t > 0
    ? expectedBituminous({ areaSqm: a, thicknessMm: t, layer })
    : null;
  const rec = exp && Number.isFinite(b) ? reconcile(b, exp.bitumenTonnes) : null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Calculator className="h-4 w-4" /> Material-balance calculator (bituminous)</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="mb-1 block text-xs">Area (sqm)</Label>
          <Input value={area} onChange={(e) => setArea(e.target.value)} inputMode="decimal" placeholder="e.g. 1000" />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Thickness (mm)</Label>
          <Input value={thk} onChange={(e) => setThk(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label className="mb-1 block text-xs">Layer</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={layer} onChange={(e) => setLayer(e.target.value as "BC" | "DBM")}>
            <option value="BC">BC</option>
            <option value="DBM">DBM</option>
          </select>
        </div>
        <div>
          <Label className="mb-1 block text-xs">Billed bitumen (t, optional)</Label>
          <Input value={billed} onChange={(e) => setBilled(e.target.value)} inputMode="decimal" />
        </div>
      </div>
      {exp && (
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span>Expected mix: <strong>{exp.mixTonnes.toFixed(1)} t</strong></span>
          <span>Expected bitumen: <strong>{exp.bitumenTonnes.toFixed(2)} t</strong></span>
          {rec && (
            <Badge variant={rec.flag === "over" ? "destructive" : rec.flag === "under" ? "warning" : "success"}>
              {rec.flag === "ok" ? "Billed within ±10%" : `Billed ${rec.variancePct > 0 ? "+" : ""}${rec.variancePct.toFixed(0)}% vs expected`}
            </Badge>
          )}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Uses typical IS/MoRTH coefficients (BC 5.5% / DBM 4.5% bitumen, mix density 2.4 t/m³). Indicative — verify against the actual mix design.</p>
    </div>
  );
}
