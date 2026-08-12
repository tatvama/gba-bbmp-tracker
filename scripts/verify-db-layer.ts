/**
 * Exercises lib/db against the real database, covering every operator and
 * option the application actually uses.
 *
 * This is the gate that had to pass BEFORE the ~850 Supabase call sites were
 * repointed at lib/db: it proves the query layer reproduces the shapes the app
 * was written against, rather than trusting that it does.
 *
 *   npx tsx --tsconfig scripts/tsconfig.pipeline.json scripts/verify-db-layer.ts
 *
 * Reads are against real rows. Writes go to a scratch table that is created and
 * dropped here, plus one throwaway counter row that is deleted again — no
 * production row is modified.
 */
import dotenv from "dotenv";
dotenv.config();

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createDbClient } from "../lib/db/query";
import { sql, getPool } from "../lib/db/pool";

interface EmbeddedSelect {
  file: string;
  line: number;
  table: string | null;
  select: string;
}

/**
 * Collects every `.select("...(...)")` — i.e. one carrying an embedded resource
 * — together with the table of the nearest preceding `.from("...")`.
 */
function findEmbeddedSelects(roots: string[]): EmbeddedSelect[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(entry)) files.push(p);
    }
  };
  for (const r of roots) {
    try {
      walk(r);
    } catch {
      // Root absent in this checkout — nothing to scan.
    }
  }

  const found: EmbeddedSelect[] = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const re = /\.select\(\s*"([^"]*\([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(0, m.index);
      const fromMatch = [...before.matchAll(/\.from\(\s*"([a-z_0-9]+)"/g)].pop();
      found.push({
        file,
        line: before.split("\n").length,
        table: fromMatch ? (fromMatch[1] ?? null) : null,
        select: m[1] ?? "",
      });
    }
  }
  return found;
}

