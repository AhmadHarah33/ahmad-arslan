import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf.server";

// Same approach as the task report (app/api/tasks/[id]/pdf): fetch our own
// /print page with the caller's session and photograph it with Chromium.
function internalOrigin(req: NextRequest): string {
  if (process.env.APP_INTERNAL_URL) return process.env.APP_INTERNAL_URL;
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return `${proto}://${host}`;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: agreement } = await supabase
    .from("agreements")
    .select("id, customer:customer_id(name)")
    .eq("id", params.id)
    .maybeSingle();
  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found." }, { status: 404 });
  }

  const customer = Array.isArray(agreement.customer) ? agreement.customer[0] : agreement.customer;

  try {
    const url = `${internalOrigin(req)}/print/agreement/${params.id}`;
    const pdf = await renderPdf(url, req.headers.get("cookie") ?? undefined);
    const filename = `${(customer as { name?: string } | null)?.name || "agreement"} - agreement.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not render the PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
