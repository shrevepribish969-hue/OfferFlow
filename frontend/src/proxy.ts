import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("OfferFlow authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="OfferFlow"' },
  });
}

export function proxy(request: NextRequest) {
  const expectedPassword = process.env.APP_PASSWORD;

  // Keep local development frictionless, but never expose a Render deployment
  // when its generated password is missing.
  if (!expectedPassword) {
    return process.env.RENDER ? unauthorized() : NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  try {
    const decoded = atob(authorization.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return unauthorized();
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (
      username !== (process.env.APP_USERNAME || "offerflow") ||
      password !== expectedPassword
    ) {
      return unauthorized();
    }
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
