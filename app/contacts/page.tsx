import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ContactDirectory } from "@/components/contacts/contact-directory";
import { listContacts } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [contacts, user] = await Promise.all([listContacts(), getSessionUser()]);
  const canEdit = hasRole(user, WRITE_ROLES);

  return (
    <div>
      <PageHeader
        title="Engineer / officer directory"
        description="Contacts attach at the engineering sub-division level (the engineer's unit of responsibility), so wards inherit the officer through it. Seeded contacts from older directories are flagged unverified — verify before official use."
      >
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/contacts/new"><Plus className="h-4 w-4" /> Add contact</Link>
          </Button>
        )}
      </PageHeader>
      <ContactDirectory contacts={contacts} initialStatus={status} />
    </div>
  );
}
