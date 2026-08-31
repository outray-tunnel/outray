import fs from "fs";
import path from "path";
import TOML from "@iarna/toml";

export interface SecretsFileConfig {
  org?: string;
  vault?: string;
  /** @deprecated Use vault. Retained for existing config files. */
  project?: string;
  environment?: string;
}

export interface LocatedSecretsConfig {
  path: string;
  exists: boolean;
  secrets: SecretsFileConfig;
  globalOrg?: string;
}

export interface SecretsTarget {
  organization: string;
  project: string;
  environment: string;
}

export interface SecretsTargetInput {
  org?: string;
  vault?: string;
  /** @deprecated Use vault. Retained for existing CLI integrations. */
  project?: string;
  environment?: string;
  activeOrganization?: string | null;
  config?: LocatedSecretsConfig | null;
  env?: NodeJS.ProcessEnv;
}

export type PartialSecretsTarget = Partial<SecretsTarget>;

const SECRETS_KEYS = new Set(["org", "vault", "project", "environment"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(
  object: Record<string, unknown>,
  key: keyof SecretsFileConfig,
  source: string,
): string | undefined {
  const value = object[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error(`[secrets].${key} must be a string in ${source}.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`[secrets].${key} cannot be empty in ${source}.`);
  }
  return normalized;
}

export function parseSecretsConfig(
  text: string,
  source = "outray/config.toml",
): { secrets: SecretsFileConfig; globalOrg?: string } {
  let parsed: unknown;
  try {
    parsed = TOML.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse ${source}: ${error instanceof Error ? error.message : "Invalid TOML"}`,
    );
  }

  if (!isObject(parsed)) throw new Error(`Invalid TOML document: ${source}.`);
  const rawSecrets = parsed.secrets;
  if (rawSecrets !== undefined && !isObject(rawSecrets)) {
    throw new Error(`[secrets] must be a TOML table in ${source}.`);
  }

  const secretsObject = rawSecrets ?? {};
  for (const key of Object.keys(secretsObject)) {
    if (!SECRETS_KEYS.has(key)) {
      throw new Error(`Unknown [secrets] option "${key}" in ${source}.`);
    }
  }

  const rawGlobal = isObject(parsed.global) ? parsed.global : {};
  const globalOrg = optionalString(rawGlobal, "org", source);
  return {
    secrets: {
      org: optionalString(secretsObject, "org", source),
      vault: optionalString(secretsObject, "vault", source),
      project: optionalString(secretsObject, "project", source),
      environment: optionalString(secretsObject, "environment", source),
    },
    globalOrg,
  };
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function findNearestSecretsConfig(
  cwd = process.cwd(),
  explicitPath?: string,
  allowMissingExplicit = false,
): LocatedSecretsConfig | null {
  if (explicitPath) {
    const resolved = path.resolve(cwd, explicitPath);
    if (!fileExists(resolved)) {
      if (allowMissingExplicit) return null;
      throw new Error(`Config file not found: ${resolved}`);
    }
    const parsed = parseSecretsConfig(fs.readFileSync(resolved, "utf8"), resolved);
    return { path: resolved, exists: true, ...parsed };
  }

  let current = path.resolve(cwd);
  while (true) {
    const candidate = path.join(current, "outray", "config.toml");
    if (fileExists(candidate)) {
      const parsed = parseSecretsConfig(
        fs.readFileSync(candidate, "utf8"),
        candidate,
      );
      return { path: candidate, exists: true, ...parsed };
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function renderSecretsSection(config: SecretsFileConfig): string {
  const lines = ["[secrets]"];
  if (config.org) lines.push(`org = ${tomlString(config.org)}`);
  const vault = config.vault ?? config.project;
  if (vault) lines.push(`vault = ${tomlString(vault)}`);
  if (config.environment) {
    lines.push(`environment = ${tomlString(config.environment)}`);
  }
  return `${lines.join("\n")}\n`;
}

function replaceSecretsSection(text: string, replacement: string): string {
  const lines = text.split(/(?<=\n)/);
  const start = lines.findIndex((line) => /^\s*\[secrets\]\s*(?:#.*)?(?:\r?\n)?$/.test(line));
  if (start === -1) {
    const separator = text.length === 0 || text.endsWith("\n\n")
      ? ""
      : text.endsWith("\n")
        ? "\n"
        : "\n\n";
    return `${text}${separator}${replacement}`;
  }

  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  return `${lines.slice(0, start).join("")}${replacement}${lines
    .slice(end)
    .join("")}`;
}

export function saveNearestSecretsConfig(
  patch: SecretsFileConfig,
  options: { cwd?: string; explicitPath?: string } = {},
): LocatedSecretsConfig {
  const cwd = options.cwd ?? process.cwd();
  const explicitTarget = options.explicitPath
    ? path.resolve(cwd, options.explicitPath)
    : undefined;
  const located = explicitTarget && !fileExists(explicitTarget)
    ? null
    : findNearestSecretsConfig(cwd, options.explicitPath);
  const targetPath =
    explicitTarget ??
    located?.path ??
    path.join(path.resolve(cwd), "outray", "config.toml");
  const previous = located?.secrets ?? {};
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as SecretsFileConfig;
  const next: SecretsFileConfig = {
    ...previous,
    ...definedPatch,
    vault:
      definedPatch.vault ??
      definedPatch.project ??
      previous.vault ??
      previous.project,
    project: undefined,
  };

  if (!next.vault || !next.environment) {
    throw new Error(
      "Secrets config requires both vault and environment. Pass --vault and --env.",
    );
  }

  const original = located ? fs.readFileSync(targetPath, "utf8") : "";
  const updated = replaceSecretsSection(original, renderSecretsSection(next));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, updated, "utf8");
  const parsed = parseSecretsConfig(updated, targetPath);
  return { path: targetPath, exists: true, ...parsed };
}

function first(...values: Array<string | null | undefined>): string | undefined {
  return values.map((value) => value?.trim()).find(Boolean);
}

export function resolveSecretsTargetPartial(
  input: SecretsTargetInput,
): PartialSecretsTarget {
  const env = input.env ?? process.env;
  const organization = first(
    input.org,
    env.OUTRAY_ORG,
    input.config?.secrets.org,
    input.config?.globalOrg,
    input.activeOrganization,
  );
  const project = first(
    input.vault,
    input.project,
    env.OUTRAY_SECRETS_VAULT,
    env.OUTRAY_SECRETS_PROJECT,
    input.config?.secrets.vault,
    input.config?.secrets.project,
  );
  const environment = first(
    input.environment,
    env.OUTRAY_SECRETS_ENVIRONMENT,
    input.config?.secrets.environment,
  );

  return { organization, project, environment };
}

export function resolveSecretsTarget(input: SecretsTargetInput): SecretsTarget {
  const { organization, project, environment } =
    resolveSecretsTargetPartial(input);

  if (!organization) {
    throw new Error(
      "Secrets organization is required. Pass --org, set OUTRAY_ORG, configure [secrets].org, or run outray login.",
    );
  }
  if (!project) {
    throw new Error(
      "Secrets vault is required. Pass --vault, set OUTRAY_SECRETS_VAULT, or run outray secrets use.",
    );
  }
  if (!environment) {
    throw new Error(
      "Secrets environment is required. Pass --env, set OUTRAY_SECRETS_ENVIRONMENT, or run outray secrets use.",
    );
  }

  return { organization, project, environment };
}

export function isProductionEnvironment(environment: string): boolean {
  const normalized = environment.trim().toLowerCase();
  return normalized === "prod" || normalized === "production";
}
