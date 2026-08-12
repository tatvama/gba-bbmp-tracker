import "server-only";
import { sql } from "@/lib/db/pool";
import { resolveRelationship } from "@/lib/db/introspect";
import {
  parseSelect,
  parseDsl,
  parseListLiteral,
  quoteIdent,
  type DslCondition,
  type SelectField,
} from "@/lib/db/parse";

/**
 * A query builder over `pg` that speaks the same fluent API the codebase was
 * written against while Supabase was the backend.
 *
 * WHY this shape rather than raw SQL at every call site: there are ~850 of
 * those call sites across 97 files. Re-deriving each as hand-written SQL during
 * a database migration would put a silent behaviour change behind every one of
 * them. The API surface implemented here is exactly the surface the codebase
 * actually uses — established by enumerating it, not by guessing — so the port
 * is one reviewable module instead of 850 unreviewable edits.
 *
 * Behavioural contract kept from before:
 *   - awaiting a builder resolves to `{ data, error, count }` and NEVER throws;
 *     failures arrive as `error`, because that is what every call site checks.
 *   - `.single()` errors when the row count is not exactly 1.
 *   - `.maybeSingle()` returns `data: null` for no rows.
 *   - a write returns `data: null` unless `.select()` asked for the rows back.
 */

export interface DbError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

export interface DbResult<T> {
  data: T;
  error: DbError | null;
  count: number | null;
}

type Row = Record<string, unknown>;

/**
 * `data` is intentionally untyped, because that is precisely what it was before.
 *
 * Supabase's builder, used without generated database types, resolved to
 * `PostgrestQueryBuilder<any, any>` — so `data` was `any` at all ~850 call
 * sites, and each one narrowed it with its own cast or interface. Returning
 * anything stricter here would not add real safety; it would demand 666
 * hand-written type assertions during a database migration, every one of them a
 * guess about a shape the compiler had never checked. Parity first: giving these
 * queries real types is worthwhile, but it is a separate change that can be done
 * table by table without a cutover deadline attached.
 */
/* eslint-disable-next-line -- deliberately `any`, see above */
type Untyped = any;

function toDbError(e: unknown): DbError {
  const err = e as { message?: string; code?: string; detail?: string; hint?: string };
  return {
    message: err?.message ?? String(e),
    code: err?.code ?? "DB_ERROR",
    details: err?.detail ?? null,
    hint: err?.hint ?? null,
  };
}

