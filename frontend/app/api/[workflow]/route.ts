import { backendHeaders, backendOrigin } from "../../../operator-access";

export const maxDuration = 105;

export async function POST(request: Request, context: { params: Promise<{ workflow: string }> }) {
  const { workflow } = await context.params;
  if (workflow !== "briefings" && workflow !== "verify") {
    return Response.json({ detail: "Unknown workflow." }, { status: 404 });
  }
  const body = await request.text();
  if (body.length > 16_000) {
    return Response.json({ detail: "This request is too large." }, { status: 413 });
  }
  try {
    const upstreamUrl = new URL("/api/v1/" + workflow, backendOrigin());
    const captureMode = new URL(request.url).searchParams.get("capture_mode");
    if (captureMode !== null) upstreamUrl.searchParams.set("capture_mode", captureMode);
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: backendHeaders(request),
      redirect: "error",
      body,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(95_000)]),
    });
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    const requestId = upstream.headers.get("X-Request-ID");
    if (requestId) headers.set("X-Request-ID", requestId);
    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return Response.json({ detail: "The Benchify API could not complete the request." }, { status: 502 });
  }
}
