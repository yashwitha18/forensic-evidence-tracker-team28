
import { NextRequest, NextResponse } from "next/server";
import { COOKIE, verifyToken } from "@/lib/auth";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  const session = verifyToken(token);
  const { pathname } = request.nextUrl;

  // Login is public. Authenticated users go to the home page.
  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  // All other matched application pages require a valid session.
  if (!session) {
    const response = NextResponse.redirect(
      new URL("/login", request.url)
    );

    // Remove an invalid or expired cookie.
    response.cookies.delete(COOKIE);

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
