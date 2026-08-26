import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendUrl() {
  const configured = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const normalized = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  return normalized.replace(/\/$/, "");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await request.text();

  const headers: Record<string, string> = {
    "Content-Type": request.headers.get("content-type") || "application/json",
    Accept: "text/event-stream",
  };
  const authorization = request.headers.get("authorization");
  if (authorization) headers.Authorization = authorization;

  const upstream = await fetch(`${backendUrl()}/api/jobs/${id}/chat`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
