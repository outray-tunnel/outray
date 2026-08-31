const SUPPORTED_HTTP_METHODS = new Set([
  "CONNECT",
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "TRACE",
]);

export function normalizeHttpMethod(value: string) {
  const method = value.trim().toUpperCase();
  return SUPPORTED_HTTP_METHODS.has(method) ? method : "GET";
}
