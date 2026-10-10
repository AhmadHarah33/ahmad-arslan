import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf.server";

// Same approach as the task report (app/api/tasks/[id]/pdf): render our own
// /print page with Playwright. Landscape, because the history table has five
// text columns.
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

export async function GET(req: NextRequest, { params: paramsP }: { params: Promise<{ id: string }> }) {
  const params = await paramsP;
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("id, name")
    .eq("id", params.id)
    .single();
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "tr";

  try {
    const url = `${internalOrigin(req)}/print/customer-history/${params.id}?lang=${lang}`;
    const pdf = await renderPdf(url, req.headers.get("cookie") ?? undefined, {
      landscape: true,
    });
    const prefix = lang === "en" ? "History" : "Gecmis";
    const filename = `${prefix} - ${customer.name || "customer"}.pdf`;
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
