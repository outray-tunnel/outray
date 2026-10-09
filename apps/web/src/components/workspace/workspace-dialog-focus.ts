/** Restore the opener, or the page heading if a completed action removed its row. */
export function workspaceFocusTarget(opener: HTMLElement | null, scope: HTMLElement | null): HTMLElement | null {
  if (opener?.isConnected && !["BODY", "HTML"].includes(opener.tagName) && !opener.matches(':disabled, [aria-disabled="true"]')) return opener;
  if (!scope?.isConnected) return null;
  return scope.querySelector<HTMLElement>("[data-workspace-focus-return]");
}
