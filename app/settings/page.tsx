import Link from "next/link";
import { LogIn } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ModeToggle } from "@/components/mode-toggle";
import { CreateUserForm } from "@/components/settings/create-user-form";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/empty-state";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "All access + user management, import, export, audit, merge duplicates.",
  EDITOR: "Add / edit wards and contacts.",
  VERIFIER: "Set verification status and notes.",
  VIEWER: "Read-only.",
};

export default async function SettingsPage() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <EmptyState icon={LogIn} title="Not signed in" description="Sign in to view your account and settings.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />

      <div className="grid gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Your account</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Role">
              <span className="inline-flex items-center gap-2">
                <Badge variant="secondary">{user.role}</Badge>
                <span className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[user.role]}</span>
              </span>
            </DetailRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Toggle light / dark theme</span>
            <ModeToggle />
          </CardContent>
        </Card>

        {user.role === "ADMIN" && (
          <>
            <Separator />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Create user</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Admin-only. Requires the server-side service-role key. New users can sign in immediately.
                </p>
              </CardHeader>
              <CardContent>
                <CreateUserForm />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
