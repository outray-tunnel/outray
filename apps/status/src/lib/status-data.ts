import { query } from "./db";
import type { IncidentDocument } from "@outray/incident-content";
import { getStatusConfig, STATUS_PAGE_SLUG, statusPageUrl } from "./config";

export type PublicState = "operational" | "degraded" | "outage" | "unknown";

interface PageRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  accent_color: string;
  published: boolean;
}

interface GroupRow {
  id: string;
  name: string;
  sort_order: number;
}

interface ComponentRow {
  id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  sort_order: number;
  manual_state: string;
  manual_updated_at: Date | null;
}

interface MonitorEvidenceRow {
  component_id: string;
  monitor_id: string;
  state: string;
  last_checked_at: Date | null;
  enabled: boolean;
  deleted_at: Date | null;
}

interface DailyCheckRow {
  day: string;
  checks: number;
  successes: number;
  reported_monitors: number;
  max_failed_checks?: number;
}

interface ComponentDailyCheckRow extends DailyCheckRow {
  component_id: string;
}

interface ComponentIncidentRow {
  component_id: string;
  id: string;
  title: string;
  source_type: string;
  started_at: Date;
  resolved_at: Date | null;
}

interface IncidentRow {
  id: string;
  title: string;
  source_type: "uptime_monitor" | "uptime_manual";
  status: string;
  started_at: Date;
  resolved_at: Date | null;
  components: string[] | null;
  latest_note: string | null;
  latest_note_at: Date | null;
}

interface IncidentUpdateRow {
  id: string;
  incident_id: string;
  note: string;
  body_json: IncidentDocument | null;
  status: string;
  published_at: Date;
}

export interface PublicComponent {
  id: string;
  sortOrder: number;
  name: string;
  description: string | null;
  state: PublicState;
  manual: boolean;
  updatedAt: Date | null;
  history: PublicComponentHistoryDay[];
  observedUptime90d: number | null;
}

export interface PublicGroup {
  id: string;
  sortOrder: number;
  name: string;
  state: PublicState;
  components: PublicComponent[];
}

export interface PublicHistoryDay {
  date: string;
  state: PublicState;
  checks: number;
  successes: number;
  detectedFailureMinutes: number;
  reportedMonitors: number;
  expectedMonitors: number;
}

export interface PublicComponentHistoryDay extends PublicHistoryDay {
  incidentMinutes: number;
  incidentKind: "downtime" | "incident" | null;
  incidents: Array<{ id: string; title: string; minutes: number; automatic: boolean }>;
}

export interface PublicIncident {
  id: string;
  title: string;
  sourceType: "uptime_monitor" | "uptime_manual";
  status: "open" | "resolved";
  startedAt: Date;
  resolvedAt: Date | null;
  components: string[];
  latestNote: string | null;
  latestNoteAt: Date | null;
  updates: Array<{ id: string; note: string; body: IncidentDocument | null; status: string; publishedAt: Date }>;
}

export function publishedIncidentStage(incident: PublicIncident): string {
  const latest = [...incident.updates].sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime() || b.id.localeCompare(a.id))[0];
  if (incident.sourceType === "uptime_monitor") return incident.status === "resolved" ? "recovered" : latest?.status ?? "down";
  return latest?.status ?? (incident.status === "resolved" ? "recovered" : "down");
}

export interface PublicStatusPage {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  accentColor: string;
  state: PublicState;
  groups: PublicGroup[];
  standaloneComponents: PublicComponent[];
  incidents: PublicIncident[];
  canonicalUrl: string;
}

const STALE_AFTER_MS = 180_000;
const DAY_MS = 86_400_000;
const HISTORY_DAYS = 90;

export function normalizeRequestHost(request: Request): string | null {
  const header = request.headers.get("host") || new URL(request.url).host;
  try {
    if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(header)) return null;
    const parsed = new URL(`http://${header}`);
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (host.length > 253 || !/^[a-z0-9.-]+$/.test(host) || host.includes("..")) return null;
    return host;
  } catch {
    return null;
  }
}

