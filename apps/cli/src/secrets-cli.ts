import fs from "fs";
import path from "path";
import prompts from "prompts";
import {
  findNearestSecretsConfig,
  isProductionEnvironment,
  resolveSecretsTargetPartial,
  resolveSecretsTarget,
  saveNearestSecretsConfig,
  type LocatedSecretsConfig,
  type PartialSecretsTarget,
  type SecretsTarget,
} from "./secrets-config";
import {
  SecretsApiClient,
  type SecretRecord,
  type SecretTargetEnvironment,
  type SecretTargetOrganization,
  type SecretTargetProject,
} from "./secrets-api";
import {
  exportEnvText,
  parseEnvText,
  normalizeSecretKey,
  secretsToJson,
  stripSingleTrailingLineBreak,
  writePrivateFileExclusiveAtomic,
} from "./secrets-env";
import { runWithSecretsOnce, runWithSecretsWatch } from "./secrets-run";

interface CommandContext {
  cwd?: string;
  webUrl: string;
  env?: NodeJS.ProcessEnv;
  stdin?: NodeJS.ReadStream;
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  resolveActiveOrganization?: () => Promise<string | null>;
  resolveBrowserToken?: (organization: string) => Promise<string | null>;
}

interface OptionDefinition {
  name: string;
  aliases?: string[];
  boolean?: boolean;
}

interface ParsedArguments {
  values: Record<string, string | boolean>;
  positionals: string[];
  passthrough: string[];
}

const commonOptions: OptionDefinition[] = [
  { name: "org", aliases: ["-o"] },
  { name: "project", aliases: ["-p"] },
  { name: "env", aliases: ["-e"] },
  { name: "config" },
  { name: "api-url" },
  { name: "confirm-production", boolean: true },
  { name: "dev", boolean: true },
  { name: "help", aliases: ["-h"], boolean: true },
];

function parseArguments(
  args: string[],
  options: OptionDefinition[],
  allowPassthrough = false,
): ParsedArguments {
  const definitions = new Map<string, OptionDefinition>();
  for (const option of options) {
    definitions.set(`--${option.name}`, option);
    for (const alias of option.aliases ?? []) definitions.set(alias, option);
  }

  const values: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") {
      if (!allowPassthrough) throw new Error("Unexpected -- separator.");
      return { values, positionals, passthrough: args.slice(index + 1) };
    }
    if (!argument.startsWith("-")) {
      positionals.push(argument);
      continue;
    }

    const equalsIndex = argument.indexOf("=");
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const definition = definitions.get(flag);
    if (!definition) throw new Error(`Unknown option: ${flag}`);
    if (definition.boolean) {
      if (equalsIndex !== -1) {
        throw new Error(`${flag} does not take a value.`);
      }
      values[definition.name] = true;
      continue;
    }

    const value =
      equalsIndex === -1 ? args[++index] : argument.slice(equalsIndex + 1);
    if (
      !value ||
      (equalsIndex === -1 && value !== "-" && value.startsWith("-"))
    ) {
      throw new Error(`${flag} requires a value.`);
    }
    values[definition.name] = value;
  }
  return { values, positionals, passthrough: [] };
}

function stringOption(
  parsed: ParsedArguments,
  name: string,
): string | undefined {
  const value = parsed.values[name];
  return typeof value === "string" ? value : undefined;
}

function booleanOption(parsed: ParsedArguments, name: string): boolean {
  return parsed.values[name] === true;
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  let result = "";
  for await (const chunk of stream as AsyncIterable<string | Buffer>) {
    result += typeof chunk === "string" ? chunk : chunk.toString("utf8");
  }
  return result;
}

function mapSecrets(
  secrets: Array<{ key: string; value?: string }>,
): Record<string, string> {
  return Object.fromEntries(
    secrets.map((secret) => {
      if (secret.value === undefined) {
        throw new Error(`Secret ${secret.key} was returned without a value.`);
      }
      return [secret.key, secret.value];
    }),
  );
}

function requireProductionConfirmation(
  target: SecretsTarget,
  parsed: ParsedArguments,
): void {
  if (
    isProductionEnvironment(target.environment) &&
    !booleanOption(parsed, "confirm-production")
  ) {
    throw new Error(
      `This operation accesses values in ${target.organization}/${target.project}/${target.environment}. Re-run with --confirm-production.`,
    );
  }
}

