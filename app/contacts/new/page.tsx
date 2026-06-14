import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ContactForm } from "@/components/contacts/contact-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { createContact } from "@/lib/actions/contacts";
import { getFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";
import { Lock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewContactPage() {
  const user = await getSessionUser();
  if (!hasRole(user, WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required" description="Sign in as an Editor or Admin to add contacts.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }
  const options = await getFormOptions();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add contact" description="New contacts default to Pending / Low confidence until verified." />
      <ContactForm action={createContact} options={options} />
    </div>
  );
}
