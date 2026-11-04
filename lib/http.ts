import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Standard JSON response helper. */
export const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

/**
 * Parse and validate a JSON request body using a Zod schema.
 */
export async function parse<T>(
  req: Request,
  schema: ZodType<T>
): Promise<
  | { ok: true; data: T }
  | { ok: false; res: NextResponse }
> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      res: json({ error: "Invalid JSON body" }, 400),
    };
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    return {
      ok: false,
      res: json(
        {
          error: "Validation failed",
          details: result.error.issues.map(
            (issue) =>
              `${issue.path.join(".")}: ${issue.message}`
          ),
        },
        400
      ),
    };
  }

  return { ok: true, data: result.data };
}

/**
 * Convert a positive integer URL parameter into a number.
 * Rejects decimals, zero, negative numbers and unsafe integers.
 */
export function parseId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const number = Number(value);

  return Number.isSafeInteger(number) ? number : null;
}

/**
 * Map PostgreSQL constraint errors to appropriate HTTP responses.
 */
export function dbError(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return json({ error: "Validation failed" }, 400);
  }

  const err = error as {
    code?: string;
    message?: string;
    constraint?: string;
  };

  switch (err?.code) {
    case "23505":
      return json(
        {
          error: `Already exists (${err.constraint ?? "unique"})`,
        },
        409
      );

    case "23503":
      return json(
        {
          error: `Referenced record does not exist or is still in use (${err.constraint ?? "fk"})`,
        },
        409
      );

    case "23514":
      return json(
        {
          error: `Value rejected by database check (${err.constraint ?? "check"})`,
        },
        400
      );

    case "23502":
      return json({ error: "Missing required value" }, 400);

    case "22P02":
      return json({ error: "Invalid value format" }, 400);

    case "P0001":
      return json(
        { error: err.message ?? "Rule violation" },
        409
      );

    default:
      console.error("Unhandled database/API error:", error);
      return json({ error: "Internal server error" }, 500);
  }
}