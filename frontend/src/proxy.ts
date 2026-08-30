import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorized(request: NextRequest) {
  const headers = new Headers();

  // A Basic challenge on an API, RSC prefetch, or asset response makes browsers
  // show a site-wide login dialog even when the visible Demo page is public.
  // Only challenge real top-level document navigations; background requests
  // still receive a normal 401 without interrupting the visitor.
  if (request.headers.get("sec-fetch-dest") === "document") {
    headers.set("WWW-Authenticate", 'Basic realm="OfferFlow"');
  }

  return new NextResponse("OfferFlow authentication required", {
    status: 401,
    headers,
  });
}

export function proxy(request: NextRequest) {
  const isPublicDemo = request.nextUrl.pathname === "/demo"
    || request.nextUrl.pathname.startsWith("/demo/")
    || request.nextUrl.pathname.startsWith("/backend-api/demo/")
    || (request.nextUrl.pathname.startsWith("/workspace/") && request.nextUrl.searchParams.get("demo") === "1");
  if (isPublicDemo) return NextResponse.next();

  const expectedPassword = process.env.APP_PASSWORD;

  // Keep local development frictionless, but never expose a Render deployment
  // when its generated password is missing.
  if (!expectedPassword) {
    return process.env.RENDER ? unauthorized(request) : NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized(request);

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized(request);
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (
      username !== (process.env.APP_USERNAME || "offerflow") ||
      password !== expectedPassword
    ) {
      return unauthorized(request);
    }
  } catch {
    return unauthorized(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
