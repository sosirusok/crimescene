// In-memory PostgREST emulator for tests. supabase-js sends its normal HTTP requests here (through a test fetch), so the
// production query code runs unchanged. It covers the subset of PostgREST the public endpoints use: select with
// embedded resources, eq/neq/gt/gte/lt/lte/in/is filters, order, limit, insert/upsert (on_conflict + resolution),
// update, delete and rpc. Anything else is recorded in `unsupported` so a test can fail loudly instead of silently.

export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;
export type Rpc = (args: any, db: FakeDb) => unknown | Promise<unknown>;
export type Call = { seq: number; kind: string; target: string; params: URLSearchParams; body: any; prefer: string };

export class PgError extends Error {
  constructor(readonly status: number, readonly body: { code: string; message: string; details: string | null; hint: string | null }) { super(body.message); }
}
export const raise = (message: string) => new PgError(400, { code: "P0001", message, details: null, hint: null });
export const uniqueViolation = (constraint: string, details: string) => new PgError(409, { code: "23505", message: `duplicate key value violates unique constraint "${constraint}"`, details, hint: null });

type Relation = { table: string; local: string; foreign: string; many: boolean };
// payments.reservation_id is unique (payments_reservation_unique), so PostgREST embeds it as one object, not an array.
const RELATIONS: Record<string, Record<string, Relation>> = {
  reservations: {
    themes: { table: "themes", local: "theme_id", foreign: "id", many: false },
    payments: { table: "payments", local: "id", foreign: "reservation_id", many: false },
  },
  payments: { reservations: { table: "reservations", local: "reservation_id", foreign: "id", many: false } },
};
const DEFAULTS: Record<string, () => Row> = {
  availability: () => ({ booked_count: 0, open_room: false, status: "OPEN" }),
};
const TIME_COLUMNS = new Set(["start_time"]);
const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

