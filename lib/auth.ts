import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextResponse, connection } from "next/server";

export type Role = "ADMIN" | "INVESTIGATOR" | "CUSTODIAN";

export interface Session {
  userId: number;
  role: Role;
  name: string;
}

export const COOKIE = "session";

const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET is missing or shorter than 32 characters."
    );
  }

  return secret;
}

function isRole(value: unknown): value is Role {
  return (
    value === "ADMIN" ||
    value === "INVESTIGATOR" ||
    value === "CUSTODIAN"
  );
}

/**
 * Generate a signed JWT for an authenticated user.
 */
export function signToken(session: Session): string {
  if (
    !Number.isSafeInteger(session.userId) ||
    session.userId <= 0 ||
    !isRole(session.role) ||
    typeof session.name !== "string"
  ) {
    throw new Error("Invalid session data.");
  }

  return jwt.sign(
    {
      userId: session.userId,
      role: session.role,
      name: session.name,
    },
    getSecret(),
    {
      algorithm: "HS256",
      expiresIn: SESSION_DURATION_SECONDS,
    }
  );
}

/**
 * Verify a JWT and validate its payload.
 * Returns null for invalid, expired or malformed tokens.
 */
export function verifyToken(
  token: string | undefined
): Session | null {
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getSecret(), {
      algorithms: ["HS256"],
    });

    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof payload.userId !== "number" ||
      !Number.isSafeInteger(payload.userId) ||
      payload.userId <= 0 ||
      !isRole(payload.role) ||
      typeof payload.name !== "string"
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

/**
 * Store the JWT in an HttpOnly session cookie.
 */
export async function setSessionCookie(
  session: Session
): Promise<void> {
  const token = signToken(session);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

/**
 * Remove the session cookie during logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

/**
 * Get the session from a Server Component or Server Page.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();

  await connection();
  return verifyToken(cookieStore.get(COOKIE)?.value);
}

/**
 * Extract the session token from an incoming HTTP request.
 */
function getCookieFromRequest(
  request: Request,
  cookieName: string
): string | undefined {
  const header = request.headers.get("cookie");

  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator < 0) continue;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();

    if (name === cookieName) {
      return value || undefined;
    }
  }

  return undefined;
}

/**
 * Get the session from an API request or NextRequest.
 */
export function getSessionFromRequest(
  request: Request
): Session | null {
  return verifyToken(getCookieFromRequest(request, COOKIE));
}

/**
 * Authenticate a request and optionally enforce roles.
 *
 * Empty roles array = any authenticated user.
 */
export function requireRole(
  request: Request,
  roles: readonly Role[] = []
):
  | { ok: true; s: Session }
  | { ok: false; res: NextResponse } {
  const session = getSessionFromRequest(request);

  if (!session) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "Not logged in" },
        { status: 401 }
      ),
    };
  }

  if (roles.length > 0 && !roles.includes(session.role)) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: `Forbidden for role ${session.role}` },
        { status: 403 }
      ),
    };
  }

  return { ok: true, s: session };
}