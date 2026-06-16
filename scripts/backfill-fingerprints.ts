/**
 * Backfill image fingerprints (SHA-256 + pHash/dHash + EXIF) for existing
 * complaint_documents that predate the duplicate-detection feature, then flag
 * byte-identical (exact-SHA) reuse across different cases. Perceptual/EXIF
 * clusters are surfaced live by /complaints/duplicates (runDuplicatePhotoAudit).
 *
 *   npm run db:backfill-fingerprints
 *
 * Uses the SAME fingerprint code as the upload route (lib/ocr/image-fingerprint),
 * so backfilled hashes match newly-uploaded ones exactly.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./db";
import { fingerprintImage } from "../lib/ocr/image-fingerprint";

loadEnv();

const PAGE = 200;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.\n");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Fingerprint every document missing a SHA.
  let done = 0, failed = 0;
  for (;;) {
    const { data, error } = await admin
      .from("complaint_documents")
      .select("id, storage_bucket, storage_path, mime_type")
      .is("file_sha256", null)
      .limit(PAGE);
    if (error) {
      console.error("✗ query failed:", error.message);
      break;
    }
    if (!data || data.length === 0) break;

    for (const d of data) {
      try {
        const { data: blob, error: dlErr } = await admin.storage
          .from(d.storage_bucket as string)
          .download(d.storage_path as string);
        if (dlErr || !blob) {
          failed++;
          continue;
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        const fp = await fingerprintImage(buffer, (d.mime_type as string) ?? null);
        await admin
          .from("complaint_documents")
          .update({
            file_sha256: fp.sha256,
            phash: fp.phash,
            dhash: fp.dhash,
            exif_gps_lat: fp.gpsLat,
            exif_gps_lon: fp.gpsLon,
            exif_taken_at: fp.takenAt,
          })
          .eq("id", d.id);
        done++;
        if (done % 25 === 0) console.log(`  …fingerprinted ${done}`);
      } catch (e) {
        failed++;
        console.warn(`  ✗ ${d.id}:`, e instanceof Error ? e.message : e);
      }
    }
    if (data.length < PAGE) break;
  }
  console.log(`✓ Fingerprinted ${done} document(s)${failed ? `, ${failed} failed/skipped` : ""}.`);

  // 2) Flag exact-SHA reuse across DIFFERENT cases.
  const { data: all } = await admin
    .from("complaint_documents")
    .select("id, complaint_id, file_sha256")
    .not("file_sha256", "is", null);
  const groups = new Map<string, { id: string; complaint_id: string }[]>();
  for (const r of all ?? []) {
    const sha = r.file_sha256 as string;
    const g = groups.get(sha) ?? [];
    g.push({ id: r.id as string, complaint_id: r.complaint_id as string });
    groups.set(sha, g);
  }
  const dupeIds: string[] = [];
  for (const g of groups.values()) {
    if (g.length > 1 && new Set(g.map((x) => x.complaint_id)).size > 1) {
      dupeIds.push(...g.map((x) => x.id));
    }
  }
  if (dupeIds.length) {
    const nowIso = new Date().toISOString();
    for (let i = 0; i < dupeIds.length; i += 100) {
      const batch = dupeIds.slice(i, i + 100);
      await admin
        .from("complaint_documents")
        .update({ is_duplicate: true, verification_status: "Duplicate", dup_severity: "High", dup_checked_at: nowIso })
        .in("id", batch);
    }
  }
  console.log(`✓ Flagged ${dupeIds.length} document(s) as exact-SHA duplicates across cases.`);
  console.log("→ Open /complaints/duplicates for the full perceptual/EXIF cluster audit.");
}

main();
