import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const tinybirdBranch = process.env.TINYBIRD_BRANCH?.trim() || "development";

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
      [
        "--branch",
        tinybirdBranch,
        "--show-tokens",
        "token",
        "ls",
        "--match",
        "OUTRAY",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error(
      `Tinybird credentials are missing for branch ${tinybirdBranch}. Run \`tb login\` and create/deploy the branch, or set TINYBIRD_INGEST_TOKEN and TINYBIRD_QUERY_TOKEN in the root .env.`,
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
      `OutRay's scoped Tinybird tokens do not exist on branch ${tinybirdBranch}. Run \`tb --branch ${tinybirdBranch} deploy\` before starting development.`,
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
  env: {
    ...process.env,
    TINYBIRD_BRANCH: tinybirdBranch,
    ...localApiHost(),
    ...localTinybirdTokens(),
  },
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
