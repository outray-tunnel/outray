import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MembersContent, type MembersContentProps } from "../src/components/workspace/members-content";
import { activeWorkspaceInvitations, canManageWorkspaceMember, filterWorkspaceInvitations, filterWorkspaceMembers, workspaceInviteValidation, type WorkspaceInvitation, type WorkspaceMember } from "../src/components/workspace/members-data";

Object.assign(globalThis, { React });

const members: WorkspaceMember[] = [
  { id: "owner", userId: "you", role: "owner", user: { name: "Ada Owner", email: "ada@example.com" } },
  { id: "admin", userId: "another", role: "admin", user: { name: "Tunde Admin", email: "tunde@example.com" } },
  { id: "member", userId: "third", role: "member", user: { name: "Zara Member", email: "zara@example.com", image: "https://example.com/avatar.png" } },
];
const invitations: WorkspaceInvitation[] = [
  { id: "invite", email: "pending@example.com", role: "member", status: "pending", expiresAt: "2026-10-15T12:00:00Z" },
];
const props: MembersContentProps = {
  members, invitations, currentUserId: "you", canInvite: true, canUpdate: true, canDelete: true, canCancelInvitation: true,
  tab: "members", search: "", seatLimit: 5, onTabChange() {}, onSearchChange() {}, onInvite() {}, onChangeRole() {}, onRemove() {}, onCancelInvitation() {}, onRetry() {},
};
const render = (overrides: Partial<MembersContentProps> = {}) => renderToStaticMarkup(React.createElement(MembersContent, { ...props, ...overrides }));

test("members have a compact workspace header, accessible counts, avatars and roles", () => {
  const html = render();
  assert.match(html, /outray-arc mx-auto w-full max-w-\[1440px\] space-y-5/);
  assert.match(html, /<h1[^>]*text-(?:\[20px\]|xl)[^>]*font-normal[^>]*>Members<\/h1>/);
  assert.match(html, /The people with access to your workspace/);
  assert.match(html, /role="tablist"[^>]*aria-label="Workspace team"/);
  assert.match(html, /Pending invitations/);
  assert.match(html, /4 of 5 seats used/);
  assert.match(html, /aria-label="Workspace members"/);
  assert.match(html, />Ada Owner<\/p>/);
  assert.match(html, /ada@example.com/);
  assert.match(html, />You<\/span>/);
  assert.match(html, /Role: <\/span>owner/);
  assert.match(html, /loading="lazy"[^>]*referrerPolicy="no-referrer"/);
  assert.match(html, /Showing 3 of 3 members/);
  assert.doesNotMatch(html, /aria-label="Pending workspace invitations"/);
});

test("invitations are a separate labeled tab with expiry and scoped menu triggers", () => {
  const html = render({ tab: "invitations" });
  assert.match(html, /aria-label="Pending workspace invitations"/);
  assert.match(html, /pending@example.com/);
  assert.match(html, /Pending · Expires <time dateTime="2026-10-15T12:00:00.000Z"/);
  assert.match(html, /aria-label="Actions for invitation to pending@example.com"/);
  assert.match(html, /Showing 1 of 1 invitations/);
  assert.doesNotMatch(html, /aria-label="Workspace members"/);
});

test("owners including the last owner remain protected and permission-only actions stay absent", () => {
  assert.equal(canManageWorkspaceMember(members[0], true), false);
  assert.equal(canManageWorkspaceMember(members[1], false), false);
  assert.equal(canManageWorkspaceMember(members[1], true), true);
  const allowed = render();
  assert.doesNotMatch(allowed, /aria-label="Actions for Ada Owner"/);
  assert.match(allowed, /aria-label="Actions for Tunde Admin"/);
  assert.match(allowed, /aria-label="Actions for Zara Member"/);
  const readOnly = render({ canInvite: false, canUpdate: false, canDelete: false });
  assert.doesNotMatch(readOnly, /Invite member|aria-label="Actions for /);
  assert.doesNotMatch(render({ tab: "invitations", canCancelInvitation: false }), /aria-label="Actions for invitation/);
  assert.match(render({ canUpdate: false, canDelete: true }), /aria-label="Actions for Tunde Admin"/);
  assert.match(render({ canUpdate: true, canDelete: false }), /aria-label="Actions for Tunde Admin"/);
});

test("invite launchers are medium-sized and block duplicate actions while pending", () => {
  const html = render();
  const launch = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([button]) => button.includes("Invite member"))?.[0] || "";
  assert.match(launch, /class="button primary md(?:\s|")/);
  assert.match(launch, /aria-haspopup="dialog"/);
  const busyLaunch = [...render({ busy: true }).matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].find(([button]) => button.includes("Invite member"))?.[0] || "";
  assert.match(busyLaunch, /disabled=""/);
});

