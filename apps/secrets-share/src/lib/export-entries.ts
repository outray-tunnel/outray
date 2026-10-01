export type NamedEntry = { key: string; value: string };

const envName = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function entriesAsEnv(entries: NamedEntry[]): string {
  if (entries.some(({ key }) => !envName.test(key))) {
    throw new Error("Some names cannot be used as environment variables. Download JSON instead.");
  }
  return entries.map(({ key, value }) => {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
    return `${key}="${escaped}"`;
  }).join("\n") + "\n";
}

export function entriesAsJson(entries: NamedEntry[]): string {
  return JSON.stringify(Object.fromEntries(entries.map(({ key, value }) => [key, value])), null, 2) + "\n";
}
