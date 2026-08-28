import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backendUrl() {
  const configured = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const normalized = /^https?:\/\//i.test(configured) ? configured : `http://${configured}`;
  return normalized.replace(/\/$/, "");
}

const TRANSIENT_STATUS_CODES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [0, 1500, 4000];

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
    // The subsequent retry remains authoritative. A failed warm-up must not
    // replace the useful error handling below with another exception.
  }
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

  const baseUrl = backendUrl();
  let upstream: Response | undefined;
  let lastError: unknown;

  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    await wait(RETRY_DELAYS_MS[attempt]);
    try {
      upstream = await fetch(`${baseUrl}/api/jobs/${id}/chat`, {
        method: "POST",
        headers,
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
    console.error("OfferFlow backend chat proxy unavailable", lastError);
    const event = {
      type: "text",
      content: "服务刚刚未能连接成功，可能仍在冷启动。请稍等片刻后重新发送，我会从这条消息继续。",
      data: { retryable: true },
    };
    return new Response(`data: ${JSON.stringify(event)}\n\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