/** Collects bound values so nothing is ever interpolated into SQL text. */
class Params {
  readonly values: unknown[] = [];
  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

interface OrderTerm {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

type WhereNode =
  | { type: "cond"; cond: DslCondition }
  | { type: "or"; conds: DslCondition[] };

const COMPARISON: Record<string, string> = {
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
};

function condToSql(cond: DslCondition, table: string, params: Params): string {
  const col = `${table}.${quoteIdent(cond.column, "column name")}`;
  const { op, value } = cond;
  let expr: string;

  switch (op) {
    case "eq":
      expr = value === null ? `${col} is null` : `${col} = ${params.add(value)}`;
      break;
    case "neq":
      expr = value === null ? `${col} is not null` : `${col} <> ${params.add(value)}`;
      break;
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      expr = `${col} ${COMPARISON[op]} ${params.add(value)}`;
      break;
    case "like":
      expr = `${col} like ${params.add(value)}`;
      break;
    case "ilike":
      expr = `${col} ilike ${params.add(value)}`;
      break;
    case "in": {
      const list = Array.isArray(value) ? value : parseListLiteral(String(value));
      // PostgREST returns nothing for an empty list; `in ()` is a syntax error.
      expr = list.length === 0
        ? "false"
        : `${col} in (${list.map((v) => params.add(v)).join(", ")})`;
      break;
    }
    case "is":
      if (value === null) expr = `${col} is null`;
      else if (value === true) expr = `${col} is true`;
      else if (value === false) expr = `${col} is false`;
      else throw new Error(`.is() accepts null, true or false — got ${JSON.stringify(value)}`);
      break;
    case "contains":
      expr = `${col} @> ${params.add(value)}`;
      break;
    default:
      throw new Error(`Unsupported filter operator: ${op}`);
  }

  return cond.negate ? `not (${expr})` : expr;
}

function whereToSql(nodes: WhereNode[], table: string, params: Params): string {
  if (nodes.length === 0) return "";
  const parts = nodes.map((node) =>
    node.type === "cond"
      ? condToSql(node.cond, table, params)
      : `(${node.conds.map((c) => condToSql(c, table, params)).join(" or ")})`,
  );
  return ` where ${parts.join(" and ")}`;
}

/**
 * Renders the projection, resolving each embedded resource into a correlated
 * subquery that yields JSON.
 *
 * A subquery rather than a LEFT JOIN because an embed must arrive as a nested
 * object (or array) under its alias, and because it composes: a nested embed is
 * just another correlated subquery one level down. Verified safe for this
 * codebase — no call site filters or orders by an embedded column, which is the
 * one case that would require a real join.
 */
async function buildProjection(
  fields: SelectField[],
  table: string,
  alias: string,
  seq: { n: number },
): Promise<string> {
  const parts: string[] = [];

  for (const field of fields) {
    if (field.kind === "star") {
      parts.push(`${alias}.*`);
      continue;
    }
    if (field.kind === "column") {
      const col = `${alias}.${quoteIdent(field.column, "column name")}`;
      parts.push(field.alias ? `${col} as ${quoteIdent(field.alias, "alias")}` : col);
      continue;
    }

    const rel = await resolveRelationship(table, field.table, field.hint);
    const child = `e${seq.n++}`;
    const inner = await buildProjection(field.fields, field.table, child, seq);
    const from =
      `from public.${quoteIdent(field.table, "table name")} ${child} ` +
      `where ${child}.${quoteIdent(rel.foreignColumn, "column name")} = ` +
      `${alias}.${quoteIdent(rel.localColumn, "column name")}`;
    const outAlias = quoteIdent(field.alias, "alias");

    if (rel.kind === "to-one") {
      parts.push(
        `(select to_jsonb(x) from (select ${inner} ${from} limit 1) x) as ${outAlias}`,
      );
    } else {
      parts.push(
        `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) ` +
          `from (select ${inner} ${from}) x) as ${outAlias}`,
      );
    }
  }

  return parts.join(", ");
}

type Operation = "select" | "insert" | "update" | "upsert" | "delete";

export class QueryBuilder<T = Untyped[]> implements PromiseLike<DbResult<T>> {
  private operation: Operation = "select";
  private selectString: string | null = null;
  private wantsCount = false;
  private headOnly = false;
  private readonly where: WhereNode[] = [];
  private readonly orderBy: OrderTerm[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private rowMode: "many" | "single" | "maybeSingle" = "many";

  private payload: Row[] = [];
  private conflictTarget: string[] = [];
  private ignoreDuplicates = false;

  constructor(private readonly table: string) {}

  // -- shaping ------------------------------------------------------------

  select(
    columns = "*",
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.selectString = columns;
    if (options?.count) this.wantsCount = true;
    if (options?.head) this.headOnly = true;
    return this;
  }

  insert(values: Untyped | Untyped[]): this {
    this.operation = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  update(values: Untyped): this {
    this.operation = "update";
    this.payload = [values];
    return this;
  }

  upsert(
    values: Untyped | Untyped[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.operation = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.conflictTarget = options?.onConflict
      ? options.onConflict.split(",").map((c) => c.trim()).filter(Boolean)
      : [];
    this.ignoreDuplicates = options?.ignoreDuplicates ?? false;
    return this;
  }

  delete(options?: { count?: "exact" | "planned" | "estimated" }): this {
    this.operation = "delete";
    if (options?.count) this.wantsCount = true;
    return this;
  }

  // -- filters ------------------------------------------------------------

  private addCond(column: string, op: string, value: unknown, negate = false): this {
    this.where.push({ type: "cond", cond: { column, op, value, negate } });
    return this;
  }

  eq(column: string, value: unknown) { return this.addCond(column, "eq", value); }
  neq(column: string, value: unknown) { return this.addCond(column, "neq", value); }
  gt(column: string, value: unknown) { return this.addCond(column, "gt", value); }
  gte(column: string, value: unknown) { return this.addCond(column, "gte", value); }
  lt(column: string, value: unknown) { return this.addCond(column, "lt", value); }
  lte(column: string, value: unknown) { return this.addCond(column, "lte", value); }
  like(column: string, pattern: string) { return this.addCond(column, "like", pattern); }
  ilike(column: string, pattern: string) { return this.addCond(column, "ilike", pattern); }
  in(column: string, values: readonly unknown[]) { return this.addCond(column, "in", [...values]); }
  is(column: string, value: null | boolean) { return this.addCond(column, "is", value); }
  contains(column: string, value: unknown) { return this.addCond(column, "contains", value); }

  /** `.not(col, "is", null)` and `.not(col, "in", '("a","b")')`. */
  not(column: string, op: string, value: unknown) {
    const normalised =
      op === "in" && typeof value === "string" ? parseListLiteral(value) : value;
    return this.addCond(column, op, normalised, true);
  }

  /** PostgREST's or() DSL: `"a.eq.1,b.not.is.null,c.in.(x,y)"`. */
  or(filters: string): this {
    this.where.push({ type: "or", conds: parseDsl(filters) });
    return this;
  }

  /** `.match({ a: 1, b: 2 })` — equality on every key. */
  match(query: Row): this {
    for (const [column, value] of Object.entries(query)) this.eq(column, value);
    return this;
  }

  // -- modifiers ----------------------------------------------------------

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orderBy.push({
      column,
      ascending: options?.ascending ?? true,
      nullsFirst: options?.nullsFirst,
    });
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  /** Inclusive on both ends, as PostgREST's Range header was. */
  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single(): QueryBuilder<Untyped> {
    this.rowMode = "single";
    return this as QueryBuilder<Untyped>;
  }

  maybeSingle(): QueryBuilder<Untyped> {
    this.rowMode = "maybeSingle";
    return this as QueryBuilder<Untyped>;
  }

  // -- SQL assembly -------------------------------------------------------

  private tailSql(params: Params): string {
    let out = "";
    if (this.orderBy.length) {
      out += ` order by ${this.orderBy
        .map((o) => {
          let term = `t.${quoteIdent(o.column, "column name")} ${o.ascending ? "asc" : "desc"}`;
          if (o.nullsFirst !== undefined) term += o.nullsFirst ? " nulls first" : " nulls last";
          return term;
        })
        .join(", ")}`;
    }
    if (this.limitCount !== null) out += ` limit ${params.add(this.limitCount)}`;
    if (this.offsetCount !== null) out += ` offset ${params.add(this.offsetCount)}`;
    return out;
  }

  /** Splits rows by their key set so a missing key keeps its column DEFAULT. */
  private groupPayload(): { columns: string[]; rows: Row[] }[] {
    const groups = new Map<string, { columns: string[]; rows: Row[] }>();
    for (const row of this.payload) {
      const columns = Object.keys(row);
      const key = JSON.stringify(columns);
      const existing = groups.get(key);
      if (existing) existing.rows.push(row);
      else groups.set(key, { columns, rows: [row] });
    }
    return [...groups.values()];
  }

  private async writeStatements(): Promise<{ text: string; values: unknown[] }[]> {
    const table = `public.${quoteIdent(this.table, "table name")}`;
    const wantsRows = this.selectString !== null;
    const statements: { text: string; values: unknown[] }[] = [];

    const wrap = async (core: string, params: Params) => {
      if (!wantsRows) return { text: core, values: params.values };
      const seq = { n: 0 };
      const projection = await buildProjection(
        parseSelect(this.selectString ?? "*"),
        this.table,
        "t",
        seq,
      );
      return {
        text: `with rows as (${core} returning *) select ${projection} from rows t`,
        values: params.values,
      };
    };

    if (this.operation === "insert" || this.operation === "upsert") {
      for (const group of this.groupPayload()) {
        const params = new Params();
        const cols = group.columns.map((c) => quoteIdent(c, "column name"));
        const tuples = group.rows
          .map((row) => `(${group.columns.map((c) => params.add(row[c])).join(", ")})`)
          .join(", ");

        let core = `insert into ${table} (${cols.join(", ")}) values ${tuples}`;

        if (this.operation === "upsert") {
          if (this.conflictTarget.length === 0) {
            throw new Error(
              `upsert on "${this.table}" needs { onConflict } naming the conflicting column(s).`,
            );
          }
          const target = this.conflictTarget
            .map((c) => quoteIdent(c, "column name"))
            .join(", ");
          const updatable = group.columns.filter((c) => !this.conflictTarget.includes(c));
          core +=
            this.ignoreDuplicates || updatable.length === 0
              ? ` on conflict (${target}) do nothing`
              : ` on conflict (${target}) do update set ${updatable
                  .map((c) => `${quoteIdent(c, "column name")} = excluded.${quoteIdent(c, "column name")}`)
                  .join(", ")}`;
        }

        statements.push(await wrap(core, params));
      }
      return statements;
    }

    if (this.operation === "update") {
      const params = new Params();
      const values = this.payload[0] ?? {};
      const assignments = Object.entries(values).map(
        ([c, v]) => `${quoteIdent(c, "column name")} = ${params.add(v)}`,
      );
      if (assignments.length === 0) throw new Error(`update on "${this.table}" has no columns.`);
      const core =
        `update ${table} as t set ${assignments.join(", ")}` +
        whereToSql(this.where, "t", params);
      statements.push(await wrap(core, params));
      return statements;
    }

    // delete
    const params = new Params();
    const core = `delete from ${table} as t${whereToSql(this.where, "t", params)}`;
    statements.push(await wrap(core, params));
    return statements;
  }

  private async run(): Promise<DbResult<T>> {
    if (this.operation !== "select") {
      const statements = await this.writeStatements();
      const collected: Row[] = [];
      let affected = 0;
      for (const stmt of statements) {
        const res = await sql<Row>(stmt.text, stmt.values);
        collected.push(...res.rows);
        affected += res.rowCount;
      }
      return this.shape(
        this.selectString === null ? null : collected,
        this.wantsCount ? affected : null,
      );
    }

    const params = new Params();
    const seq = { n: 0 };
    const projection = await buildProjection(
      parseSelect(this.selectString ?? "*"),
      this.table,
      "t",
      seq,
    );
    const table = `public.${quoteIdent(this.table, "table name")}`;

    let count: number | null = null;
    if (this.wantsCount) {
      const countParams = new Params();
      const countSql =
        `select count(*) as count from ${table} t` +
        whereToSql(this.where, "t", countParams);
      const res = await sql<{ count: number }>(countSql, countParams.values);
      count = Number(res.rows[0]?.count ?? 0);
    }

    if (this.headOnly) return { data: null as T, error: null, count };

    const text =
      `select ${projection} from ${table} t` +
      whereToSql(this.where, "t", params) +
      this.tailSql(params);
    const res = await sql<Row>(text, params.values);
    return this.shape(res.rows, count);
  }

  private shape(rows: Row[] | null, count: number | null): DbResult<T> {
    if (rows === null) return { data: null as T, error: null, count };

    if (this.rowMode === "many") return { data: rows as unknown as T, error: null, count };

    if (rows.length === 1) return { data: rows[0] as unknown as T, error: null, count };

    if (rows.length === 0) {
      if (this.rowMode === "maybeSingle") return { data: null as T, error: null, count };
      return {
        data: null as T,
        // Same code PostgREST used, in case anything downstream matches on it.
        error: {
          message: "JSON object requested, multiple (or no) rows returned",
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
        },
        count,
      };
    }

    return {
      data: null as T,
      error: {
        message: "JSON object requested, multiple (or no) rows returned",
        code: "PGRST116",
        details: `The result contains ${rows.length} rows`,
        hint: null,
      },
      count,
    };
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // Errors are returned, not thrown — every call site destructures `error`.
    return this.run()
      .catch((e) => ({ data: null as T, error: toDbError(e), count: null }))
      .then(onfulfilled, onrejected);
  }
}

/**
 * Calls a Postgres function. Named-argument notation is used so functions with
 * defaults (bbmp_works_fuzzy_search) can be called with a subset of arguments.
 *
 * A scalar-returning function yields one row with one column named after the
 * function; PostgREST unwrapped that to the bare value, so it is unwrapped here
 * too. A SETOF function returns its rows as an array, unchanged.
 */
export class RpcBuilder<T = Untyped> implements PromiseLike<DbResult<T>> {
  private rowMode: "many" | "single" | "maybeSingle" = "many";

  constructor(
    private readonly fn: string,
    private readonly args: Row = {},
  ) {}

  single(): this {
    this.rowMode = "single";
    return this;
  }

  maybeSingle(): this {
    this.rowMode = "maybeSingle";
    return this;
  }

  private async run(): Promise<DbResult<T>> {
    const params = new Params();
    const named = Object.entries(this.args)
      .map(([k, v]) => `${quoteIdent(k, "argument name")} => ${params.add(v)}`)
      .join(", ");
    // Deliberately NOT aliased: for a scalar-returning function Postgres names
    // the single output column after the function itself, which is how a scalar
    // result is told apart from a SETOF one below. An alias would rename it.
    const text = `select * from public.${quoteIdent(this.fn, "function name")}(${named})`;
    const res = await sql<Row>(text, params.values);

    const columns = res.rows[0] ? Object.keys(res.rows[0]) : [];
    const isScalar = columns.length === 1 && columns[0] === this.fn;
    if (isScalar) {
      return { data: (res.rows[0]?.[this.fn] ?? null) as T, error: null, count: null };
    }
    if (this.rowMode !== "many") {
      return { data: (res.rows[0] ?? null) as T, error: null, count: null };
    }
    return { data: res.rows as unknown as T, error: null, count: null };
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run()
      .catch((e) => ({ data: null as T, error: toDbError(e), count: null }))
      .then(onfulfilled, onrejected);
  }
}

/** The database handle every server module works against. */
export interface DbClient {
  from(table: string): QueryBuilder<Untyped[]>;
  rpc<T = Untyped>(fn: string, args?: Row): RpcBuilder<T>;
}

export function createDbClient(): DbClient {
  return {
    from: (table: string) => new QueryBuilder(table),
    rpc: <T = Untyped>(fn: string, args: Row = {}) => new RpcBuilder<T>(fn, args),
  };
}
