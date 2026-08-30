import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

function localApiHost() {
  if (process.env.TINYBIRD_API_HOST) return {};
  try {
    const credentials = JSON.parse(readFileSync(".tinyb", "utf8"));
    if (typeof credentials.host === "string" && credentials.host) {
      return { TINYBIRD_API_HOST: credentials.host };
    }
  } catch {
    // The actionable credential error below covers a missing or invalid file.
  }
  return {};
}

function localTinybirdTokens() {
  if (process.env.TINYBIRD_INGEST_TOKEN && process.env.TINYBIRD_QUERY_TOKEN) {
    return {};
  }

  let output;
  try {
    output = execFileSync(
      "tb",
      ["--cloud", "--show-tokens", "token", "ls", "--match", "OUTRAY"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error(
      "Tinybird credentials are missing. Run `tb login` and `tb deploy`, or set TINYBIRD_INGEST_TOKEN and TINYBIRD_QUERY_TOKEN in the root .env.",
    );
  }

  const tokens = {};
  for (const block of output.split(/^-{10,}$/m)) {
    const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
    const token = block.match(/^token:\s*(.+)$/m)?.[1]?.trim();
    if (name && token) tokens[name] = token;
  }

  const ingestToken = tokens.OUTRAY_INGEST_TOKEN;
  const queryToken = tokens.OUTRAY_QUERY_TOKEN;
  if (!ingestToken || !queryToken) {
    throw new Error(
      "OutRay's scoped Tinybird tokens do not exist. Run `tb deploy` before starting development.",
    );
  }

  return {
    TINYBIRD_INGEST_TOKEN: ingestToken,
    TINYBIRD_QUERY_TOKEN: queryToken,
  };
}

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("No command was provided");

const child = spawn(command, args, {
  env: { ...process.env, ...localApiHost(), ...localTinybirdTokens() },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
