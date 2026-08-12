/**
 * Copies every object out of Supabase Storage into Cloudflare R2, so nothing is
 * lost when the Supabase project is torn down.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json \
 *     scripts/migrate-supabase-storage-to-r2.ts <objects.csv> [--commit]
 *
 * The CSV is `bucket_id,name,size,mime` with a header row, exported from the
 * source project's storage.objects table.
 *
 * KEY MAPPING: a Supabase object at bucket `B`, path `P` becomes the R2 key
 * `B/P`. That is deliberate — the application's storage helper now treats a
 * "bucket" as nothing more than an R2 key prefix, so every (bucket, path) pair
 * already stored in the database keeps resolving without a data migration.
 *
 * Downloads use Supabase's Storage REST API with plain fetch rather than
 * @supabase/supabase-js, because that package is being removed and reinstating
 * it just to run this once would defeat the point.
 *
 * Idempotent: an object already present in R2 at the right size is skipped, so
 * the script can be re-run after a partial failure. Without --commit it only
 * reports what it would do.
 */
import dotenv from "dotenv";
dotenv.config();

import { readFileSync } from "node:fs";
import { S3Client, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const SUPABASE_URL = process.env.MIGRATE_SUPABASE_URL;
const SERVICE_KEY = process.env.MIGRATE_SUPABASE_SERVICE_ROLE_KEY;

const COMMIT = process.argv.includes("--commit");

if (!process.argv[2]) {
  console.error("usage: migrate-supabase-storage-to-r2.ts <objects.csv> [--commit]");
  process.exit(1);
}
const csvPath: string = process.argv[2];
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Set MIGRATE_SUPABASE_URL and MIGRATE_SUPABASE_SERVICE_ROLE_KEY for the SOURCE project.\n" +
      "They are intentionally separate from the app's own configuration, which no\n" +
      "longer has any Supabase settings.",
  );
  process.exit(1);
}

if (!process.env.R2_BUCKET_NAME) {
  console.error("R2_BUCKET_NAME is not set.");
  process.exit(1);
}
const R2_BUCKET: string = process.env.R2_BUCKET_NAME;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  // R2 rejects the SDK's newer default streaming-checksum flow; see r2-upload.ts.
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

interface ObjectRow {
  bucket: string;
  name: string;
  size: number;
  mime: string;
}

/** Minimal CSV reader — handles the quoted fields psql's COPY CSV emits. */
function parseCsv(text: string): ObjectRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }

  return rows
    .slice(1) // header
    .filter((r) => r.length >= 2 && r[0])
    .map((r) => ({
      bucket: r[0] ?? "",
      name: r[1] ?? "",
      size: Number(r[2] ?? 0),
      mime: r[3] || "application/octet-stream",
    }));
}

async function existsInR2(key: string, expectedSize: number): Promise<boolean> {
  try {
    const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    // A truncated object from an interrupted run must not count as done.
    return expectedSize === 0 || head.ContentLength === expectedSize;
  } catch {
    return false;
  }
}

async function downloadFromSupabase(bucket: string, name: string): Promise<Buffer> {
  const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${name
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) {
    throw new Error(`GET ${bucket}/${name} -> ${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const objects = parseCsv(readFileSync(csvPath, "utf8"));
  const totalBytes = objects.reduce((n, o) => n + o.size, 0);
  console.log(
    `${objects.length} objects, ${(totalBytes / 1_048_576).toFixed(1)} MB -> R2 bucket "${R2_BUCKET}"`,
  );
  console.log(COMMIT ? "MODE: commit\n" : "MODE: dry run (pass --commit to write)\n");

  let copied = 0;
  let skipped = 0;
  const failures: { key: string; reason: string }[] = [];
  const verified: string[] = [];

  for (const [index, obj] of objects.entries()) {
    const key = `${obj.bucket}/${obj.name}`;
    const label = `[${index + 1}/${objects.length}] ${key}`;

    try {
      if (await existsInR2(key, obj.size)) {
        skipped++;
        console.log(`${label} — already in R2, skipped`);
        continue;
      }

      if (!COMMIT) {
        console.log(`${label} — would copy (${obj.size} bytes)`);
        continue;
      }

      const body = await downloadFromSupabase(obj.bucket, obj.name);
      if (obj.size && body.byteLength !== obj.size) {
        throw new Error(`size mismatch: expected ${obj.size}, downloaded ${body.byteLength}`);
      }

      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: obj.mime,
          ContentLength: body.byteLength,
        }),
      );

      // Read back rather than trusting the write.
      const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      if (head.ContentLength !== body.byteLength) {
        throw new Error(`verify failed: R2 reports ${head.ContentLength}, sent ${body.byteLength}`);
      }

      copied++;
      verified.push(key);
      console.log(`${label} — copied ${body.byteLength} bytes, verified`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      failures.push({ key, reason });
      console.log(`${label} — FAILED: ${reason}`);
    }
  }

  console.log(`\ncopied ${copied}, skipped ${skipped}, failed ${failures.length}`);
  if (failures.length) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  ${f.key}\n      ${f.reason}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
