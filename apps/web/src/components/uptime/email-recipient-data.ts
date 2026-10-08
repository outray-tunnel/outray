export const UPTIME_RECIPIENT_PAGE_SIZE = 20;
export const UPTIME_RECIPIENT_LIMIT = 25;

export interface UptimeRecipientMember {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface UptimeRecipientPage {
  members: UptimeRecipientMember[];
  currentUserId: string;
  nextCursor: string | null;
}

export function uptimeRecipientPath(query: string, cursor: string | null): string {
  const parameters = new URLSearchParams({ limit: String(UPTIME_RECIPIENT_PAGE_SIZE), q: query });
  if (cursor) parameters.set("cursor", cursor);
  return `/members?${parameters.toString()}`;
}

/** Page/search changes never replace the selected recipients from other pages. */
export function toggleUptimeRecipient(selected: string[], email: string, checked: boolean): string[] {
  if (!checked) return selected.filter((recipient) => recipient !== email);
  if (selected.includes(email) || selected.length >= UPTIME_RECIPIENT_LIMIT) return selected;
  return [...selected, email];
}