test("initial loading uses truthful skeletons and never invented zero seat counts", () => {
  const html = render({ members: undefined, invitations: undefined, loading: true });
  assert.match(html, /aria-label="Loading members" aria-busy="true"/);
  assert.match(html, /motion-reduce:animate-none/);
  assert.doesNotMatch(html, /0 of 5 seats used|No members yet|No pending invitations|Could not load members/);
});

test("first-load failure, empty members, empty invitations and search misses have distinct recovery", () => {
  const failed = render({ members: undefined, invitations: undefined, loading: false, error: "Temporary outage" });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Could not load members/);
  assert.match(failed, /Temporary outage/);
  assert.match(failed, /Try again/);
  assert.doesNotMatch(failed, /No members yet|No matches found/);
  const empty = render({ members: [], invitations: [] });
  assert.match(empty, /No members yet/);
  assert.match(empty, /Invite someone to collaborate/);
  assert.doesNotMatch(empty, /Could not load members|No matches found/);
  const emptyInvites = render({ invitations: [], tab: "invitations" });
  assert.match(emptyInvites, /No pending invitations/);
  assert.match(emptyInvites, /until they join or their invitation expires/);
  const missed = render({ search: "unmatched-person" });
  assert.match(missed, /No matches found/);
  assert.match(missed, /Clear search/);
  assert.doesNotMatch(missed, /aria-label="Actions for Tunde Admin"|No members yet/);
});

test("background fetch failures keep the last available list and expose retry", () => {
  const html = render({ error: "Refresh failed", isFetching: true, search: "tunde" });
  assert.match(html, /Could not refresh members\. Showing the last available data\./);
  assert.match(html, /Retry/);
  assert.match(html, />Updating<\/span>/);
  assert.match(html, />Tunde Admin<\/p>/);
  assert.doesNotMatch(html, /Loading members|Could not load members|>Ada Owner<\/p>/);
});

test("search preserves raw field text and filters the complete list by name, email or role", () => {
  assert.deepEqual(filterWorkspaceMembers(members, "  TUNDE  ").map((member) => member.id), ["admin"]);
  assert.deepEqual(filterWorkspaceMembers(members, "zara@example.com").map((member) => member.id), ["member"]);
  assert.deepEqual(filterWorkspaceMembers(members, "owner").map((member) => member.id), ["owner"]);
  assert.deepEqual(filterWorkspaceMembers(members, "   "), members);
  assert.deepEqual(filterWorkspaceInvitations(invitations, " PENDING@EXAMPLE ").map((invitation) => invitation.id), ["invite"]);
  const html = render({ search: "  Tunde  " });
  assert.match(html, /type="search"[^>]*value=" {2}Tunde {2}"/);
  assert.match(html, /<label for="[^"]+">Search members<\/label>/);
  assert.match(html, /Showing 1 of 3 members/);
});

test("seat notices count active members plus pending invitations and unlimited plans stay usable", () => {
  const full = render({ seatLimit: 4, limitAction: React.createElement("a", { href: "/acme/billing" }, "View plans") });
  assert.match(full, /All 4 member seats are in use, including pending invitations/);
  assert.match(full, /View plans/);
  assert.match(full, /4 of 4 seats used/);
  const unlimited = render({ unlimitedSeats: true, seatLimit: -1 });
  assert.match(unlimited, /4 seats used · unlimited/);
  assert.doesNotMatch(unlimited, /All -1 member seats|of -1 seats used/);
});

