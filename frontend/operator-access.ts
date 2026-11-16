import { timingSafeEqual } from "node:crypto";

export function publicOrigin() {
  const configured = process.env.BENCHIFY_PUBLIC_ORIGIN;
  try {
    const url = new URL(configured || "http://localhost:3000");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        !["http:", "https:"].includes(url.protocol) ||
        (process.env.BENCHIFY_ENV === "production" && (!configured || url.protocol !== "https:"))) {
      throw new Error("Invalid origin.");
    }
    return url;
  } catch {
    throw new Error("Configure BENCHIFY_PUBLIC_ORIGIN as the deployment origin.");
  }
}

export function backendOrigin() {
  const configured = process.env.BENCHIFY_API_URL;
  const production = process.env.BENCHIFY_ENV === "production";
  try {
    const url = new URL(configured || "http://127.0.0.1:8000");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        !["http:", "https:"].includes(url.protocol) ||
        (production && (!configured || url.protocol !== "https:" ||
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new Error("Invalid backend origin.");
    }
    return url;
  } catch {
    throw new Error("Configure BENCHIFY_API_URL as the backend origin.");
  }
}

export function operatorToken() {
  const mode = process.env.BENCHIFY_ENV || "development";
  const token = process.env.BENCHIFY_OPERATOR_TOKEN || "";
  if (!["development", "production"].includes(mode) ||
      ((token || mode === "production") && !/^[A-Za-z0-9_-]{32,128}$/.test(token))) {
    throw new Error("Operator access is misconfigured.");
  }
  publicOrigin();
  return token;
}

export function isOperator(request: Request, token: string) {
  if (!token) return true;
  const provided = Buffer.from(request.headers.get("Authorization") || "");
  const expected = Buffer.from("Basic " + Buffer.from("benchify:" + token).toString("base64"));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function backendHeaders(request: Request) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = operatorToken();
  if (token && isOperator(request, token)) headers.set("Authorization", "Bearer " + token);
  return headers;
}
