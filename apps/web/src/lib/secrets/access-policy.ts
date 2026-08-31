import type { SecretsActor, SecretsScope } from "./types";
import { SecretsError } from "./types";

export function hasSecretsScope(
  scopes: readonly string[],
  scope: SecretsScope,
) {
  return (
    scopes.includes("*") ||
    scopes.includes("secrets:*") ||
    scopes.includes("secrets:admin") ||
    scopes.includes(scope) ||
    (scope === "secrets:reveal" && scopes.includes("secrets:read"))
  );
}

export function hasSecretsMetadataScope(scopes: readonly string[]) {
  return (["secrets:read", "secrets:write", "secrets:delete"] as const).some(
    (scope) => hasSecretsScope(scopes, scope),
  );
}

export function assertActorScope(
  actor: SecretsActor,
  input: { projectId?: string; environmentId?: string },
) {
  if (actor.type !== "machine") return;
  if (actor.projectId && actor.projectId !== input.projectId) {
    throw new SecretsError("Machine token is not scoped to this vault", {
      code: "FORBIDDEN",
      status: 403,
    });
  }
  if (
    actor.environmentId &&
    input.environmentId !== undefined &&
    actor.environmentId !== input.environmentId
  ) {
    throw new SecretsError("Machine token is not scoped to this environment", {
      code: "FORBIDDEN",
      status: 403,
    });
  }
}
