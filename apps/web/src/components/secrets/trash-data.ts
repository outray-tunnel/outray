import type { SecretTrashItem } from "@/lib/secrets-client";

export type TrashView = "all" | "secrets" | "environments" | "vaults";

function metadataString(item: SecretTrashItem, key: string): string | null {
  const value = item.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataCount(item: SecretTrashItem, key: string): number | null {
  const value = item.metadata?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function count(value: number, label: string): string {
  return `${value.toLocaleString()} ${label}${value === 1 ? "" : "s"}`;
}

export function trashKind(item: SecretTrashItem): string {
  if (item.type === "project") return "Vault";
  if (item.type === "environment") return "Environment";
  if (item.type === "secret") return "Secret";
  return item.metadata?.reason === "move" ? "Moved secrets" : "Secret batch";
}

export function trashLocation(item: SecretTrashItem): string | null {
  const project = metadataString(item, "projectSlug") ?? (item.type === "project" ? metadataString(item, "slug") : null);
  const environment = metadataString(item, "environmentSlug");
  return [project, environment].filter(Boolean).join(" / ") || null;
}

export function trashCountLabel(item: SecretTrashItem): string {
  if (item.type === "secret" || item.type === "bulk") return count(item.itemCount, "secret");
  const secrets = metadataCount(item, "secrets");
  const environments = item.type === "project" ? metadataCount(item, "environments") : null;
  const labels = [environments === null ? null : count(environments, "environment"), secrets === null ? null : count(secrets, "secret")];
  return labels.filter(Boolean).join(" · ") || count(item.itemCount, "item");
}

export function trashRestoreDescription(item: SecretTrashItem): string {
  if (item.type === "bulk" && item.metadata?.reason === "move") {
    return "Restores original source values. Destination values stay unchanged.";
  }
  if (item.type === "project") return "Restores this vault and the environments and secrets deleted with it.";
  if (item.type === "environment") return "Restores this environment and the secrets deleted with it.";
  return "Restores secrets to their original environment.";
}

export function canConfirmTrashRestore(item: SecretTrashItem, confirmation: string, productionConfirmed: boolean, loading: boolean): boolean {
  return !loading && confirmation === item.name && (!item.isProduction || productionConfirmed);
}

export function filterTrash(items: SecretTrashItem[], search: string, view: TrashView): SecretTrashItem[] {
  const query = search.trim().toLowerCase();
  return items.filter((item) => {
    const matchesView = view === "all" || (view === "vaults" ? item.type === "project" : view === "environments" ? item.type === "environment" : item.type === "secret" || item.type === "bulk");
    return matchesView && (!query || [item.name, trashKind(item), trashLocation(item)].filter(Boolean).join(" ").toLowerCase().includes(query));
  });
}