export function slugFromStatusHost(host: string, canonicalHost: string): string | null {
  const suffix = `.${canonicalHost}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  return STATUS_PAGE_SLUG.test(slug) ? slug : null;
}

export async function findPageForRequest(
  request: Request,
  slug: string | null,
): Promise<PageRow | null> {
  const config = getStatusConfig();
  if (!config.enabled) return null;
  const host = normalizeRequestHost(request);
  if (!host) return null;
  // The hosted OutRay ops page is external to tenant status pages. A
  // self-hosted installation has no hard-coded OutRay domain reservation.
  if (process.env.OUTRAY_DEPLOYMENT_MODE !== "self-hosted" && host === "status.outray.dev" && host !== config.canonicalHost) return null;
  const local = host === "localhost" || host === "127.0.0.1";
  const canonicalSubdomainSlug = slugFromStatusHost(host, config.canonicalHost);
  if (host === config.canonicalHost || canonicalSubdomainSlug ||
      (local && process.env.NODE_ENV !== "production")) {
    const pageSlug = canonicalSubdomainSlug || slug;
    if (canonicalSubdomainSlug && slug) return null;
    if (!pageSlug || !STATUS_PAGE_SLUG.test(pageSlug)) return null;
    const rows = await query<PageRow>(
      `SELECT id, organization_id, slug, name, description, logo_url, accent_color, published
       FROM uptime_status_pages WHERE slug = $1 AND published = true LIMIT 1`,
      [pageSlug],
    );
    return rows[0] || null;
  }
  // A nested or invalid subdomain must never fall through to the custom-domain registry.
  if (host.endsWith(`.${config.canonicalHost}`)) return null;
  if (slug) return null;
  const rows = await query<PageRow>(
    `SELECT p.id, p.organization_id, p.slug, p.name, p.description, p.logo_url,
            p.accent_color, p.published
     FROM uptime_status_pages p
     JOIN domains d ON d.id = p.domain_id
     WHERE d.domain = $1 AND d.purpose = 'status' AND d.status = 'active'
       AND p.published = true
     LIMIT 1`,
    [host],
  );
  return rows[0] || null;
}

export async function findPublishedPageById(pageId: string): Promise<PageRow | null> {
  const rows = await query<PageRow>(
    `SELECT id, organization_id, slug, name, description, logo_url, accent_color, published
     FROM uptime_status_pages WHERE id = $1 AND published = true LIMIT 1`,
    [pageId],
  );
  return rows[0] || null;
}

export async function loadPublicPage(page: PageRow): Promise<PublicStatusPage> {
  const now = Date.now();
  const todayUtc = now - (now % DAY_MS);
  const historyStart = new Date(todayUtc - (HISTORY_DAYS - 1) * DAY_MS);
  const [groups, components, evidence, componentDailyChecks, componentIncidents, incidentRows] = await Promise.all([
    query<GroupRow>(
      `SELECT id, name, sort_order FROM uptime_status_groups
       WHERE page_id = $1 AND organization_id = $2 AND visible = true
       ORDER BY sort_order, id`,
      [page.id, page.organization_id],
    ),
    query<ComponentRow>(
      `SELECT c.id, c.group_id, c.name, c.description, c.sort_order,
              c.manual_state, c.manual_updated_at
       FROM uptime_status_components c
       LEFT JOIN uptime_status_groups g ON g.id = c.group_id
         AND g.page_id = c.page_id AND g.organization_id = c.organization_id
       WHERE c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
         AND (c.group_id IS NULL OR g.visible = true)
       ORDER BY c.sort_order, c.id`,
      [page.id, page.organization_id],
    ),
    query<MonitorEvidenceRow>(
      `SELECT cm.component_id, m.id AS monitor_id, m.state, m.last_checked_at,
              m.enabled, m.deleted_at
       FROM uptime_component_monitors cm
       JOIN uptime_status_components c ON c.id = cm.component_id
       JOIN uptime_monitors m ON m.id = cm.monitor_id
       LEFT JOIN uptime_status_groups g ON g.id = c.group_id
         AND g.page_id = c.page_id AND g.organization_id = c.organization_id
       WHERE c.page_id = $1 AND c.organization_id = $2
         AND c.visible = true AND (c.group_id IS NULL OR g.visible = true)
         AND cm.organization_id = $2 AND m.organization_id = $2`,
      [page.id, page.organization_id],
    ),
    query<ComponentDailyCheckRow>(
      `WITH component_monitors AS (
         SELECT DISTINCT c.id AS component_id, cm.monitor_id
         FROM uptime_status_components c
         LEFT JOIN uptime_status_groups g ON g.id = c.group_id
           AND g.page_id = c.page_id AND g.organization_id = c.organization_id
         JOIN uptime_component_monitors cm ON cm.component_id = c.id
         WHERE c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
           AND (c.group_id IS NULL OR g.visible = true)
           AND cm.organization_id = $2
       )
       SELECT cm.component_id, daily.day::text AS day,
              SUM(daily.checks)::integer AS checks,
              SUM(daily.successes)::integer AS successes,
              MAX(daily.checks - daily.successes)::integer AS max_failed_checks,
              COUNT(*)::integer AS reported_monitors
       FROM component_monitors cm
       JOIN uptime_daily_checks daily ON daily.monitor_id = cm.monitor_id
         AND daily.organization_id = $2
       WHERE daily.day >= $3::date AND daily.day <= (NOW() AT TIME ZONE 'UTC')::date
       GROUP BY cm.component_id, daily.day
       ORDER BY cm.component_id, daily.day`,
      [page.id, page.organization_id, historyStart.toISOString().slice(0, 10)],
    ),
    query<ComponentIncidentRow>(
      `WITH public_incidents AS (
         SELECT i.id, i.organization_id, i.title, i.source_type,
                CASE WHEN i.source_type = 'uptime_manual' THEN
                  (SELECT MIN(u.published_at) FROM uptime_incident_updates u
                   WHERE u.incident_id = i.id AND u.organization_id = $2 AND u.published_at IS NOT NULL)
                ELSE i.started_at END AS started_at,
                i.resolved_at
         FROM incidents i
         WHERE i.organization_id = $2 AND i.source_type IN ('uptime_monitor', 'uptime_manual')
           AND (i.source_type <> 'uptime_monitor' OR i.uptime_publication_state = 'published')
       )
       SELECT DISTINCT c.id AS component_id, i.id, i.title, i.source_type,
              i.started_at, i.resolved_at
       FROM public_incidents i
       JOIN uptime_incident_components ic ON ic.incident_id = i.id AND ic.organization_id = $2
       JOIN uptime_status_components c ON c.id = ic.component_id
         AND c.organization_id = $2 AND c.page_id = $1 AND c.visible = true
       LEFT JOIN uptime_status_groups g ON g.id = c.group_id
         AND g.organization_id = $2 AND g.page_id = $1
       WHERE i.started_at IS NOT NULL AND i.started_at <= NOW()
         AND (c.group_id IS NULL OR g.visible = true)
         AND COALESCE(i.resolved_at, NOW()) >= $3::timestamptz
       ORDER BY c.id, i.started_at DESC`,
      [page.id, page.organization_id, historyStart],
    ),
    query<IncidentRow>(
      `SELECT i.id, i.title, i.source_type, i.status, i.started_at, i.resolved_at,
              COALESCE((SELECT array_agg(DISTINCT c.name ORDER BY c.name)
                        FROM uptime_incident_components ic
                        JOIN uptime_status_components c ON c.id = ic.component_id
                        LEFT JOIN uptime_status_groups g ON g.id = c.group_id
                          AND g.page_id = c.page_id AND g.organization_id = c.organization_id
                        WHERE ic.incident_id = i.id AND c.page_id = $1
                          AND c.organization_id = $2 AND c.visible = true
                          AND (c.group_id IS NULL OR g.visible = true)), ARRAY[]::text[]) AS components,
              (SELECT u.note FROM uptime_incident_updates u
               WHERE u.incident_id = i.id AND u.organization_id = $2
                 AND u.published_at IS NOT NULL
               ORDER BY u.published_at DESC LIMIT 1) AS latest_note,
              (SELECT u.published_at FROM uptime_incident_updates u
               WHERE u.incident_id = i.id AND u.organization_id = $2
                 AND u.published_at IS NOT NULL
               ORDER BY u.published_at DESC LIMIT 1) AS latest_note_at
       FROM incidents i
       WHERE i.organization_id = $2
         AND EXISTS (
           SELECT 1 FROM uptime_incident_components ic
           JOIN uptime_status_components c ON c.id = ic.component_id
           LEFT JOIN uptime_status_groups g ON g.id = c.group_id
             AND g.page_id = c.page_id AND g.organization_id = c.organization_id
           WHERE ic.incident_id = i.id AND ic.organization_id = $2
             AND c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
             AND (c.group_id IS NULL OR g.visible = true)
         )
         AND ((i.source_type = 'uptime_monitor' AND i.uptime_publication_state = 'published') OR
           (i.source_type = 'uptime_manual' AND EXISTS (
             SELECT 1 FROM uptime_incident_updates u
             WHERE u.incident_id = i.id AND u.organization_id = $2
               AND u.published_at IS NOT NULL)))
       ORDER BY CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END, i.started_at DESC LIMIT 25`,
      [page.id, page.organization_id],
    ),
  ]);

  const publishedUpdates = incidentRows.length > 0
    ? await query<IncidentUpdateRow>(
      `SELECT id, incident_id, note, body_json, status, published_at
       FROM uptime_incident_updates
       WHERE organization_id = $1 AND incident_id = ANY($2::text[])
         AND published_at IS NOT NULL
       ORDER BY published_at ASC`,
      [page.organization_id, incidentRows.map((incident) => incident.id)],
    )
    : [];
  const updatesByIncident = new Map<string, PublicIncident["updates"]>();
  for (const update of publishedUpdates) {
    const bucket = updatesByIncident.get(update.incident_id) || [];
    bucket.push({ id: update.id, note: update.note, body: update.body_json, status: update.status, publishedAt: update.published_at });
    updatesByIncident.set(update.incident_id, bucket);
  }

  const evidenceByComponent = new Map<string, MonitorEvidenceRow[]>();
  for (const item of evidence) {
    const bucket = evidenceByComponent.get(item.component_id) || [];
    bucket.push(item);
    evidenceByComponent.set(item.component_id, bucket);
  }
  const dailyByComponent = new Map<string, Map<string, ComponentDailyCheckRow>>();
  for (const daily of componentDailyChecks) {
    const bucket = dailyByComponent.get(daily.component_id) || new Map<string, ComponentDailyCheckRow>();
    bucket.set(daily.day, daily);
    dailyByComponent.set(daily.component_id, bucket);
  }
  const incidentsByComponent = new Map<string, ComponentIncidentRow[]>();
  for (const incident of componentIncidents) {
    const bucket = incidentsByComponent.get(incident.component_id) || [];
    bucket.push(incident);
    incidentsByComponent.set(incident.component_id, bucket);
  }
  const componentsByGroup = new Map<string | null, PublicComponent[]>();
  for (const component of components) {
    const monitors = evidenceByComponent.get(component.id) || [];
    const expectedMonitors = new Set(monitors.map((monitor) => monitor.monitor_id)).size;
    const history = addIncidentsToHistory(
      buildDailyHistory(dailyByComponent.get(component.id) || new Map(), todayUtc, expectedMonitors),
      incidentsByComponent.get(component.id) || [],
      now,
    );
    const completedChecks = history.reduce((sum, day) => sum + day.checks, 0);
    const successfulChecks = history.reduce((sum, day) => sum + day.successes, 0);
    const state = monitors.length > 0
      ? aggregateMonitorEvidence(monitors)
      : component.manual_updated_at
        ? parseState(component.manual_state)
        : "unknown";
    const bucket = componentsByGroup.get(component.group_id) || [];
    bucket.push({
      id: component.id,
      sortOrder: component.sort_order,
      name: component.name,
      description: component.description,
      state,
      manual: monitors.length === 0,
      updatedAt: monitors.length === 0 ? component.manual_updated_at : newestCheck(monitors),
      history,
      observedUptime90d: completedChecks > 0 ? successfulChecks / completedChecks * 100 : null,
    });
    componentsByGroup.set(component.group_id, bucket);
  }
  const publicGroups = groups.map((group) => {
    const items = componentsByGroup.get(group.id) || [];
    return {
      id: group.id,
      sortOrder: group.sort_order,
      name: group.name,
      state: aggregateStates(items.map((item) => item.state)),
      components: items,
    };
  });
  const standaloneComponents = componentsByGroup.get(null) || [];
  const allComponents = [...standaloneComponents, ...publicGroups.flatMap((group) => group.components)];
  const logoUrl = safeLogoUrl(page.logo_url);
  const accentColor = /^#[0-9a-fA-F]{6}$/.test(page.accent_color)
    ? page.accent_color
    : "#8367c7";
  return {
    id: page.id,
    organizationId: page.organization_id,
    slug: page.slug,
    name: page.name,
    description: page.description,
    logoUrl,
    accentColor,
    state: aggregateStates(allComponents.map((item) => item.state)),
    groups: publicGroups,
    standaloneComponents,
    incidents: incidentRows.map((incident) => ({
      id: incident.id,
      title: incident.title,
      sourceType: incident.source_type,
      status: incident.status === "resolved" ? "resolved" : "open",
      startedAt: incident.started_at,
      resolvedAt: incident.resolved_at,
      components: incident.components || [],
      latestNote: incident.latest_note,
      latestNoteAt: incident.latest_note_at,
      updates: updatesByIncident.get(incident.id) || [],
    })),
    canonicalUrl: statusPageUrl(page.slug).toString(),
  };
}

export async function loadPublicIncident(page: PageRow, incidentId: string): Promise<PublicIncident | null> {
  if (!/^[0-9a-f-]{36}$/i.test(incidentId)) return null;
  const rows = await query<IncidentRow>(
    `SELECT i.id, i.title, i.source_type, i.status,
            CASE WHEN i.source_type = 'uptime_manual' THEN
              (SELECT MIN(u.published_at) FROM uptime_incident_updates u
               WHERE u.incident_id = i.id AND u.organization_id = $2 AND u.published_at IS NOT NULL)
            ELSE i.started_at END AS started_at,
            i.resolved_at,
            COALESCE((SELECT array_agg(DISTINCT c.name ORDER BY c.name)
                      FROM uptime_incident_components ic
                      JOIN uptime_status_components c ON c.id = ic.component_id
                      LEFT JOIN uptime_status_groups g ON g.id = c.group_id
                        AND g.page_id = c.page_id AND g.organization_id = c.organization_id
                      WHERE ic.incident_id = i.id AND ic.organization_id = $2
                        AND c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
                        AND (c.group_id IS NULL OR g.visible = true)), ARRAY[]::text[]) AS components,
            (SELECT u.note FROM uptime_incident_updates u
             WHERE u.incident_id = i.id AND u.organization_id = $2 AND u.published_at IS NOT NULL
             ORDER BY u.published_at DESC LIMIT 1) AS latest_note,
            (SELECT u.published_at FROM uptime_incident_updates u
             WHERE u.incident_id = i.id AND u.organization_id = $2 AND u.published_at IS NOT NULL
             ORDER BY u.published_at DESC LIMIT 1) AS latest_note_at
     FROM incidents i
     WHERE i.id = $3 AND i.organization_id = $2
       AND i.source_type IN ('uptime_monitor', 'uptime_manual')
       AND EXISTS (
         SELECT 1 FROM uptime_incident_components ic
         JOIN uptime_status_components c ON c.id = ic.component_id
         LEFT JOIN uptime_status_groups g ON g.id = c.group_id
           AND g.page_id = c.page_id AND g.organization_id = c.organization_id
         WHERE ic.incident_id = i.id AND ic.organization_id = $2
           AND c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
           AND (c.group_id IS NULL OR g.visible = true)
       )
       AND ((i.source_type = 'uptime_monitor' AND i.uptime_publication_state = 'published') OR EXISTS (
         SELECT 1 FROM uptime_incident_updates u
         WHERE u.incident_id = i.id AND u.organization_id = $2 AND u.published_at IS NOT NULL
       ))
     LIMIT 1`,
    [page.id, page.organization_id, incidentId],
  );
  const incident = rows[0];
  if (!incident || !incident.started_at) return null;
  const updates = await query<IncidentUpdateRow>(
    `SELECT id, incident_id, note, body_json, status, published_at
     FROM uptime_incident_updates
     WHERE incident_id = $1 AND organization_id = $2 AND published_at IS NOT NULL
     ORDER BY published_at DESC`,
    [incident.id, page.organization_id],
  );
  return {
    id: incident.id,
    title: incident.title,
    sourceType: incident.source_type,
    status: incident.status === "resolved" ? "resolved" : "open",
    startedAt: incident.started_at,
    resolvedAt: incident.resolved_at,
    components: incident.components || [],
    latestNote: incident.latest_note,
    latestNoteAt: incident.latest_note_at,
    updates: updates.map((update) => ({
      id: update.id, note: update.note, body: update.body_json, status: update.status, publishedAt: update.published_at,
    })),
  };
}

export function buildDailyHistory(rows: Map<string, Pick<DailyCheckRow, "checks" | "successes" | "reported_monitors"> & Partial<Pick<DailyCheckRow, "max_failed_checks">>>, todayUtc: number, expectedMonitors: number): PublicHistoryDay[] {
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const date = new Date(todayUtc - (HISTORY_DAYS - 1 - index) * DAY_MS).toISOString().slice(0, 10);
    const row = rows.get(date);
    const checks = Number(row?.checks || 0);
    const successes = Number(row?.successes || 0);
    // Probes run once a minute. Use the most affected monitor rather than summing
    // failures across monitors, which would overstate a component's downtime.
    const detectedFailureMinutes = Math.min(1440, Math.max(0,
      Number(row?.max_failed_checks ?? checks - successes),
    ));
    const reportedMonitors = Number(row?.reported_monitors || 0);
    const state: PublicState = checks === 0 || reportedMonitors < expectedMonitors ? "unknown"
      : successes === checks ? "operational"
      : successes === 0 ? "outage"
      : "degraded";
    return { date, state, checks, successes, detectedFailureMinutes, reportedMonitors, expectedMonitors };
  });
}

export function addIncidentsToHistory(
  history: PublicHistoryDay[],
  incidents: Array<Pick<ComponentIncidentRow, "id" | "title" | "source_type" | "started_at" | "resolved_at">>,
  now: number,
): PublicComponentHistoryDay[] {
  return history.map((day) => {
    const dayStart = Date.parse(`${day.date}T00:00:00Z`);
    const dayEnd = dayStart + DAY_MS;
    const overlaps = incidents.flatMap((incident) => {
      const start = Math.max(dayStart, incident.started_at.getTime());
      const end = Math.min(dayEnd, incident.resolved_at?.getTime() ?? now, now);
      return end > start ? [{ incident, start, end }] : [];
    });
    const intervals = overlaps.map(({ start, end }) => [start, end] as const).sort((a, b) => a[0] - b[0]);
    let coveredMs = 0;
    let lastEnd = dayStart;
    for (const [start, end] of intervals) {
      coveredMs += Math.max(0, end - Math.max(start, lastEnd));
      lastEnd = Math.max(lastEnd, end);
    }
    const automatic = overlaps.some(({ incident }) => incident.source_type === "uptime_monitor");
    return {
      ...day,
      state: overlaps.length && (day.state === "operational" || day.state === "unknown") ? "degraded" : day.state,
      incidentMinutes: coveredMs > 0 ? Math.max(1, Math.ceil(coveredMs / 60_000)) : 0,
      incidentKind: overlaps.length ? automatic ? "downtime" : "incident" : null,
      incidents: overlaps.map(({ incident, start, end }) => ({
        id: incident.id,
        title: incident.title,
        minutes: Math.max(1, Math.ceil((end - start) / 60_000)),
        automatic: incident.source_type === "uptime_monitor",
      })),
    };
  });
}

function newestCheck(monitors: MonitorEvidenceRow[]): Date | null {
  const latest = monitors.reduce<number>((current, item) => {
    return Math.max(current, item.last_checked_at?.getTime() || 0);
  }, 0);
  return latest ? new Date(latest) : null;
}

export function aggregateMonitorEvidence(monitors: MonitorEvidenceRow[], now = Date.now()): PublicState {
  if (monitors.length === 0) return "unknown";
  const states = monitors.map((monitor) => {
    if (!monitor.enabled || monitor.deleted_at || !monitor.last_checked_at ||
        now - monitor.last_checked_at.getTime() > STALE_AFTER_MS) return "unknown";
    return monitor.state;
  });
  const up = states.filter((state) => state === "up").length;
  const down = states.filter((state) => state === "down").length;
  if (up === states.length) return "operational";
  if (down === states.length) return "outage";
  if (down > 0) return "degraded";
  return "unknown";
}

export function aggregateStates(states: PublicState[]): PublicState {
  if (states.length === 0) return "unknown";
  const operational = states.filter((state) => state === "operational").length;
  const outage = states.filter((state) => state === "outage").length;
  const degraded = states.filter((state) => state === "degraded").length;
  if (operational === states.length) return "operational";
  if (outage === states.length) return "outage";
  if (outage > 0 || degraded > 0) return "degraded";
  return "unknown";
}

function parseState(value: string): PublicState {
  if (value === "operational" || value === "degraded" || value === "outage") return value;
  return "unknown";
}

export function safeLogoUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("data:")) {
    const match = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return null;
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length === 0 || bytes.length > 256 * 1024) return null;
    const validPng = match[1] === "png" &&
      bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    const validWebp = match[1] === "webp" && bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
    return validPng || validWebp ? value : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
