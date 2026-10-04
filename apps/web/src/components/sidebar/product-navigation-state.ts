import {
  mobileProductForPath,
  mobileProducts,
  type MobileProduct,
} from "../mobile-navigation";

export type ProductOpenState = Record<MobileProduct["key"], boolean>;

export function normalizeProductNavigationPath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

export function filterSidebarProducts(
  searchQuery: string,
  canManageShares: boolean,
): MobileProduct[] {
  const query = searchQuery.trim().toLowerCase();

  return mobileProducts.flatMap((product) => {
    const permittedPages = product.pages.filter(
      (page) => canManageShares || page.to !== "/$orgSlug/secrets/shares",
    );
    const productMatches = product.label.toLowerCase().includes(query);
    const pages = productMatches
      ? permittedPages
      : permittedPages.filter((page) =>
          [page.label, page.shortLabel, `${product.label} ${page.label}`].some(
            (label) => label?.toLowerCase().includes(query),
          ),
        );

    return pages.length > 0 ? [{ ...product, pages }] : [];
  });
}

export function initialProductOpenState(
  pathname: string,
  orgSlug: string,
  saved?: unknown,
): ProductOpenState {
  const choices: ProductOpenState = {
    tunnels: false,
    observability: false,
    secrets: false,
    uptime: false,
  };

  if (typeof saved === "object" && saved !== null && !Array.isArray(saved)) {
    for (const { key } of mobileProducts) {
      if (Object.hasOwn(saved, key)) {
        const value = (saved as Record<string, unknown>)[key];
        if (typeof value === "boolean") choices[key] = value;
      }
    }
  }

  return openProductForPath(choices, pathname, orgSlug);
}

export function openProductForPath(
  choices: ProductOpenState,
  pathname: string,
  orgSlug: string,
): ProductOpenState {
  const product = mobileProductForPath(
    normalizeProductNavigationPath(pathname),
    orgSlug,
  );
  return product && !choices[product.key]
    ? { ...choices, [product.key]: true }
    : choices;
}

export function toggleProductOpen(
  choices: ProductOpenState,
  key: MobileProduct["key"],
): ProductOpenState {
  return { ...choices, [key]: !choices[key] };
}
