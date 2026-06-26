import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateSecondAppealPdfService } from "@/lib/pdf/document-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const { id: rtiId } = await ctx.params;
  const url = new URL(req.url);
  const appealId = url.searchParams.get("appealId");

  if (!appealId) {
    return NextResponse.json({ error: "Missing appealId query parameter." }, { status: 400 });
  }

  try {
    const { buffer, fileName } = await generateSecondAppealPdfService(appealId);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Failed to generate Second Appeal PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF generation failed" },
      { status: 500 }
    );
  }
}
