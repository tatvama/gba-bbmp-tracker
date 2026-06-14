"use client";

import { useActionState } from "react";
import { signInAction, type AuthActionState } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<AuthActionState, FormData>(
    signInAction,
    {},
  );

  return (
    <div className="mx-auto mt-10 max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl">Sign in</CardTitle>
          <p className="text-sm text-muted-foreground">
            Staff access for editing, verification and import. Public data is viewable without signing in.
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            {state.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {state.error}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Need an account? An admin creates users via{" "}
            <code className="rounded bg-muted px-1 py-0.5">npm run db:create-admin</code> or the Settings page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
