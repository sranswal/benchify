import { NextResponse } from "next/server";
import { isOperator, operatorToken, publicOrigin } from "./operator-access";

export function proxy(request: Request) {
  let token: string;
  try {
    token = operatorToken();
  } catch {
    return new Response("Operator access is misconfigured.", { status: 503 });
  }
  const host = request.headers.get("Host") || "";
  const origin = request.headers.get("Origin");
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && origin) {
    const configured = process.env.BENCHIFY_PUBLIC_ORIGIN;
    const allowed = configured ? [publicOrigin().origin] : ["http://" + host, "https://" + host];
    if (!allowed.includes(origin)) {
      return Response.json({ detail: "Cross-origin writes are blocked." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static/|_next/image|brand/|manifest.webmanifest).*)"],
};