async function mutationSnapshot(
  api: SecretsApiClient,
  target: SecretsTarget,
  confirmProduction: boolean,
): Promise<{ revision: number; secrets: SecretRecord[] }> {
  const [revision, collection] = await Promise.all([
    api.revision(target, { confirmProduction }),
    api.list(target),
  ]);
  if (!Number.isSafeInteger(revision.revision) || revision.revision < 0) {
    throw new Error("The server returned an invalid Secrets revision.");
  }
  return { revision: revision.revision, secrets: collection.secrets };
}

function expectedVersions(
  keys: Iterable<string>,
  secrets: SecretRecord[],
): Record<string, number | null> {
  const current = new Map(
    secrets.map((secret) => [secret.key, secret.version]),
  );
  return Object.fromEntries(
    Array.from(keys, (key) => [key, current.get(key) ?? null]),
  );
}

function currentSecret(secrets: SecretRecord[], key: string): SecretRecord {
  const secret = secrets.find((candidate) => candidate.key === key);
  if (!secret) throw new Error(`Secret ${key} does not exist.`);
  return secret;
}

async function resolveCredential(
  organization: string | undefined,
  context: CommandContext,
): Promise<string> {
  const env = context.env ?? process.env;
  const machineToken = env.OUTRAY_TOKEN?.trim() || env.OUTRAY_API_KEY?.trim();
  if (machineToken) return machineToken;

  const browserOrganization =
    organization ?? (await context.resolveActiveOrganization?.()) ?? undefined;
  const browserToken = browserOrganization
    ? await context.resolveBrowserToken?.(browserOrganization)
    : null;
  if (!browserToken) {
    throw new Error(
      "Secrets authentication is required. Run outray login or set OUTRAY_TOKEN.",
    );
  }
  return browserToken;
}

function apiUrl(parsed: ParsedArguments, context: CommandContext): string {
  return stringOption(parsed, "api-url") ?? context.webUrl;
}

async function selectTargetItem<T extends { name: string; slug: string }>(
  label: "organization" | "project" | "environment",
  items: T[],
  requested: string | undefined,
  stdin: NodeJS.ReadStream,
): Promise<T> {
  if (requested) {
    const match = items.find((item) => item.slug === requested);
    if (!match) throw new Error(`${label} "${requested}" is not available.`);
    return match;
  }
  if (items.length === 0)
    throw new Error(`No Secrets ${label}s are available.`);
  if (items.length === 1) return items[0];
  if (!stdin.isTTY) {
    const flag =
      label === "environment"
        ? "--env"
        : label === "organization"
          ? "--org"
          : "--project";
    throw new Error(
      `Multiple Secrets ${label}s are available. Pass ${flag} in non-interactive environments.`,
    );
  }

  const response = await prompts({
    type: "select",
    name: "slug",
    message: `Select ${label}`,
    choices: items.map((item) => ({
      title: `${item.name} (${item.slug})`,
      value: item.slug,
    })),
  });
  if (typeof response.slug !== "string") {
    throw new Error(`No ${label} selected.`);
  }
  return items.find((item) => item.slug === response.slug)!;
}

async function pickTarget(
  partial: PartialSecretsTarget,
  api: SecretsApiClient,
  stdin: NodeJS.ReadStream,
): Promise<SecretsTarget> {
  const response = await api.targets();
  const organization = await selectTargetItem<SecretTargetOrganization>(
    "organization",
    response.organizations,
    partial.organization,
    stdin,
  );
  const project = await selectTargetItem<SecretTargetProject>(
    "project",
    organization.projects,
    partial.project,
    stdin,
  );
  const environment = await selectTargetItem<SecretTargetEnvironment>(
    "environment",
    project.environments,
    partial.environment,
    stdin,
  );
  return {
    organization: organization.slug,
    project: project.slug,
    environment: environment.slug,
  };
}

