"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUserPhone, updateUserRole, type AdminUserRow } from "@/lib/actions/users";
import { USER_ROLES } from "@/lib/constants";

const selectCls =
  "flex h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Strips the +91 this app always stores phone numbers with, back to the bare
 *  10-digit form the input expects — the inverse of createUser/updateUserPhone's
 *  own `+91${normalizePhone(...)}`. */
function displayPhone(phone: string | null): string {
  return phone?.replace(/^\+91/, "") ?? "";
}

function RoleCell({ user }: { user: AdminUserRow }) {
  const action = React.useMemo(() => updateUserRole.bind(null, user.id), [user.id]);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <td className="py-2 pr-3">
      <form action={formAction} className="flex items-center gap-2">
        <select name="role" defaultValue={user.role} className={selectCls}>
          {USER_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      {state.success && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>}
    </td>
  );
}

function PhoneCell({ user }: { user: AdminUserRow }) {
  const action = React.useMemo(() => updateUserPhone.bind(null, user.id), [user.id]);
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <td className="py-2 pr-3">
      <form action={formAction} className="flex items-center gap-2">
        <Input
          name="phone"
          type="tel"
          inputMode="numeric"
          defaultValue={displayPhone(user.phone)}
          placeholder="98765 43210"
          className="h-8 w-36"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
      {state.success && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>}
    </td>
  );
}

function UserRow({ user }: { user: AdminUserRow }) {
  return (
    <tr className="border-b align-top last:border-0">
      <td className="py-2 pr-3 text-sm">{user.email ?? "—"}</td>
      <td className="py-2 pr-3 text-sm text-muted-foreground">{user.name || "—"}</td>
      <RoleCell user={user} />
      <PhoneCell user={user} />
    </tr>
  );
}

/** Lets an ADMIN change an EXISTING user's role and add/change their phone
 *  sign-in identifier — the Create User form only sets these at creation, so
 *  this is the only way to change either on an account created earlier
 *  (e.g. promoting a VIEWER to ADMIN). */
export function ManageUsersPanel({ users }: { users: AdminUserRow[] }) {
  if (!users.length) {
    return <p className="text-sm text-muted-foreground">No users yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b text-[10px] font-black uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-3">Email</th>
            <th className="py-2 pr-3">Name</th>
            <th className="py-2 pr-3">Role</th>
            <th className="py-2 pr-3">Phone</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
