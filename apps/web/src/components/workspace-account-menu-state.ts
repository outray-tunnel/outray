export interface WorkspaceAccountUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export function workspaceAccountIdentity(user?: WorkspaceAccountUser | null) {
  const name = user?.name?.trim().replace(/\s+/g, " ") || "";
  const email = user?.email?.trim() || "";
  const image = user?.image?.trim() || "";
  const parts = name.split(" ").filter(Boolean);
  const firstInitial = Array.from(parts[0] || email)[0] || "A";
  const lastInitial =
    parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : "";

  return {
    name: name || email || "Account",
    email,
    image,
    initials: `${firstInitial}${lastInitial}`.toUpperCase(),
  };
}

export function accountMenuFocusIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (itemCount < 1) return null;
  const index =
    currentIndex >= 0 && currentIndex < itemCount ? currentIndex : -1;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  if (key === "ArrowDown") return (index + 1) % itemCount;
  if (key === "ArrowUp") {
    return index <= 0 ? itemCount - 1 : index - 1;
  }
  return null;
}
