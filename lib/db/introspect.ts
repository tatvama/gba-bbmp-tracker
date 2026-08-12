import "server-only";
import { sql } from "@/lib/db/pool";

/**
 * Foreign-key map, used to resolve the embedded-resource syntax in select
 * strings (`ward:wards!ward_id(new_no)`).
 *
 * PostgREST could resolve those relationships because it introspects the
 * schema; this does the same thing, once per process, straight from
 * pg_constraint. Reading the real constraints rather than guessing from a
 * `<table>_id` naming convention means an embed whose relationship does not
 * actually exist fails loudly instead of silently returning nulls.
 */

export interface ForeignKey {
  constraint: string;
  srcTable: string;
  srcColumn: string;
  tgtTable: string;
  tgtColumn: string;
}

let cache: Promise<ForeignKey[]> | null = null;

export function loadForeignKeys(): Promise<ForeignKey[]> {
  if (cache) return cache;
  cache = sql<ForeignKey>(
    `select con.conname                    as "constraint",
            src.relname                    as "srcTable",
            srcatt.attname                 as "srcColumn",
            tgt.relname                    as "tgtTable",
            tgtatt.attname                 as "tgtColumn"
       from pg_constraint con
       join pg_class     src    on src.oid = con.conrelid
       join pg_class     tgt    on tgt.oid = con.confrelid
       join pg_namespace ns     on ns.oid  = src.relnamespace
       join unnest(con.conkey)  with ordinality as k(attnum, ord) on true
       join unnest(con.confkey) with ordinality as f(attnum, ord) on f.ord = k.ord
       join pg_attribute srcatt on srcatt.attrelid = con.conrelid
                               and srcatt.attnum   = k.attnum
       join pg_attribute tgtatt on tgtatt.attrelid = con.confrelid
                               and tgtatt.attnum   = f.attnum
      where con.contype = 'f'
        and ns.nspname  = 'public'
        and array_length(con.conkey, 1) = 1`,
  ).then((r) => r.rows);
  // A failed introspection must not be cached as a permanent failure.
  cache.catch(() => {
    cache = null;
  });
  return cache;
}

/** Only for tests, which swap the database between cases. */
export function resetForeignKeyCache() {
  cache = null;
}

export type Relationship =
  | { kind: "to-one"; localColumn: string; foreignColumn: string }
  | { kind: "to-many"; localColumn: string; foreignColumn: string };

/**
 * Works out how `baseTable` relates to `embedTable`.
 *
 * `hint` is the part after `!` in a select string. PostgREST accepts either a
 * column name or a constraint name there; both are matched, column first,
 * because every call site in this codebase names a column.
 */
export async function resolveRelationship(
  baseTable: string,
  embedTable: string,
  hint?: string,
): Promise<Relationship> {
  const fks = await loadForeignKeys();
  const matchesHint = (fk: ForeignKey) =>
    !hint || fk.srcColumn === hint || fk.constraint === hint;

  // base -> embed: the FK column lives on the base table (a "belongs to").
  const forward = fks.filter(
    (fk) => fk.srcTable === baseTable && fk.tgtTable === embedTable && matchesHint(fk),
  );
  const onlyForward = forward.length === 1 ? forward[0] : undefined;
  if (onlyForward) {
    return {
      kind: "to-one",
      localColumn: onlyForward.srcColumn,
      foreignColumn: onlyForward.tgtColumn,
    };
  }

  // embed -> base: the FK column lives on the embedded table (a "has many").
  const reverse = fks.filter(
    (fk) => fk.srcTable === embedTable && fk.tgtTable === baseTable && matchesHint(fk),
  );
  const onlyReverse = reverse.length === 1 ? reverse[0] : undefined;
  if (onlyReverse) {
    return {
      kind: "to-many",
      localColumn: onlyReverse.tgtColumn,
      foreignColumn: onlyReverse.srcColumn,
    };
  }

  const ambiguous = forward.length > 1 || reverse.length > 1;
  throw new Error(
    ambiguous
      ? `Ambiguous relationship "${baseTable}" -> "${embedTable}": ` +
        `${forward.length + reverse.length} foreign keys match` +
        (hint ? ` the hint "${hint}"` : "") +
        ". Disambiguate with the !column syntax."
      : `No foreign key relates "${baseTable}" to "${embedTable}"` +
        (hint ? ` via "${hint}"` : "") +
        ".",
  );
}
