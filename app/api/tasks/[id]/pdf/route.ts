import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderPdf } from "@/lib/pdf.server";

// The URL this server should use to fetch its own /print page for
// Playwright to photograph. Same reasoning as SUPABASE_INTERNAL_URL
// (lib/supabase/internal-url.ts): the app and this route run on the same
// box, so going out through the public domain/tunnel and back in is pure
// latency (and can fail entirely if that domain isn't reachable from inside
// the container). Falls back to the request's own host when unset.
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
  const { data: task } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("id", params.id)
    .single();
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }

  try {
    const url = `${internalOrigin(req)}/print/task/${params.id}`;
    const pdf = await renderPdf(url, req.headers.get("cookie") ?? undefined);
    const filename = `${task.title || "task"}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // The most common cause in dev is Chromium not being installed
    // (`npx playwright-core install chromium`) — surface the real message
    // rather than a bare 500.
    const message = err instanceof Error ? err.message : "Could not render the PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