async function resolveCommandTarget(
  parsed: ParsedArguments,
  context: CommandContext,
  options: { allowMissingConfig?: boolean } = {},
): Promise<{ target: SecretsTarget; config: LocatedSecretsConfig | null }> {
  const cwd = context.cwd ?? process.cwd();
  const config = findNearestSecretsConfig(
    cwd,
    stringOption(parsed, "config"),
    options.allowMissingConfig,
  );
  const env = context.env ?? process.env;
  const hasOrganization = Boolean(
    stringOption(parsed, "org") ||
    env.OUTRAY_ORG ||
    config?.secrets.org ||
    config?.globalOrg,
  );
  const hasMachineToken = Boolean(
    env.OUTRAY_TOKEN?.trim() || env.OUTRAY_API_KEY?.trim(),
  );
  const activeOrganization =
    hasOrganization || hasMachineToken
      ? null
      : await context.resolveActiveOrganization?.();
  const input = {
    org: stringOption(parsed, "org"),
    project: stringOption(parsed, "project"),
    environment: stringOption(parsed, "env"),
    activeOrganization,
    config,
    env,
  };
  const partial = resolveSecretsTargetPartial(input);
  if (partial.organization && partial.project && partial.environment) {
    return { target: resolveSecretsTarget(input), config };
  }

  const token = await resolveCredential(partial.organization, context);
  const discoveryApi = new SecretsApiClient(apiUrl(parsed, context), token);
  return {
    target: await pickTarget(
      partial,
      discoveryApi,
      context.stdin ?? process.stdin,
    ),
    config,
  };
}

async function createApi(
  parsed: ParsedArguments,
  target: SecretsTarget,
  context: CommandContext,
): Promise<SecretsApiClient> {
  return new SecretsApiClient(
    apiUrl(parsed, context),
    await resolveCredential(target.organization, context),
  );
}

function printSecretsHelp(output: Pick<NodeJS.WriteStream, "write">): void {
  output.write(`
Usage: outray secrets <command> [options]

Commands:
  use                         Save the project and environment target
  list [--values]             List metadata or explicitly reveal values
  pull [--force]              Export dotenv/JSON; never overwrite by default
  set <KEY>                   Set via hidden prompt or --value-stdin
  import --from <FILE|->      Import dotenv values
  delete <KEY>                Delete a secret
  rollback <KEY> --version N  Restore a historical version
  run -- <COMMAND...>         Run a command with remote secrets

Target options:
  --org, -o <slug>            Organization slug
  --project, -p <slug>        Secrets project slug
  --env, -e <slug>            Environment slug
  --config <path>             Explicit outray/config.toml
  --confirm-production        Permit production value access or mutation

Authentication uses OUTRAY_TOKEN, then OUTRAY_API_KEY, then outray login.
`);
}

async function confirmDelete(
  key: string,
  target: SecretsTarget,
  stdin: NodeJS.ReadStream,
): Promise<boolean> {
  if (!stdin.isTTY) {
    throw new Error(
      "Delete confirmation requires a terminal; pass --yes to continue.",
    );
  }
  const result = await prompts({
    type: "confirm",
    name: "confirmed",
    message: `Delete ${key} from ${target.project}/${target.environment}?`,
    initial: false,
  });
  return result.confirmed === true;
}

async function confirmRollback(
  key: string,
  version: number,
  target: SecretsTarget,
  stdin: NodeJS.ReadStream,
): Promise<boolean> {
  if (!stdin.isTTY) {
    throw new Error(
      "Rollback confirmation requires a terminal; pass --yes to continue.",
    );
  }
  const result = await prompts({
    type: "confirm",
    name: "confirmed",
    message: `Roll back ${key} in ${target.project}/${target.environment} to version ${version}?`,
    initial: false,
  });
  return result.confirmed === true;
}

