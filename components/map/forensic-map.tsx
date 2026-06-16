"use client";

import "leaflet/dist/leaflet.css";
import * as React from "react";
import type { MapPoint } from "@/lib/queries";

const COLOR: Record<string, string> = {
  complaint: "#3A6EA5",
  "photo:ok": "#1F7A6E",
  "photo:far": "#C04A4A",
  "photo:no_reference": "#E0922F",
  "photo:no_gps": "#9A8C7A",
};

function colorFor(p: MapPoint): string {
  if (p.kind === "complaint") return COLOR.complaint!;
  return COLOR[`photo:${p.flag ?? "no_gps"}`] ?? COLOR["photo:no_gps"]!;
}

export function ForensicMap({ points }: { points: MapPoint[] }) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | null = null;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
      map = L.map(ref.current).setView([12.9716, 77.5946], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const latlngs: [number, number][] = [];
      for (const p of points) {
        if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
        latlngs.push([p.lat, p.lon]);
        const safe = (p.label ?? "").replace(/</g, "&lt;");
        L.circleMarker([p.lat, p.lon], {
          radius: p.kind === "complaint" ? 6 : 7,
          color: colorFor(p),
          weight: 2,
          fillColor: colorFor(p),
          fillOpacity: 0.55,
        })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:12px"><strong>${p.kind === "photo" ? "Photo" : "Complaint"}</strong><br/>${safe}` +
              (p.kind === "photo" && p.flag === "far" ? '<br/><span style="color:#C04A4A">⚠ GPS off-site</span>' : "") +
              `<br/><a href="/complaints/${p.complaintId}">Open case →</a></div>`,
          );
      }
      if (latlngs.length) map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 15 });
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [points]);

  return <div ref={ref} className="h-[72vh] w-full rounded-xl border" />;
}
