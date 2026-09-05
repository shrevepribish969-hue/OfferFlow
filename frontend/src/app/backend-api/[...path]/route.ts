import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Render/Cloudflare can briefly answer 429 while a free service is waking or
// absorbing a burst of workspace requests. Treat it like the other transient
// gateway statuses so a conversation is not failed on the first response.
const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);
const RETRY_DELAYS_MS = [0, 1500, 4000];

function backendUrl() {
  const configured = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const normalized = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  return normalized.replace(/\/$/, "");
}

async function wait(delayMs: number) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function wakeBackend(baseUrl: string) {
  try {
    await fetch(`${baseUrl}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    // The proxied request retry below remains authoritative.
  }
}

function forwardedRequestHeaders(request: NextRequest) {
  const headers = new Headers();
  for (const name of ["accept", "content-type", "if-none-match"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Browser navigation can satisfy the frontend's Basic Auth challenge without
  // repeating Authorization on every client-side fetch. Authenticate the
  // server-to-server hop explicitly so protected API calls remain reliable.
  const password = process.env.APP_PASSWORD;
  if (password) {
    const username = process.env.APP_USERNAME || "offerflow";
    const token = Buffer.from(`${username}:${password}`).toString("base64");
    headers.set("authorization", `Basic ${token}`);
  } else {
    const authorization = request.headers.get("authorization");
    if (authorization) headers.set("authorization", authorization);
  }
  return headers;
}

function forwardedResponseHeaders(upstream: Response) {
  const headers = new Headers();
  for (const name of [
    "cache-control",
    "content-disposition",
    "content-type",
    "etag",
    "last-modified",
    "www-authenticate",
  ]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const baseUrl = backendUrl();
  const upstreamUrl = new URL(`${baseUrl}/api/${path.map(encodeURIComponent).join("/")}`);
  upstreamUrl.search = request.nextUrl.search;

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD"
    ? undefined
    : await request.arrayBuffer();
  let upstream: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    await wait(RETRY_DELAYS_MS[attempt]);
    try {
      upstream = await fetch(upstreamUrl, {
        method,
        headers: forwardedRequestHeaders(request),
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(320_000),
      });

      if (!TRANSIENT_STATUS_CODES.has(upstream.status) || attempt === RETRY_DELAYS_MS.length - 1) {
        break;
      }

      await upstream.body?.cancel();
      await wakeBackend(baseUrl);
    } catch (error) {
      lastError = error;
      upstream = undefined;
      if (attempt < RETRY_DELAYS_MS.length - 1) {
        await wakeBackend(baseUrl);
      }
    }
  }

  if (!upstream) {
    console.error("OfferFlow backend proxy unavailable", {
      path: path.join("/"),
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return Response.json(
      {
        detail: "后端服务正在启动或暂时无法连接，请稍后重新加载。",
        retryable: true,
      },
      { status: 503 },
    );
  }

  return new Response(method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: forwardedResponseHeaders(upstream),
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const HEAD = proxyRequest;
