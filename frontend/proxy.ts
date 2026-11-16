import { NextResponse } from "next/server";
import { isOperator, operatorToken, publicOrigin } from "./operator-access";

export function proxy(request: Request) {
  let token: string;
  try {
    token = operatorToken();
  } catch {
    return new Response("Operator access is misconfigured.", { status: 503 });
  }
  if (!isOperator(request, token)) {
    return new Response("Benchify operator authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Benchify", charset="UTF-8"', "Cache-Control": "no-store" },
    });
  }
  const host = request.headers.get("Host") || "";
  if (!token && !/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
    return Response.json({ detail: "Unauthenticated access is limited to local development." }, { status: 403 });
  }
  const origin = request.headers.get("Origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin) {
    const configured = process.env.BENCHIFY_PUBLIC_ORIGIN;
    const allowed = configured ? [publicOrigin().origin] : ["http://" + host, "https://" + host];
    if (!allowed.includes(origin)) {
      return Response.json({ detail: "Cross-origin writes are blocked." }, { status: 403 });
    }
  }
  const response = NextResponse.next();
  if (token) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image|brand/|manifest.webmanifest).*)"],
};