export async function runSecretsCommand(
  args: string[],
  context: CommandContext,
): Promise<number> {
  const stdout = context.stdout ?? process.stdout;
  const stdin = context.stdin ?? process.stdin;
  const command = args[0];
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printSecretsHelp(stdout);
    return 0;
  }

  if (command === "use") {
    const parsed = parseArguments(args.slice(1), commonOptions);
    if (booleanOption(parsed, "help")) {
      stdout.write(
        "Usage: outray secrets use [--org SLUG] [--project SLUG] [--env SLUG] [--config PATH]\n",
      );
      return 0;
    }
    if (parsed.positionals.length > 0) {
      throw new Error(
        "outray secrets use does not accept positional arguments.",
      );
    }
    const { target } = await resolveCommandTarget(parsed, context, {
      allowMissingConfig: true,
    });
    const saved = saveNearestSecretsConfig(
      {
        org: target.organization,
        project: target.project,
        environment: target.environment,
      },
      {
        cwd: context.cwd,
        explicitPath: stringOption(parsed, "config"),
      },
    );
    stdout.write(`Saved Secrets target in ${saved.path}.\n`);
    return 0;
  }

  const commandOptions: Record<string, OptionDefinition[]> = {
    list: [{ name: "values", boolean: true }],
    pull: [
      { name: "format" },
      { name: "out" },
      { name: "force", boolean: true },
    ],
    set: [{ name: "value-stdin", aliases: ["--stdin"], boolean: true }],
    import: [{ name: "from" }],
    delete: [{ name: "yes", boolean: true }],
    rollback: [{ name: "version" }, { name: "yes", boolean: true }],
    run: [{ name: "watch", boolean: true }, { name: "watch-interval" }],
  };
  const specificOptions = commandOptions[command];
  if (!specificOptions) throw new Error(`Unknown secrets command: ${command}`);
  const parsed = parseArguments(
    args.slice(1),
    [...commonOptions, ...specificOptions],
    command === "run",
  );
  if (booleanOption(parsed, "help")) {
    printSecretsHelp(stdout);
    return 0;
  }

  const { target } = await resolveCommandTarget(parsed, context);
  const api = await createApi(parsed, target, context);

  if (command === "list") {
    if (parsed.positionals.length > 0) {
      throw new Error(
        "outray secrets list does not accept positional arguments.",
      );
    }
    const includeValues = booleanOption(parsed, "values");
    if (includeValues) requireProductionConfirmation(target, parsed);
    const result = await api.list(target, {
      values: includeValues,
      confirmProduction: booleanOption(parsed, "confirm-production"),
    });
    if (result.secrets.length === 0) {
      stdout.write("No secrets.\n");
      return 0;
    }
    if (includeValues) {
      stdout.write(exportEnvText(mapSecrets(result.secrets)));
      return 0;
    }
    stdout.write("KEY\tVERSION\tUPDATED\n");
    for (const secret of result.secrets) {
      stdout.write(`${secret.key}\t${secret.version}\t${secret.updatedAt}\n`);
    }
    return 0;
  }

  if (command === "pull") {
    if (parsed.positionals.length > 0) {
      throw new Error(
        "outray secrets pull does not accept positional arguments.",
      );
    }
    requireProductionConfirmation(target, parsed);
    const format = stringOption(parsed, "format") ?? "env";
    if (format !== "env" && format !== "json") {
      throw new Error("--format must be env or json.");
    }
    const confirmProduction = booleanOption(parsed, "confirm-production");
    const result = await api.list(target, {
      values: true,
      confirmProduction,
    });
    const values = mapSecrets(result.secrets);
    const output =
      format === "env" ? exportEnvText(values) : secretsToJson(values);
    const outputPath = stringOption(parsed, "out");
    if (outputPath) {
      writePrivateFileExclusiveAtomic(
        path.resolve(context.cwd ?? process.cwd(), outputPath),
        output,
        { force: booleanOption(parsed, "force") },
      );
      stdout.write(
        `Wrote ${result.secrets.length} secrets to ${outputPath}.\n`,
      );
    } else {
      stdout.write(output);
    }
    return 0;
  }

  if (command === "set") {
    if (parsed.positionals.length !== 1) {
      throw new Error(
        "Usage: outray secrets set <KEY> [--value-stdin]. Values are not accepted on argv.",
      );
    }
    requireProductionConfirmation(target, parsed);
    const key = normalizeSecretKey(parsed.positionals[0]);
    const confirmProduction = booleanOption(parsed, "confirm-production");
    const snapshot = await mutationSnapshot(api, target, confirmProduction);
    let value: string;
    if (booleanOption(parsed, "value-stdin")) {
      value = stripSingleTrailingLineBreak(await readStream(stdin));
    } else {
      if (!stdin.isTTY) {
        throw new Error(
          "No terminal is available for hidden input; pass --value-stdin.",
        );
      }
      const result = await prompts({
        type: "password",
        name: "value",
        message: `Value for ${key}`,
      });
      if (typeof result.value !== "string")
        throw new Error("Secret entry cancelled.");
      value = result.value;
    }
    const result = await api.put(
      target,
      { [key]: value },
      {
        expectedRevision: snapshot.revision,
        expectedVersions: expectedVersions([key], snapshot.secrets),
        confirmProduction,
      },
    );
    stdout.write(`Created ${result.created}; updated ${result.updated}.\n`);
    return 0;
  }

  if (command === "import") {
    if (parsed.positionals.length > 0) {
      throw new Error(
        "outray secrets import does not accept positional arguments.",
      );
    }
    requireProductionConfirmation(target, parsed);
    const source = stringOption(parsed, "from");
    if (!source) throw new Error("--from <FILE|-> is required.");
    const confirmProduction = booleanOption(parsed, "confirm-production");
    const snapshot = await mutationSnapshot(api, target, confirmProduction);
    const text =
      source === "-"
        ? await readStream(stdin)
        : fs.readFileSync(
            path.resolve(context.cwd ?? process.cwd(), source),
            "utf8",
          );
    const values = parseEnvText(text);
    if (Object.keys(values).length === 0) {
      throw new Error("No secrets found in import source.");
    }
    const result = await api.put(target, values, {
      expectedRevision: snapshot.revision,
      expectedVersions: expectedVersions(Object.keys(values), snapshot.secrets),
      confirmProduction,
    });
    stdout.write(`Created ${result.created}; updated ${result.updated}.\n`);
    return 0;
  }

  if (command === "delete") {
    if (parsed.positionals.length !== 1) {
      throw new Error("Usage: outray secrets delete <KEY> [--yes].");
    }
    requireProductionConfirmation(target, parsed);
    const key = normalizeSecretKey(parsed.positionals[0]);
    const confirmProduction = booleanOption(parsed, "confirm-production");
    const snapshot = await mutationSnapshot(api, target, confirmProduction);
    const secret = currentSecret(snapshot.secrets, key);
    if (
      !booleanOption(parsed, "yes") &&
      !(await confirmDelete(key, target, stdin))
    ) {
      stdout.write("Cancelled.\n");
      return 0;
    }
    await api.delete(target, key, {
      expectedRevision: snapshot.revision,
      expectedVersion: secret.version,
      confirmProduction,
    });
    stdout.write(`Deleted ${key}.\n`);
    return 0;
  }

  if (command === "rollback") {
    if (parsed.positionals.length !== 1) {
      throw new Error(
        "Usage: outray secrets rollback <KEY> --version <N> [--yes].",
      );
    }
    requireProductionConfirmation(target, parsed);
    const key = normalizeSecretKey(parsed.positionals[0]);
    const rawVersion = stringOption(parsed, "version");
    const version = rawVersion === undefined ? NaN : Number(rawVersion);
    if (!Number.isSafeInteger(version) || version < 1) {
      throw new Error("--version must be a positive integer.");
    }
    const confirmProduction = booleanOption(parsed, "confirm-production");
    const snapshot = await mutationSnapshot(api, target, confirmProduction);
    const secret = currentSecret(snapshot.secrets, key);
    if (
      !booleanOption(parsed, "yes") &&
      !(await confirmRollback(key, version, target, stdin))
    ) {
      stdout.write("Cancelled.\n");
      return 0;
    }
    const result = await api.rollback(target, secret.id, version, {
      expectedRevision: snapshot.revision,
      expectedVersion: secret.version,
      confirmProduction,
    });
    stdout.write(
      result.unchanged
        ? `${key} is already at the requested value.\n`
        : `Rolled back ${key} to version ${version}.\n`,
    );
    return 0;
  }

  if (parsed.positionals.length > 0 || parsed.passthrough.length === 0) {
    throw new Error("Usage: outray secrets run [--watch] -- <COMMAND...>.");
  }
  requireProductionConfirmation(target, parsed);
  if (booleanOption(parsed, "watch")) {
    const interval = stringOption(parsed, "watch-interval");
    const intervalSeconds = interval === undefined ? 5 : Number(interval);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds < 1) {
      throw new Error("--watch-interval must be at least 1 second.");
    }
    return runWithSecretsWatch({
      api,
      target,
      command: parsed.passthrough,
      baseEnvironment: context.env ?? process.env,
      pollIntervalMs: intervalSeconds * 1_000,
      stderr: context.stderr,
      confirmProduction: booleanOption(parsed, "confirm-production"),
    });
  }
  return runWithSecretsOnce({
    api,
    target,
    command: parsed.passthrough,
    baseEnvironment: context.env ?? process.env,
    confirmProduction: booleanOption(parsed, "confirm-production"),
  });
}