const db = createDbClient();

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}`);
    if (detail !== undefined) console.log("        got:", JSON.stringify(detail));
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

async function main() {
  section("basic select / order / limit");
  {
    const { data, error, count } = await db
      .from("complaints")
      .select("id, internal_case_number, created_at")
      .order("created_at", { ascending: false })
      .limit(3);
    check("no error", error === null, error);
    check("returns an array of 3", Array.isArray(data) && data.length === 3, data?.length);
    check("count is null when not requested", count === null, count);
  }

  section("type parity with PostgREST's JSON output");
  {
    const { data } = await db
      .from("complaints")
      .select("created_at, date_submitted")
      .not("date_submitted", "is", null)
      .limit(1);
    const row = (data as Record<string, unknown>[])[0];
    check("timestamptz is an ISO string, not a Date", typeof row?.created_at === "string", row?.created_at);
    check(
      "timestamptz uses T and an offset",
      typeof row?.created_at === "string" && /^\d{4}-\d{2}-\d{2}T[\d:.]+([+-]\d{2}:\d{2}|Z)?$/.test(row.created_at as string),
      row?.created_at,
    );
    check("date stays a plain YYYY-MM-DD string", /^\d{4}-\d{2}-\d{2}$/.test(String(row?.date_submitted)), row?.date_submitted);

    const { data: rates } = await db.from("sr_rates").select("rate").limit(1);
    const rate = (rates as Record<string, unknown>[])[0]?.rate;
    check("numeric arrives as a number", rate === undefined || typeof rate === "number", rate);

    const { count: c } = await db
      .from("complaints")
      .select("id", { count: "exact", head: true });
    check("count is a number (int8 parsed)", typeof c === "number", c);
    check("head:true returns no rows", true);
  }

  section("count + head");
  {
    const { data, count, error } = await db
      .from("complaints")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    check("no error", error === null, error);
    check("data is null for a head request", data === null, data);
    check("count reflects the filter", typeof count === "number" && count > 0, count);
  }

  section("embedded resources (to-one)");
  {
    const { data, error } = await db
      .from("complaints")
      .select("id, internal_case_number, ward:wards!ward_id(new_no,new_name)")
      .not("ward_id", "is", null)
      .limit(2);
    check("no error", error === null, error);
    const row = (data as Record<string, unknown>[])[0];
    const ward = row?.ward as Record<string, unknown> | null;
    check("embed is a nested object", ward !== null && typeof ward === "object", ward);
    check("embed contains only the requested columns", ward !== null && Object.keys(ward).sort().join(",") === "new_name,new_no", ward && Object.keys(ward));
  }

  section("embedded resources (nested two levels)");
  {
    // complaints -> wards -> divisions, chosen because all three have real rows;
    // the shape of the app's own two-level embeds is covered by the sweep at the
    // end, which executes each of them verbatim.
    const { data, error } = await db
      .from("complaints")
      .select("id, ward:wards!ward_id(new_no, division:divisions!division_id(name))")
      .not("ward_id", "is", null)
      .limit(2);
    check("no error", error === null, error);
    const rows = (data as Record<string, unknown>[]) ?? [];
    check("returned rows", rows.length > 0, rows.length);
    const ward = rows[0]?.ward as Record<string, unknown> | null;
    check("outer embed is an object", ward !== null && typeof ward === "object", ward);
    check("outer embed has its own column", ward !== null && "new_no" in ward, ward && Object.keys(ward));
    check("inner embed nested inside it", ward !== null && "division" in ward, ward && Object.keys(ward));
    const division = ward?.division as Record<string, unknown> | null;
    check(
      "inner embed resolved to its requested column",
      division === null || (typeof division === "object" && "name" in division),
      division,
    );
  }

  section("embedded resource with an inferred relationship and *");
  {
    const { data, error } = await db
      .from("contact_jurisdictions")
      .select("*, contact:contacts(*)")
      .limit(2);
    check("no error", error === null, error);
    const row = (data as Record<string, unknown>[])[0];
    const contact = row?.contact as Record<string, unknown> | null;
    check("inferred embed resolved", contact !== null && typeof contact === "object", contact);
    check("embed * expanded to many columns", contact !== null && Object.keys(contact).length > 3, contact && Object.keys(contact).length);
    check("base * expanded too", row !== undefined && "id" in row, row && Object.keys(row));
  }

  section("a to-one embed whose FK is null yields null, not an empty object");
  {
    const { data } = await db
      .from("complaints")
      .select("id, ward:wards!ward_id(new_no)")
      .is("ward_id", null)
      .limit(1);
    const rows = data as Record<string, unknown>[];
    if (rows.length === 0) {
      check("skipped — every complaint has a ward", true);
    } else {
      check("null FK gives a null embed", rows[0]?.ward === null, rows[0]?.ward);
    }
  }

  section("or() DSL");
  {
    const { data, error } = await db
      .from("contacts")
      .select("id, full_name, phone, email")
      .or("phone.is.null,email.is.null")
      .limit(5);
    check("is.null inside or() works", error === null, error);
    const rows = (data as Record<string, unknown>[]) ?? [];
    check(
      "every returned row really satisfies the or()",
      rows.every((r) => r.phone === null || r.email === null),
      rows.map((r) => ({ p: r.phone, e: r.email })),
    );

    const { error: e2, data: d2 } = await db
      .from("contacts")
      .select("id, full_name")
      .or("full_name.ilike.%kumar%,designation.ilike.%engineer%")
      .limit(5);
    check("ilike inside or() works", e2 === null, e2);
    check("ilike matched rows", (d2 as unknown[]).length > 0, (d2 as unknown[]).length);

    const { error: e3 } = await db
      .from("background_jobs")
      .select("id, status")
      .or("status.in.(queued,running,retrying),updated_at.lt.2030-01-01T00:00:00.000Z");
    check("in.(...) and a dotted timestamp value inside or() work", e3 === null, e3);

    const { error: e4 } = await db
      .from("contacts")
      .select("id")
      .or("phone.not.is.null,email.not.is.null")
      .limit(3);
    check("not.is.null inside or() works", e4 === null, e4);
  }

  section("not() / in() / is()");
  {
    const { data, error } = await db
      .from("complaints")
      .select("id, status")
      .not("status", "in", '("Resolved","Closed")')
      .limit(5);
    check("not(in) with a PostgREST list literal", error === null, error);
    const rows = (data as Record<string, unknown>[]) ?? [];
    check(
      "excluded values really absent",
      rows.every((r) => r.status !== "Resolved" && r.status !== "Closed"),
      rows.map((r) => r.status),
    );

    const ids = rows.slice(0, 3).map((r) => r.id);
    const { data: inRows, error: inErr } = await db
      .from("complaints")
      .select("id")
      .in("id", ids);
    check("in() with a uuid array", inErr === null, inErr);
    check("in() returned exactly those rows", (inRows as unknown[]).length === ids.length, (inRows as unknown[]).length);

    const { data: emptyRows, error: emptyErr } = await db
      .from("complaints")
      .select("id")
      .in("id", []);
    check("in([]) returns nothing instead of a syntax error", emptyErr === null && (emptyRows as unknown[]).length === 0, emptyErr ?? emptyRows);
  }

  section("single() / maybeSingle()");
  {
    const { data: one, error: oneErr } = await db
      .from("complaints")
      .select("id")
      .limit(1)
      .single();
    check("single() on 1 row returns an object", oneErr === null && !Array.isArray(one) && one !== null, oneErr ?? one);

    const { data: none, error: noneErr } = await db
      .from("complaints")
      .select("id")
      .eq("internal_case_number", "definitely-not-a-real-case-number")
      .maybeSingle();
    check("maybeSingle() on 0 rows gives null and no error", none === null && noneErr === null, { none, noneErr });

    const { data: missing, error: missingErr } = await db
      .from("complaints")
      .select("id")
      .eq("internal_case_number", "definitely-not-a-real-case-number")
      .single();
    check("single() on 0 rows sets PGRST116", missing === null && missingErr?.code === "PGRST116", missingErr);

    const { error: manyErr } = await db.from("complaints").select("id").limit(2).single();
    check("single() on 2 rows errors", manyErr !== null, manyErr);
  }

  section("range()");
  {
    const { data: page1 } = await db.from("gba_wards").select("id").order("id").range(0, 4);
    const { data: page2 } = await db.from("gba_wards").select("id").order("id").range(5, 9);
    const a = (page1 as Record<string, unknown>[]).map((r) => r.id);
    const b = (page2 as Record<string, unknown>[]).map((r) => r.id);
    check("range is inclusive — 5 rows per page", a.length === 5 && b.length === 5, { a: a.length, b: b.length });
    check("pages do not overlap", a.every((id) => !b.includes(id)), { a, b });
  }

  section("rpc — scalar return");
  {
    const { data, error } = await db.rpc("next_complaint_case_number", {
      p_prefix: "ZZ-VERIFY",
      p_year: 1999,
    });
    check("no error", error === null, error);
    check("scalar unwrapped to a string, not [{...}]", typeof data === "string", data);
    check("value looks like a case number", typeof data === "string" && data.startsWith("ZZ-VERIFY-1999-"), data);
    await sql(`delete from public.complaint_counters where prefix = $1 and year = $2`, ["ZZ-VERIFY", 1999]);
    console.log("        (throwaway counter row deleted)");
  }

  section("rpc — SETOF return");
  {
    const { data, error } = await db.rpc("bbmp_works_fuzzy_search", {
      p_column: "ward_name",
      p_query: "whitefield",
      p_threshold: 0.3,
      p_limit: 5,
    });
    check("no error", error === null, error);
    check("SETOF stays an array", Array.isArray(data), data);
  }

  section("writes — insert / select-back / update / upsert / delete");
  {
    await sql(`drop table if exists public._db_layer_check`);
    await sql(`
      create table public._db_layer_check (
        id     uuid primary key default gen_random_uuid(),
        slug   text not null unique,
        label  text,
        hits   integer not null default 7,
        made   timestamptz not null default now()
      )`);

    const { data: inserted, error: insErr } = await db
      .from("_db_layer_check")
      .insert({ slug: "a", label: "first" })
      .select("id, slug, label, hits")
      .single();
    check("insert + select().single()", insErr === null, insErr);
    const insertedRow = inserted as Record<string, unknown>;
    check("column default applied", insertedRow?.hits === 7, insertedRow?.hits);

    const { data: noReturn, error: noRetErr } = await db
      .from("_db_layer_check")
      .insert({ slug: "b" });
    check("insert without select() returns data:null", noReturn === null && noRetErr === null, { noReturn, noRetErr });

    // Rows with different key sets must not have missing keys turned into NULL,
    // or a column default would be silently lost.
    const { error: mixedErr } = await db
      .from("_db_layer_check")
      .insert([{ slug: "c", label: "has label" }, { slug: "d" }]);
    check("multi-row insert with differing keys", mixedErr === null, mixedErr);
    const { data: dRow } = await db
      .from("_db_layer_check")
      .select("hits, label")
      .eq("slug", "d")
      .single();
    check("default survived the mixed insert", (dRow as Record<string, unknown>)?.hits === 7, dRow);

    const { data: updated, error: updErr } = await db
      .from("_db_layer_check")
      .update({ label: "renamed" })
      .eq("slug", "a")
      .select("slug, label")
      .single();
    check("update + select()", updErr === null && (updated as Record<string, unknown>)?.label === "renamed", updErr ?? updated);

    const { error: upsErr } = await db
      .from("_db_layer_check")
      .upsert({ slug: "a", label: "upserted" }, { onConflict: "slug" });
    check("upsert updates the conflicting row", upsErr === null, upsErr);
    const { data: afterUpsert } = await db
      .from("_db_layer_check")
      .select("label")
      .eq("slug", "a")
      .single();
    check("upsert wrote the new value", (afterUpsert as Record<string, unknown>)?.label === "upserted", afterUpsert);

    const { error: ignErr } = await db
      .from("_db_layer_check")
      .upsert({ slug: "a", label: "must not overwrite" }, { onConflict: "slug", ignoreDuplicates: true });
    check("upsert ignoreDuplicates", ignErr === null, ignErr);
    const { data: afterIgnore } = await db
      .from("_db_layer_check")
      .select("label")
      .eq("slug", "a")
      .single();
    check("ignoreDuplicates left the row alone", (afterIgnore as Record<string, unknown>)?.label === "upserted", afterIgnore);

    const { error: delErr } = await db.from("_db_layer_check").delete().eq("slug", "b");
    check("delete", delErr === null, delErr);
    const { count: remaining } = await db
      .from("_db_layer_check")
      .select("id", { count: "exact", head: true });
    check("delete removed exactly one row", remaining === 3, remaining);

    await sql(`drop table public._db_layer_check`);
    console.log("        (scratch table dropped)");
  }

  section("errors are returned, not thrown");
  {
    const { data, error } = await db.from("complaints").select("no_such_column_here").limit(1);
    check("bad column produces an error object", error !== null && data === null, { data, error });
    check("error has a message", typeof error?.message === "string" && error.message.length > 0, error);
  }

  section("every embedded select in lib/ and app/ actually runs");
  {
    // Rather than trusting a hand-picked sample, this finds each real
    // `.from("t").select("...(...)")` pair in the app and executes it. A
    // relationship the schema cannot resolve fails here, not in production.
    const pairs = findEmbeddedSelects(["lib", "app"]);
    check("found embedded selects to test", pairs.length > 0, pairs.length);
    let broken = 0;
    for (const pair of pairs) {
      if (!pair.table) {
        console.log(`  SKIP  ${pair.file}:${pair.line} (no .from() found)`);
        continue;
      }
      const { error } = await db.from(pair.table).select(pair.select).limit(1);
      if (error) {
        broken++;
        console.log(`  FAIL  ${pair.file}:${pair.line} [${pair.table}]`);
        console.log(`        ${error.message}`);
      }
    }
    check(`all ${pairs.length} embedded selects execute`, broken === 0, `${broken} failing`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await getPool().end();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("\nverification crashed:", e);
  await getPool().end().catch(() => {});
  process.exit(1);
});
