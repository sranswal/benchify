import { backendHeaders, backendOrigin } from "../../../../operator-access";

async function proxy(request: Request, segments: string[]) {
  const [id, action] = segments;
  const runId = id && /^[0-9a-f-]{36}$/i.test(id);
  const recording = runId && segments.length === 4 && action === "attempts"
    && /^[0-9a-f-]{36}$/i.test(segments[2]) && segments[3] === "recording";
  const read = request.method === "GET" && (
    (segments.length <= 1 && (!id || id === "catalog" || runId)) || recording
  );
  const write = request.method === "POST" && (!id || (
    runId && ["rerun", "replay", "compare"].includes(action) && segments.length === 2
  ));
  if (!read && !write) {
    return Response.json({ detail: "Unknown benchmark route." }, { status: 404 });
  }
  const body = request.method === "POST" ? await request.text() : undefined;
  if (body && body.length > 1000) return Response.json({ detail: "Request is too large." }, { status: 413 });

  try {
    const suffix = segments.length ? "/" + segments.join("/") : "";
    const response = await fetch(new URL("/api/v1/runs" + suffix, backendOrigin()), {
      method: request.method,
      body,
      headers: backendHeaders(request),
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      cache: "no-store",
    });
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    for (const name of ["Content-Disposition", "Content-Security-Policy", "Referrer-Policy", "X-Content-Type-Options", "WWW-Authenticate"]) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json({ detail: "The benchmark API could not complete the request." }, { status: 502 });
  }
}

type Context = { params: Promise<{ path?: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxy(request, (await context.params).path ?? []);
}

export async function POST(request: Request, context: Context) {
  return proxy(request, (await context.params).path ?? []);
}
