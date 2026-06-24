# Authorization Flow: GBA · BBMP Ward & Engineer Tracker

This document describes the sequence of security checks triggered when a user performs a write mutation.

---

## 1. Sequence Flow: Creating a Complaint

```
[User Browser]           [Next.js Server Actions]     [Auth Module]       [Postgres DB]
      │                              │                      │                  │
      │─── (1) Submit Form Data ────>│                      │                  │
      │                              │─── (2) requireRole() ──>│                  │
      │                              │                      │                  │
      │                              │<─── (3) Session User ───│                  │
      │                              │    (role = EDITOR)   │                  │
      │                              │                      │                  │
      │                              │─── (4) Schema validation (Zod)          │
      │                              │                      │                  │
      │                              │─── (5) Create Admin Client ─────────────>│
      │                              │                                         │── (6) Perform writes
      │                              │                                         │   (Insert record,
      │                              │                                         │    add timeline log,
      │                              │                                         │    write audit log)
      │                              │<─────────── (7) Action Status ──────────│
      │                              │                      │                  │
      │<── (8) Render UI update ─────│                      │                  │
```

---

## 2. Step-by-Step Execution Path

### Step 1: Client Request
A user clicks a button to perform a write operation (e.g., creating a complaint). The request is sent as a `FormData` object to a Next.js Server Action (e.g. `createComplaint` in `lib/actions/complaints.ts`).

### Step 2: Session Retrieval & Validation
The Server Action calls the authorization utility:
- Inside [lib/auth.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/auth.ts), `getSessionUser()` retrieves the auth session cookie.
- It parses the user ID and queries the `profiles` table to fetch the user's role metadata:
  ```typescript
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  ```

### Step 3: Server Action Guard (Role Check)
The Action calls `requireRole(allowedRoles)`:
- If the user's role exists in `allowedRoles` (e.g. `['ADMIN', 'EDITOR', 'COMPLAINT_MANAGER']`), execution continues.
- If not, an `AuthorizationError` is thrown, aborting the transaction and returning an error message to the browser.

### Step 4: Schema Verification (Input Check)
Inputs are validated against Zod schemas in [lib/validators.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/validators.ts). If validation fails, error messages are mapped to form fields and returned to the UI without executing database commands.

### Step 5: Elevated Database Client Execution
If validation and authorization pass, the server action initializes the elevated `createAdminClient()` using `SUPABASE_SERVICE_ROLE_KEY` to carry out modifications, bypassing client-side RLS limits for multi-table transactions (such as inserting the complaint, adding timeline events, and logging audit logs).

### Step 6: Database Auditing
Upon transaction completion:
1. `addTimeline` inserts an event record into `complaint_timeline` (user-visible history).
2. `writeAudit` logs a record to `audit_logs` detailing the field changes (system-level audit log).
3. The page path is updated via `revalidatePath()`, refreshing the user's browser view.

---

## 3. Responsible Files Reference

- **Route Interception:** [middleware.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/middleware.ts) and [lib/supabase/middleware.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/supabase/middleware.ts).
- **Authorization Checks:** [lib/auth.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/auth.ts) houses `getSessionUser()`, `hasRole()`, and `requireRole()`.
- **Zod Schemas:** [lib/validators.ts](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/validators.ts).
- **Mutations & Server Actions:** [lib/actions/](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/lib/actions/).
- **RLS Checks & Triggers:** Database migrations under [supabase/migrations/](file:///d:/gba-bbmp-tracker/gba-bbmp-tracker/supabase/migrations/).
