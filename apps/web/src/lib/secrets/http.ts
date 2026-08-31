import { SecretsError } from "./types";

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new SecretsError("Request body must be a JSON object", {
        code: "INVALID_REQUEST",
        status: 400,
      });
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SecretsError) throw error;
    throw new SecretsError("Invalid JSON request body", {
      code: "INVALID_JSON",
      status: 400,
    });
  }
}

export function secretsErrorResponse(error: unknown): Response {
  if (error instanceof SecretsError) {
    return Response.json(
      {
        error: error.message,
        code: error.code,
        ...(error.field ? { field: error.field } : {}),
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  }
  console.error("Unhandled Secrets API error", error);
  return Response.json(
    { error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

export async function withSecretsErrors(
  operation: () => Promise<Response>,
): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    return secretsErrorResponse(error);
  }
}

export async function withPlaintextSecretsErrors(
  operation: () => Promise<Response>,
): Promise<Response> {
  const response = await withSecretsErrors(operation);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("pragma", "no-cache");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}

export function queryBoolean(value: string | null, fallback = false): boolean {
  if (value === null) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new SecretsError("Boolean query parameter must be true or false", {
    code: "VALIDATION_ERROR",
    status: 400,
  });
}
