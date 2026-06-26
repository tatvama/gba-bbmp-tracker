import * as React from "react";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getRti, getFirstAppeal, getSecondAppeal } from "@/lib/queries";
import { documentRegistry } from "@/lib/pdf/document-registry";
import { GovernmentDocumentView } from "@/components/rti/government-document-view";
import { PrintControlBar } from "@/components/rti/print-control-bar";

// Import stylesheet to activate it inside this bundle
import "@/app/styles/government-document.css";

interface PrintPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; appealId?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PrintPage({ params, searchParams }: PrintPageProps) {
  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="p-8 text-center text-destructive font-semibold">
        Not authorized. Please log in first.
      </div>
    );
  }

  const { id } = await params;
  const { type = "rti", appealId } = await searchParams;

  let docData;
  let downloadUrl = "";

  if (type === "rti") {
    const rti = await getRti(id);
    if (!rti) notFound();
    docData = documentRegistry.map("rti", rti);
    downloadUrl = `/api/rti/${id}/pdf`;
  } else if (type === "first_appeal") {
    if (!appealId) return <div className="p-8 text-center text-destructive">Missing appealId query parameter.</div>;
    const appeal = await getFirstAppeal(appealId);
    const rti = await getRti(id);
    if (!appeal || !rti) notFound();
    docData = documentRegistry.map("first_appeal", appeal, { rti });
    downloadUrl = `/api/rti/${id}/first-appeal/pdf?appealId=${appealId}`;
  } else if (type === "second_appeal") {
    if (!appealId) return <div className="p-8 text-center text-destructive">Missing appealId query parameter.</div>;
    const appeal = await getSecondAppeal(appealId);
    const rti = await getRti(id);
    if (!appeal || !rti) notFound();

    let firstAppeal = null;
    if (appeal.first_appeal_id) {
      firstAppeal = await getFirstAppeal(appeal.first_appeal_id);
    }

    docData = documentRegistry.map("second_appeal", appeal, { rti, firstAppeal });
    downloadUrl = `/api/rti/${id}/second-appeal/pdf?appealId=${appealId}`;
  } else {
    return <div className="p-8 text-center text-destructive">Unsupported document type: {type}</div>;
  }

  return (
    <div className="gov-doc-print-mode">
      {/* 1. Control bar (Client Component containing native triggers) */}
      <PrintControlBar id={id} downloadUrl={downloadUrl} />

      {/* 2. Simulated A4 page container */}
      <div className="gov-doc-print-wrapper">
        <GovernmentDocumentView data={docData} />
      </div>
    </div>
  );
}
