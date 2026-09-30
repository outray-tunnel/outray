# Uptime Incidents Refresh

## Summary

Refresh internal Uptime incident management around a compact list, dedicated detail pages, a creation modal, and a separate Notifications page. Keep Geom, the existing dark design language, small typography, quiet surfaces, and restrained accents. Public status-page design and notification rules remain unchanged.

## Incident list

- Keep `/:orgSlug/uptime/incidents`, titled **Incidents**, with a short description and **Create incident** action.
- Use clickable rows showing title, status, affected components, source, start time, and duration.
- Provide **All**, **Active**, **Resolved**, and **Drafts** filters, defaulting to All. Drafts are manual incidents with no published update; Active excludes them.
- Add title search and Automatic/Manual source filters, stored in URL search parameters. Restore list state and scroll position on return.
- Load 25 records at a time with **Load more**; search and filters cover complete history.
- Remove inline creation, expanded update threads, and channel settings from the list.

## Incident detail

- Add `/:orgSlug/uptime/incidents/:incidentId`, with a back link, title, lifecycle badge, and public-report link where available.
- Show affected components, source, start time, and duration in a compact metadata strip.
- Make the timeline primary. Order published updates by publication time, newest first, and separate drafts.
- Show automatic detection/recovery events from monitor records and link to the originating monitor where available.
- Open manual incidents support an on-demand update composer, draft editing, saving, and publication. Preserve edits during refresh.
- Resolved incidents are read-only. Put recent delivery attempts in a collapsed secondary section.

## Create incident

- Use a compact modal for title, searchable affected components, status, and first update. Include standalone components and group headings.
- Default to Investigating; reset after success and open the created incident detail.
- Provide **Save draft** and **Publish incident**, clearly explaining public changes and queued subscriber email.
- Preserve values after failure, place field errors beside their fields, and warn before discarding unsaved content.

## Uptime Notifications

- Add `/:orgSlug/uptime/notifications` after Incidents in navigation.
- Move Slack/Discord connections here, with provider logos, connection/channel information, and connect/settings actions.
- Explain that email recipients are configured per monitor.
- Return OAuth to this page and show connected, cancelled, or failed feedback. Use application confirmation UI when disconnecting.

## Visual and interaction rules

- Page titles: 20px regular; section headings: 14px medium; body: 13–14px; metadata: 12px.
- Use spacing and dividers instead of nested cards, consistent text status badges, and one clear primary action per view.
- Keep hover/focus feedback subtle and respect reduced motion.
- Use matching initial skeletons; preserve content, scroll, and input during background refresh.
- Refresh every 30 seconds while visible and on window focus; pause polling in hidden tabs.
- Distinguish empty history, no results, configuration missing, and request failure.
- Stack metadata on mobile; retain touch targets, modal focus trapping, Escape handling, and focus restoration.

## Interfaces and correctness

- Reuse existing detail, creation, draft editing, and publication endpoints; no migration expected.
- Extend listing with optional search, view, source, cursor, and limit plus `nextCursor`. Preserve existing fields/default behavior for other consumers.
- Order deterministically by start time and ID; debounce search 250ms.
- Add explicit response types and server-provided management capability; editing is limited to owners/admins.
- Include standalone components and stored snapshot name fallbacks.
- Distinguish incident lifecycle from update status; drafts never change public state.
- Enforce resolved incidents as read-only in both update mutation routes, including concurrent requests.
- Show mutation failures beside actions. Publication feedback means published and delivery queued, not delivered.
- Update OAuth return location without changing credentials or connections.

## Verification

- Verify list filtering/pagination, direct details, and preserved back navigation.
- Cover standalone components, draft creation/edit/publication, publication chronology, and error visibility.
- Confirm drafts do not change public state/send email and resolved incidents reject mutations.
- Verify tenant isolation, roles, recovery refresh, and OAuth return feedback.
- Verify keyboard/modal behavior, reduced motion, mobile layout, and unsaved text preservation.
- Run focused lint, incident/OAuth tests, type checks, and production build; distinguish unrelated existing failures.
- Leave visual review to the user; do not use Computer for routine inspection.

## Implementation and verification record — 2026-09-30

Implemented the incident list, dedicated detail route, creation modal, draft editor, Notifications route/navigation, OAuth return handling, typed responses, server management capability, and filtered cursor pagination. Resolved-incident writes are guarded inside transactions with a consistent organization → incident → update lock order. No database migration or deployment was performed.

- Focused ESLint across the incident UI, shared helpers, changed API routes, notification navigation, OAuth, and tests: passed.
- `OUTRAY_RUN_DB_INTEGRATION=0 npx tsx --tsconfig tsconfig.app.json --test test/uptime-*.test.ts test/observability-alert-validation.test.ts` from `apps/web`: 40 passed, 2 database suites skipped. Covers filtering/cursors, tenant query constraints, manager roles, draft-only writes, resolved/immutable mutation guards, standalone/snapshot labels, publication chronology, and OAuth outcomes.
- `npm run build --workspace=outray-web`: passed. Existing Recharts circular-chunk and bundle-size warnings remain.
- `npx tsc -p tsconfig.app.json --noEmit` from `apps/web`: blocked by existing errors outside this refresh, listed below. No diagnostics in the new incident/notification files or changed API helpers.
- `git diff --check`: passed.
- Browser/Computer visual inspection was intentionally not performed. Manual keyboard, mobile, focus-restoration, and live OAuth checks remain for user review. Focus management, native modal trapping, unsaved guards, visible-only polling, scroll-restoration wiring, and responsive layout were reviewed in source.
- Database integration tests require an explicitly configured migrated disposable `OUTRAY_TEST_DATABASE_URL` and `OUTRAY_RUN_DB_INTEGRATION=1`. They never fall back to the application's normal database. Actual concurrent PostgreSQL writes and end-to-end subscriber delivery were not exercised in this run.

### Existing typecheck failures, outside this refresh

- Unused imports/variables in invitation/report-bug/landing components, subdomain/admin API routes, and invitation acceptance.
- Nullable Observability metric values/data and a service-detail link missing required search parameters.
- Dashboard overview chart data shape, Secrets audit button `variant`, and tunnel/subdomain limit comparisons.
- Existing Uptime overview, monitor-detail, and status-page skeletons instantiate `UptimePanel` without its required `children` prop.
- Admin organization page and docs route generic/loader types.
