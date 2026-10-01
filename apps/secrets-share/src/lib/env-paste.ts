export type EnvEntry = { key: string; value: string };

const assignment = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function isEnvPasteCandidate(text: string): boolean {
  return text.replace(/^\uFEFF/, "").split(/\r\n?|\n/).some((line) => assignment.test(line));
}

function closingQuote(value: string, quote: string): number {
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) continue;
    let slashes = 0;
    for (let before = index - 1; before >= 1 && value[before] === "\\"; before -= 1) slashes += 1;
    if (slashes % 2 === 0) return index;
  }
  return -1;
}

export function parseEnvPaste(text: string): EnvEntry[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const entries: EnvEntry[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const lineNumber = index + 1;
    const match = assignment.exec(line);
    if (!match) throw new Error(`Line ${lineNumber} must be in KEY=VALUE format.`);

    let value = match[2];
    const quote = value[0];
    if (quote === '"' || quote === "'" || quote === "`") {
      let end = closingQuote(value, quote);
      while (end < 0 && index + 1 < lines.length) {
        value += `\n${lines[++index]}`;
        end = closingQuote(value, quote);
      }
      if (end < 0) throw new Error(`Line ${lineNumber} has an unfinished quoted value.`);
      const after = value.slice(end + 1).trim();
      if (after && !after.startsWith("#")) throw new Error(`Line ${lineNumber} has text after its quoted value.`);
      value = value.slice(1, end);
      if (quote === '"') {
        value = value.replace(/\\([nrt"\\])/g, (_, escaped: string) =>
          escaped === "n" ? "\n" : escaped === "r" ? "\r" : escaped === "t" ? "\t" : escaped);
      } else {
        value = value.replaceAll(`\\${quote}`, quote);
      }
    } else {
      value = value.trim();
    }

    entries.push({ key: match[1], value });
  }

  return entries;
}

export function mergeEnvEntries(current: EnvEntry[], index: number, imported: EnvEntry[], limit: number): EnvEntry[] {
  if (!imported.length) return current;
  const replaceEmptyRow = !current[index]?.key.trim() && !current[index]?.value;
  const next = replaceEmptyRow
    ? [...current.slice(0, index), ...imported, ...current.slice(index + 1)]
    : [...current.slice(0, index + 1), ...imported, ...current.slice(index + 1)];
  if (next.length > limit) throw new Error(`A share can contain at most ${limit} named ${limit === 1 ? "secret" : "secrets"}. Nothing was imported.`);
  const names = next.map((entry) => entry.key.trim()).filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error("Secret names must be unique. Nothing was imported.");
  return next;
}
