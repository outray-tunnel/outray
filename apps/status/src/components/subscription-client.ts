/** The response deliberately never reveals whether an address is subscribed. */
export async function submitSubscription(pageId: string, email: string, signal?: AbortSignal): Promise<void> {
  const body = new FormData();
  body.set("pageId", pageId);
  body.set("email", email);
  const response = await fetch("/api/subscribe", {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    body,
    signal,
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || result?.ok !== true) {
    throw new Error(result?.error || "We couldn’t request updates. Please try again.");
  }
}
