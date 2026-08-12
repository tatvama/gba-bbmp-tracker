/**
 * Parsers for the two string mini-languages this codebase inherited from
 * PostgREST, kept free of any database access so they can be unit-tested
 * directly:
 *
 *   1. select strings   — `"id, ward:wards!ward_id(new_no,new_name)"`
 *   2. or() filter DSL  — `"status.eq.open,due.not.is.null,kind.in.(a,b)"`
 *
 * Both were previously interpreted server-side by PostgREST. They are parsed
 * here instead so the ~850 existing call sites keep working unchanged.
 */

/** Identifiers reach SQL by concatenation, so they are strictly validated. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export function assertIdentifier(name: string, what: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`Invalid ${what}: ${JSON.stringify(name)}`);
  }
  return name;
}

/** Quotes an identifier for SQL after validating it. */
export function quoteIdent(name: string, what = "identifier"): string {
  return `"${assertIdentifier(name, what)}"`;
}

/**
 * Splits on commas that sit at paren-depth zero, so the argument list of an
 * embed or an `in.(a,b)` list is not torn apart.
 */
export function splitTopLevel(input: string, separator = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === separator && depth === 0) {
        out.push(current);
        current = "";
        continue;
      }
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// select strings
// ---------------------------------------------------------------------------

export type SelectField =
  | { kind: "star" }
  | { kind: "column"; column: string; alias?: string }
  | {
      kind: "embed";
      alias: string;
      table: string;
      hint?: string;
      fields: SelectField[];
    };

/**
 * Parses a select string into fields and embedded resources.
 *
 * Accepted forms, all of which appear in this codebase:
 *   *                                  every column
 *   id                                 one column
 *   label:id                           renamed column
 *   wards(new_no)                       embed, relationship inferred
 *   ward:wards!ward_id(new_no)          embed, aliased and disambiguated
 *   a:t!c(x, b:u!d(y))                  embeds nest
 */
export function parseSelect(select: string): SelectField[] {
  const tokens = splitTopLevel(select);
  if (tokens.length === 0) return [{ kind: "star" }];

  return tokens.map((token): SelectField => {
    const parenAt = token.indexOf("(");

    if (parenAt === -1) {
      if (token === "*") return { kind: "star" };
      // `alias:column` — a rename rather than an embed, since there are no parens.
      const colonAt = token.indexOf(":");
      if (colonAt > 0) {
        return {
          kind: "column",
          alias: token.slice(0, colonAt).trim(),
          column: token.slice(colonAt + 1).trim(),
        };
      }
      return { kind: "column", column: token };
    }

    if (!token.endsWith(")")) {
      throw new Error(`Malformed embed in select string: ${JSON.stringify(token)}`);
    }
    const spec = token.slice(0, parenAt).trim();
    const inner = token.slice(parenAt + 1, -1);

    let alias: string | undefined;
    let rest = spec;
    const colonAt = spec.indexOf(":");
    if (colonAt > 0) {
      alias = spec.slice(0, colonAt).trim();
      rest = spec.slice(colonAt + 1).trim();
    }

    let table = rest;
    let hint: string | undefined;
    const bangAt = rest.indexOf("!");
    if (bangAt > 0) {
      table = rest.slice(0, bangAt).trim();
      hint = rest.slice(bangAt + 1).trim();
    }

    return {
      kind: "embed",
      alias: alias ?? table,
      table,
      hint,
      fields: parseSelect(inner),
    };
  });
}

// ---------------------------------------------------------------------------
// or() filter DSL
// ---------------------------------------------------------------------------

export interface DslCondition {
  column: string;
  op: string;
  value: unknown;
  negate: boolean;
}

/** Splits `("Closed","Resolved")` or `(a,b)` into its members. */
export function parseListLiteral(raw: string): string[] {
  let body = raw.trim();
  if (body.startsWith("(") && body.endsWith(")")) body = body.slice(1, -1);
  return splitTopLevel(body).map((item) => {
    const v = item.trim();
    return v.startsWith('"') && v.endsWith('"') && v.length >= 2 ? v.slice(1, -1) : v;
  });
}

function coerceDslValue(op: string, raw: string): unknown {
  if (op === "in") return parseListLiteral(raw);
  if (raw === "null") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return raw;
}

/**
 * Parses one `column.op.value` term.
 *
 * Splitting is positional rather than a plain `split(".")` because values
 * legitimately contain dots — an ISO timestamp (`updated_at.lt.2026-08-12T...`)
 * being the case that actually occurs here.
 */
export function parseDslCondition(term: string): DslCondition {
  const firstDot = term.indexOf(".");
  if (firstDot <= 0) {
    throw new Error(`Malformed filter term: ${JSON.stringify(term)}`);
  }
  const column = term.slice(0, firstDot);
  let rest = term.slice(firstDot + 1);

  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }

  const opDot = rest.indexOf(".");
  if (opDot <= 0) {
    throw new Error(`Filter term is missing a value: ${JSON.stringify(term)}`);
  }
  const op = rest.slice(0, opDot);
  const raw = rest.slice(opDot + 1);

  return { column, op, value: coerceDslValue(op, raw), negate };
}

/** Parses a full or() argument into its OR-ed conditions. */
export function parseDsl(input: string): DslCondition[] {
  return splitTopLevel(input).map(parseDslCondition);
}