test("invitation validation blocks normalized duplicates and counts invitations against limits", () => {
  const validate = (email: string, extra: Partial<Parameters<typeof workspaceInviteValidation>[0]> = {}) => workspaceInviteValidation({ email, members, invitations, memberLimit: 5, unlimited: false, ...extra });
  assert.equal(validate("  ADA@EXAMPLE.COM  "), "This person is already a workspace member.");
  assert.equal(validate("PENDING@example.com"), "An invitation is already pending for this email address.");
  assert.equal(validate("bad email"), "Enter a valid email address.");
  assert.match(validate("new@example.com", { memberLimit: 4 }) || "", /All member seats are in use/);
  assert.equal(validate("new@example.com"), null);
  assert.equal(validate("new@example.com", { memberLimit: -1, unlimited: true }), null);
});

test("only unexpired pending invitations reserve seats", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const data = [invitations[0], { ...invitations[0], id: "expired", expiresAt: new Date(now) }, { ...invitations[0], id: "accepted", status: "accepted" }, { ...invitations[0], id: "invalid", expiresAt: "not-a-date" }];
  assert.deepEqual(activeWorkspaceInvitations(data, now).map((invitation) => invitation.id), ["invite"]);
});

test("mobile rows retain role and action columns while long member identities truncate", () => {
  const html = render({ members: [{ ...members[1], user: { name: "A".repeat(200), email: `${"b".repeat(200)}@example.com` } }] });
  assert.match(html, /grid-cols-\[minmax\(0,1fr\)_auto_32px\]/);
  assert.match(html, /sm:grid-cols-\[minmax\(0,1fr\)_120px_32px\]/);
  assert.match(html, /class="truncate text-\[13px\]/);
  assert.match(html, /class="mt-0.5 truncate text-\[11px\]/);
  assert.match(html, /Role: <\/span>admin/);
});

test("dialog and menu wiring reuse accessible shells, custom controls and small footer actions", async () => {
  const [invite, change, content, menu] = await Promise.all([
    "../src/components/invite-member-modal.tsx", "../src/components/change-role-modal.tsx", "../src/components/workspace/members-content.tsx", "../src/components/secrets/secrets-ui.tsx",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of [invite, change]) {
    assert.match(source, /WorkspaceDialog/);
    assert.match(source, /WorkspaceNotice message=\{error\}/);
    assert.match(source, /arc\/select\/select/);
    assert.match(source, /onValueChange=/);
    assert.match(source, /size="sm" form=\{formId\}/);
    assert.doesNotMatch(source, /<select\b|fixed inset-0|autoFocus|from "\.\/ui"/);
  }
  assert.match(invite, /WorkspaceInput/);
  assert.match(content, /ActionMenu compact/);
  assert.match(menu, /aria-haspopup": "menu"/);
  assert.match(menu, /event.key === "Escape"/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
  assert.match(menu, /closeMenu\(true\);\s*item.onSelect\(\)/);
});

test("mutations keep failures in action dialogs, roll back removals and invalidate original organization keys", async () => {
  const route = await readFile(new URL("../src/routes/$orgSlug/members.tsx", import.meta.url), "utf8");
  assert.match(route, /onError: \(error: Error\) => setInviteError\(error.message\)/);
  assert.match(route, /onError: \(error: Error\) => setRoleError\(error.message\)/);
  assert.match(route, /previousMembers !== undefined\) queryClient.setQueryData\(context.queryKey, context.previousMembers\)/);
  assert.match(route, /previousInvitations !== undefined\) queryClient.setQueryData\(context.queryKey, context.previousInvitations\)/);
  assert.equal((route.match(/setConfirmationError\(error.message\)/g) || []).length, 2);
  assert.equal((route.match(/onSuccess: \(\) => setConfirmation\(null\)/g) || []).length, 2);
  assert.match(route, /membersKey\(variables.organizationId\)/);
  assert.match(route, /invitationsKey\(variables.organizationId\)/);
  assert.match(route, /pendingAction.current = true/);
  assert.match(route, /canManageWorkspaceMember\(member, canDelete\)/);
  assert.match(route, /workspaceInviteValidation/);
  assert.match(route, /MembersWorkspace key=\{orgSlug\} orgSlug=\{orgSlug\}/);
  assert.match(route, /You no longer have permission to invite workspace members/);
  assert.match(route, /Workspace owners cannot be removed/);
  assert.doesNotMatch(route, /AlertModal|ConfirmModal|activeDropdownId/);
});
