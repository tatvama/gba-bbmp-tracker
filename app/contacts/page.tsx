import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { ContactDirectory } from "@/components/contacts/contact-directory";
import { listContacts, listDivisions, listSubDivisions, listWards } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  // Division/sub-division/ward filter options come from the master BBMP-225
  // hierarchy (not from `contacts`), so a division/sub-division/ward with zero
  // contacts on file is still a selectable, accurate filter option — same
  // sourcing rule the complaints filter uses.
  const [contacts, allDivisions, allSubDivisions, allWards, user] = await Promise.all([
    listContacts(),
    listDivisions(),
    listSubDivisions(),
    listWards(),
    getSessionUser(),
  ]);
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
      <ContactDirectory
        contacts={contacts}
        initialStatus={status}
        allDivisions={allDivisions}
        allSubDivisions={allSubDivisions}
        allWards={allWards}
      />
    </div>
  );
}
