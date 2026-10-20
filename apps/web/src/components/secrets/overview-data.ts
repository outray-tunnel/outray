import type { SecretProject } from "@/lib/secrets-client";

export type SecretsVaultSort = "updated" | "name";
/** Environment revisions also change when values inside a vault change. */
export function vaultUpdatedAt(project: SecretProject): string | null {
  const dates = [project.updatedAt, ...project.environments.map((environment) => environment.updatedAt)]
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return dates[0] ?? null;
}

export function filterOverviewVaults(projects: SecretProject[], search: string, sort: SecretsVaultSort): SecretProject[] {
  const needle = search.trim().toLowerCase();
  return projects.filter((project) => !needle || [project.name, project.slug, project.description,
    ...project.environments.flatMap((environment) => [environment.name, environment.slug])]
    .filter(Boolean).join(" ").toLowerCase().includes(needle))
    .slice().sort((left, right) => {
      if (sort === "updated") {
        const rightTime = Date.parse(vaultUpdatedAt(right) ?? "") || 0;
        const leftTime = Date.parse(vaultUpdatedAt(left) ?? "") || 0;
        if (rightTime !== leftTime) return rightTime - leftTime;
      }
      return left.name.localeCompare(right.name) || left.slug.localeCompare(right.slug) || left.id.localeCompare(right.id);
    });
}
