import "server-only";
import { sql, getPool } from "@/lib/db/pool";

/**
 * User accounts and password checking — the replacement for Supabase Auth's
 * auth.users table and its admin API.
 *
 * Passwords are the SAME bcrypt hashes Supabase issued (migrated verbatim into
 * public.app_users), and they are checked by pgcrypto's crypt() inside Postgres
 * rather than by a JS bcrypt library. That keeps every existing password
 * working, adds no dependency, and means a plaintext password is never held in
 * application memory longer than the request that carried it.
 *
 * Raw SQL here rather than the query builder in lib/db/query.ts: these are the
 * security-critical statements in the codebase, and crypt()/gen_salt() are
 * expressions the builder has no business modelling.
 */

export interface AuthUser {
  id: string;
  email: string;
  phone: string | null;
  role: string;
  name: string | null;
  bannedUntil: string | null;
}

/**
 * A bcrypt hash of a value nobody knows, used to spend the same ~100ms on a
 * missing email as on a wrong password. Without it, response time alone reveals
 * which email addresses have accounts.
 */
const DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMye1J7Q4Xr8Yk2wZ0tG5Q2K6l8bV0uJqPu";

export interface CredentialCheck {
  user: { id: string; email: string } | null;
  banned: boolean;
}

/**
 * Verifies an email + password pair.
 *
 * Returns `banned: true` separately so a suspended account gets a different
 * message from a wrong password, matching how Supabase reported it.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<CredentialCheck> {
  const found = await sql<{
    id: string;
    email: string;
    matches: boolean;
    banned: boolean;
  }>(
    `select u.id,
            u.email,
            u.encrypted_password is not null
              and u.encrypted_password = public.crypt($2, u.encrypted_password) as matches,
            u.banned_until is not null and u.banned_until > now()             as banned
       from public.app_users u
      where lower(u.email) = lower($1)
      limit 1`,
    [email, password],
  );

  const row = found.rows[0];
  if (!row) {
    // Equalise timing against the found-user path before failing.
    await sql(`select public.crypt($1, $2)`, [password, DUMMY_HASH]);
    return { user: null, banned: false };
  }
  if (!row.matches) return { user: null, banned: false };
  if (row.banned) return { user: null, banned: true };

  return { user: { id: row.id, email: row.email }, banned: false };
}

/** Stamps a successful sign-in, as Supabase's last_sign_in_at did. */
export async function recordSignIn(userId: string): Promise<void> {
  await sql(`update public.app_users set last_sign_in_at = now() where id = $1`, [userId]);
}

export interface SessionRecord {
  id: string;
  email: string | null;
  /** The whole profiles row, as the previous `select("*")` returned. */
  profile: Record<string, unknown> | null;
}

/**
 * The signed-in user plus their full profile row.
 *
 * The entire profile is returned rather than a hand-picked subset because
 * getSessionUser() previously exposed `select("*")` on profiles and callers may
 * read any column from it.
 */
export async function findUserWithProfile(userId: string): Promise<SessionRecord | null> {
  const res = await sql<{ id: string; email: string | null; profile: Record<string, unknown> | null }>(
    `select u.id,
            u.email,
            (select to_jsonb(p) from public.profiles p where p.id = u.id) as profile
       from public.app_users u
      where u.id = $1
      limit 1`,
    [userId],
  );
  return res.rows[0] ?? null;
}

/** Resolves a phone number to its account's email, for phone sign-in. */
export async function findEmailByPhone(e164Phone: string): Promise<string | null> {
  // Exactly one match required. Zero means no account uses this number; two or
  // more means an admin assigned it twice and the target is ambiguous. Both are
  // reported to the caller the same way, so a login attempt cannot be used to
  // probe which numbers are registered.
  const res = await sql<{ email: string | null }>(
    `select p.email
       from public.profiles p
      where p.phone = $1
      limit 2`,
    [e164Phone],
  );
  if (res.rows.length !== 1) return null;
  return res.rows[0]?.email ?? null;
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: string;
  /** E.164, or null when the account has no phone sign-in. */
  phone: string | null;
}

export interface CreateUserResult {
  id?: string;
  error?: string;
}

/**
 * Creates an account and its profile row.
 *
 * Supabase did the profile half with an `on auth.users` trigger
 * (public.handle_new_user); that trigger is gone, so both rows are written here
 * in one transaction — an account with no profile would come back as VIEWER and
 * silently lose the role the admin chose.
 */
export async function createAuthUser(input: CreateUserInput): Promise<CreateUserResult> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const existing = await client.query(
      `select 1 from public.app_users where lower(email) = lower($1) limit 1`,
      [input.email],
    );
    if (existing.rowCount) {
      await client.query("rollback");
      return { error: "A user with this email address already exists." };
    }

    const created = await client.query<{ id: string }>(
      `insert into public.app_users
         (email, phone, encrypted_password, email_confirmed_at, raw_user_meta_data)
       values ($1, $2, public.crypt($3, public.gen_salt('bf', 10)), now(), $4::jsonb)
       returning id`,
      [
        input.email,
        input.phone,
        input.password,
        JSON.stringify({ name: input.name, role: input.role }),
      ],
    );
    const id = created.rows[0]?.id;
    if (!id) {
      await client.query("rollback");
      return { error: "Could not create the account." };
    }

    await client.query(
      `insert into public.profiles (id, email, name, role, phone)
       values ($1, $2, $3, $4, $5)
       on conflict (id) do update
         set email = excluded.email,
             name  = excluded.name,
             role  = excluded.role,
             phone = excluded.phone`,
      [id, input.email, input.name, input.role, input.phone],
    );

    await client.query("commit");
    return { id };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    return { error: e instanceof Error ? e.message : String(e) };
  } finally {
    client.release();
  }
}

/** Sets the phone sign-in identifier on both tables. */
export async function updateAuthUserPhone(userId: string, e164Phone: string): Promise<void> {
  await sql(`update public.app_users set phone = $2, updated_at = now() where id = $1`, [
    userId,
    e164Phone,
  ]);
  await sql(`update public.profiles set phone = $2 where id = $1`, [userId, e164Phone]);
}

/** Keeps the role in app_users' metadata aligned with profiles.role. */
export async function updateAuthUserRole(userId: string, role: string): Promise<void> {
  await sql(
    `update public.app_users
        set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', $2::text),
            updated_at = now()
      where id = $1`,
    [userId, role],
  );
  await sql(`update public.profiles set role = $2 where id = $1`, [userId, role]);
}

/** Replaces a password with a fresh bcrypt hash. */
export async function updateAuthUserPassword(userId: string, password: string): Promise<void> {
  await sql(
    `update public.app_users
        set encrypted_password = public.crypt($2, public.gen_salt('bf', 10)),
            updated_at = now()
      where id = $1`,
    [userId, password],
  );
}

export async function deleteAuthUser(userId: string): Promise<void> {
  // profiles.id and push_subscriptions.user_id both cascade from app_users.
  await sql(`delete from public.app_users where id = $1`, [userId]);
}

export async function listAuthUsers(): Promise<AuthUser[]> {
  const res = await sql<AuthUser>(
    `select u.id,
            u.email,
            coalesce(p.phone, u.phone) as phone,
            coalesce(p.role, 'VIEWER') as role,
            p.name                     as name,
            u.banned_until             as "bannedUntil"
       from public.app_users u
       left join public.profiles p on p.id = u.id
      order by u.email`,
  );
  return res.rows;
}
