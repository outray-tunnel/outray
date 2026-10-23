/** Fixed category hints; no original log text survives this projection. */
export function summarizeAgentLogMessage(value: unknown): string {
  if (typeof value !== "string" || !value) return "[message withheld]";
  const message = value.slice(0, 2_000);
  if (/(?:ignore.{0,30}(?:instructions|previous)|system\s*prompt|<\/?(?:system|assistant)>|you are|execute|run command|authorization|bearer|password|secret|token|cookie|api[_-]?key)/i.test(message)) return "[message withheld]";
  if (/timeout|timed out|deadline exceeded/i.test(message)) return "[message withheld; timeout mentioned]";
  if (/connection refused|econnrefused|econnreset/i.test(message)) return "[message withheld; connection failure mentioned]";
  if (/rate limit|too many requests/i.test(message)) return "[message withheld; rate limiting mentioned]";
  if (/out of memory|heap exhausted|enomem/i.test(message)) return "[message withheld; memory exhaustion mentioned]";
  return "[message withheld]";
}