export function pgTime(value: unknown) {
  const text = String(value ?? "");
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}:${m[3] ?? "00"}` : text;
}
function norm(column: string, value: unknown) {
  if (value === null || value === undefined) return null;
  return TIME_COLUMNS.has(column) ? pgTime(value) : String(value);
}
function splitTop(text: string) {
  const out: string[] = []; let depth = 0, quoted = false, cur = "";
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
function compare(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export class FakeDb {
  tables: Tables;
  rpcs: Record<string, Rpc>;
  calls: Call[] = [];
  events: string[] = [];
  unsupported: string[] = [];
  rateLimitKeys: string[] = [];
  latency: { rpc: number; read: number; write: number };
  fail?: (call: Call) => PgError | null;
  private inflight = new Set<Promise<unknown>>();
  private nextId = 1000;

  constructor(seed: Tables, options: { rpcs?: Record<string, Rpc>; latency?: Partial<FakeDb["latency"]> } = {}) {
    this.tables = structuredClone(seed);
    for (const rows of Object.values(this.tables)) for (const row of rows) this.normalize(row);
    this.rpcs = { ...options.rpcs };
    this.latency = { rpc: 20, read: 4, write: 4, ...options.latency };
  }

  handle(request: Request): Promise<Response> {
    const pending = this.process(request);
    this.inflight.add(pending);
    return pending.finally(() => this.inflight.delete(pending));
  }

  async idle() { while (this.inflight.size) await Promise.allSettled([...this.inflight]); }

  callsOf(kind: string, target: string) { return this.calls.filter((c) => c.kind === kind && c.target === target); }

  insertRow(table: string, row: Row) { const value = this.normalize({ ...DEFAULTS[table]?.(), ...row }); (this.tables[table] ??= []).push(value); return value; }

  private normalize(row: Row) { for (const column of TIME_COLUMNS) if (column in row && row[column] !== null) row[column] = pgTime(row[column]); return row; }
  private wait(ms: number) { return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(); }

  private async process(request: Request): Promise<Response> {
    const url = new URL(request.url), rest = url.pathname.replace(/^\/rest\/v1\//, "");
    const text = ["GET", "HEAD"].includes(request.method) ? "" : await request.text();
    const body = text ? JSON.parse(text) : undefined, prefer = request.headers.get("prefer") ?? "";
    const rpc = rest.startsWith("rpc/"), target = rpc ? rest.slice(4) : rest;
    const kind = rpc ? "rpc" : request.method === "GET" ? "select" : request.method === "POST" ? (prefer.includes("resolution=") ? "upsert" : "insert") : request.method === "PATCH" ? "update" : request.method === "DELETE" ? "delete" : request.method.toLowerCase();
    const call: Call = { seq: this.calls.length, kind, target, params: url.searchParams, body, prefer };
    this.calls.push(call);
    this.events.push(`start ${kind} ${target}`);
    try {
      const injected = this.fail?.(call); if (injected) throw injected;
      if (kind === "select") {
        // A statement sees the data committed when it starts, then takes time to return.
        const rows = this.select(target, url.searchParams), single = (request.headers.get("accept") ?? "").includes("vnd.pgrst.object+json");
        await this.wait(this.latency.read);
        if (single && rows.length !== 1) return json(406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
        return json(200, single ? rows[0] : rows);
      }
      // Writes and functions take time, then commit at the end.
      await this.wait(rpc ? this.latency.rpc : this.latency.write);
      if (rpc) {
        const fn = this.rpcs[target];
        if (!fn) return json(404, { code: "PGRST202", details: null, hint: null, message: `Could not find the function public.${target}` });
        const result = await fn(body ?? {}, this);
        return result === undefined ? new Response(null, { status: 204 }) : json(200, result);
      }
      if (kind === "insert" || kind === "upsert") return this.write(target, body, url.searchParams, prefer);
      if (kind === "update" || kind === "delete") {
        const matched = this.filter(target, url.searchParams);
        if (kind === "update") for (const row of matched) Object.assign(row, this.normalize({ ...body }));
        else this.tables[target] = (this.tables[target] ?? []).filter((row) => !matched.includes(row));
        return prefer.includes("return=representation") ? json(200, matched.map((row) => this.project(target, row, url.searchParams.get("select") ?? "*"))) : new Response(null, { status: 204 });
      }
      this.unsupported.push(`${request.method} ${url.pathname}${url.search}`);
      return json(400, { code: "FAKE", details: null, hint: null, message: "unsupported request" });
    } catch (error) {
      if (error instanceof PgError) return json(error.status, error.body);
      this.unsupported.push(String(error));
      return json(500, { code: "FAKE", details: null, hint: null, message: String(error) });
    } finally {
      this.events.push(`end ${kind} ${target}`);
    }
  }

  private filter(table: string, params: URLSearchParams) {
    if (!(table in this.tables)) throw new PgError(404, { code: "42P01", details: null, hint: null, message: `relation "public.${table}" does not exist` });
    let rows = this.tables[table].slice();
    for (const [column, expr] of params) {
      if (RESERVED.has(column)) continue;
      const dot = expr.indexOf("."), op = expr.slice(0, dot), raw = expr.slice(dot + 1);
      if (column === "or" || column === "and" || op === "not") { this.unsupported.push(`filter ${column}=${expr}`); continue; }
      const value = norm(column, raw);
      rows = rows.filter((row) => {
        const cell = norm(column, row[column]);
        switch (op) {
          case "eq": return cell !== null && cell === value;
          case "neq": return cell !== null && cell !== value;
          case "gt": return cell !== null && compare(cell, value) > 0;
          case "gte": return cell !== null && compare(cell, value) >= 0;
          case "lt": return cell !== null && compare(cell, value) < 0;
          case "lte": return cell !== null && compare(cell, value) <= 0;
          case "is": return raw === "null" ? cell === null : cell === raw;
          case "in": {
            const list = splitTop(raw.replace(/^\(/, "").replace(/\)$/, "")).map((item) => norm(column, item.replace(/^"(.*)"$/, "$1")));
            return cell !== null && list.includes(cell);
          }
          default: this.unsupported.push(`operator ${op}`); return false;
        }
      });
    }
    return rows;
  }

  private select(table: string, params: URLSearchParams) {
    let rows = this.filter(table, params);
    const order = params.get("order");
    if (order) {
      const keys = order.split(",").map((part) => { const [column, dir = "asc", nulls] = part.split("."); return { column, desc: dir === "desc", nullsFirst: nulls ? nulls === "nullsfirst" : dir === "desc" }; });
      rows = rows.sort((a, b) => {
        for (const { column, desc, nullsFirst } of keys) {
          const x = a[column] ?? null, y = b[column] ?? null;
          if (x === null && y === null) continue;
          if (x === null) return nullsFirst ? -1 : 1;
          if (y === null) return nullsFirst ? 1 : -1;
          const c = compare(x, y); if (c) return desc ? -c : c;
        }
        return 0;
      });
    }
    const offset = Number(params.get("offset") ?? 0), limit = params.get("limit");
    rows = rows.slice(offset, limit === null ? undefined : offset + Number(limit));
    return rows.map((row) => this.project(table, row, params.get("select") ?? "*"));
  }

  private project(table: string, row: Row, select: string): Row {
    const out: Row = {};
    for (const item of splitTop(select)) {
      if (item === "*") { Object.assign(out, structuredClone(row)); continue; }
      const embed = /^([a-z_]+)\((.*)\)$/s.exec(item);
      if (embed) {
        const relation = RELATIONS[table]?.[embed[1]];
        if (!relation) { this.unsupported.push(`embed ${table}.${embed[1]}`); continue; }
        const related = (this.tables[relation.table] ?? []).filter((x) => x[relation.foreign] !== null && String(x[relation.foreign]) === String(row[relation.local])).map((x) => this.project(relation.table, x, embed[2]));
        out[embed[1]] = relation.many ? related : related[0] ?? null;
        continue;
      }
      out[item] = item in row ? structuredClone(row[item]) : null;
    }
    return out;
  }

  private write(table: string, body: any, params: URLSearchParams, prefer: string) {
    const values: Row[] = Array.isArray(body) ? body : [body], conflict = params.get("on_conflict")?.split(",");
    const ignore = prefer.includes("resolution=ignore-duplicates"), merge = prefer.includes("resolution=merge-duplicates");
    const written: Row[] = [];
    for (const value of values) {
      const row = this.normalize({ ...DEFAULTS[table]?.(), ...value });
      const existing = conflict ? (this.tables[table] ?? []).find((r) => conflict.every((c) => norm(c, r[c]) === norm(c, row[c]))) : undefined;
      if (existing && ignore) continue;
      if (existing && merge) { Object.assign(existing, this.normalize({ ...value })); written.push(existing); continue; }
      if (existing) throw uniqueViolation(`${table}_unique`, "duplicate");
      if (row.id === undefined) row.id = this.nextId++;
      else if ((this.tables[table] ?? []).some((r) => String(r.id) === String(row.id))) throw uniqueViolation(`${table}_pkey`, `Key (id)=(${row.id}) already exists.`);
      (this.tables[table] ??= []).push(row);
      written.push(row);
    }
    return prefer.includes("return=representation") ? json(201, written.map((row) => this.project(table, row, params.get("select") ?? "*"))) : new Response(null, { status: 201 });
  }
}
