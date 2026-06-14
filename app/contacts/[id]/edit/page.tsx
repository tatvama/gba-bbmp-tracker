import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ContactForm } from "@/components/contacts/contact-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { updateContact } from "@/lib/actions/contacts";
import { getContact, getFormOptions } from "@/lib/queries";
import { getSessionUser, hasRole } from "@/lib/auth";
import { WRITE_ROLES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!hasRole(user, WRITE_ROLES)) {
    return (
      <EmptyState icon={Lock} title="Editor access required" description="Sign in as an Editor or Admin to edit contacts.">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </EmptyState>
    );
  }

  const [contact, options] = await Promise.all([getContact(id), getFormOptions()]);
  if (!contact) notFound();

  const action = updateContact.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`Edit · ${contact.full_name}`} />
      <ContactForm action={action} options={options} initial={contact} />
    </div>
  );
}
