"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { USER_ROLES } from "@/lib/constants";
import { createUser } from "@/lib/actions/users";

const selectCls =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, {});
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      {state.error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{state.error}</div>
      )}
      {state.success && (
        <div className="rounded-md border border-teal/40 bg-teal/10 p-3 text-sm text-teal">User created.</div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input name="email" type="email" required />
        </div>
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input name="name" />
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input name="password" type="password" minLength={8} required />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <select name="role" defaultValue="VIEWER" className={selectCls}>
            {USER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>
    </form>
  );
}
