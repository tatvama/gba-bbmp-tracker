import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { listContacts } from "@/lib/queries";
import { findDuplicates } from "@/lib/dedupe";
import { getSessionUser, hasRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DuplicatesReport() {
  const [contacts, user] = await Promise.all([listContacts(), getSessionUser()]);
  const pairs = findDuplicates(
    contacts.map((c) => ({
      id: c.id,
      fullName: c.full_name,
      phone: c.phone,
      whatsapp: c.whatsapp,
      email: c.email,
    })),
  );
  const isAdmin = hasRole(user, ["ADMIN"]);

  return (
    <div>
      <PageHeader
        title="Duplicate contacts"
        description="Possible duplicates matched on normalised phone, email or name. Review and merge — admins can delete the redundant record."
      />
      {pairs.length === 0 ? (
        <EmptyState title="No duplicates detected" />
      ) : (
        <div className="space-y-3">
          {pairs.map((p, i) => (
            <Card key={i}>
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <Badge variant="destructive">matched on {p.reason}</Badge>
                <DupSide id={(p.a as any).id} name={p.a.fullName} />
                <span className="text-muted-foreground">↔</span>
                <DupSide id={(p.b as any).id} name={p.b.fullName} />
                {isAdmin && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Open each contact to edit or delete the redundant one.
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DupSide({ id, name }: { id?: string; name?: string | null }) {
  if (!id) return <span className="font-medium">{name}</span>;
  return (
    <Link href={`/contacts/${id}`} className="font-medium text-primary hover:underline">
      {name}
    </Link>
  );
}
