import { query } from "./db";
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
  group_id: string;
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

interface CheckSummaryRow {
  checks: string;
  successes: string;
  latency_ms: number | null;
}

interface IncidentRow {
  id: string;
  title: string;
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
  status: string;
  published_at: Date;
}

export interface PublicComponent {
  id: string;
  name: string;
  description: string | null;
  state: PublicState;
  manual: boolean;
  updatedAt: Date | null;
}

export interface PublicGroup {
  id: string;
  name: string;
  state: PublicState;
  components: PublicComponent[];
}

export interface PublicIncident {
  id: string;
  title: string;
  status: "open" | "resolved";
  startedAt: Date;
  resolvedAt: Date | null;
  components: string[];
  latestNote: string | null;
  latestNoteAt: Date | null;
  updates: Array<{ id: string; note: string; status: string; publishedAt: Date }>;
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
  incidents: PublicIncident[];
  observedUptime: number | null;
  averageLatencyMs: number | null;
  checkCount: number;
  canonicalUrl: string;
}

const STALE_AFTER_MS = 180_000;

export function normalizeRequestHost(request: Request): string | null {
  const header = request.headers.get("host") || new URL(request.url).host;
  try {
    if (!/^[a-z0-9.-]+(?::[0-9]{1,5})?$/i.test(header)) return null;
    const parsed = new URL(`http://${header}`);
    const host = parsed.hostname.toLowerCase();
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
  if (host === "status.outray.dev") return null;
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
  const [groups, components, evidence, summary, incidentRows] = await Promise.all([
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
       JOIN uptime_status_groups g ON g.id = c.group_id
       WHERE c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
         AND g.visible = true AND g.page_id = $1 AND g.organization_id = $2
       ORDER BY g.sort_order, c.sort_order, c.id`,
      [page.id, page.organization_id],
    ),
    query<MonitorEvidenceRow>(
      `SELECT cm.component_id, m.id AS monitor_id, m.state, m.last_checked_at,
              m.enabled, m.deleted_at
       FROM uptime_component_monitors cm
       JOIN uptime_status_components c ON c.id = cm.component_id
       JOIN uptime_monitors m ON m.id = cm.monitor_id
       JOIN uptime_status_groups g ON g.id = c.group_id
       WHERE c.page_id = $1 AND c.organization_id = $2
         AND c.visible = true AND g.visible = true AND g.page_id = $1
         AND g.organization_id = $2
         AND cm.organization_id = $2 AND m.organization_id = $2`,
      [page.id, page.organization_id],
    ),
    query<CheckSummaryRow>(
      `WITH page_monitors AS (
         SELECT DISTINCT cm.monitor_id
         FROM uptime_component_monitors cm
         JOIN uptime_status_components c ON c.id = cm.component_id
         JOIN uptime_status_groups g ON g.id = c.group_id
         WHERE c.page_id = $1 AND c.organization_id = $2
           AND c.visible = true AND g.visible = true AND g.page_id = $1
           AND g.organization_id = $2
           AND cm.organization_id = $2
       ), page_checks AS (
         SELECT ch.success, ch.latency_ms
         FROM uptime_checks ch
         JOIN page_monitors pm ON pm.monitor_id = ch.monitor_id
         WHERE ch.organization_id = $2 AND ch.checked_at >= NOW() - INTERVAL '30 days'
       )
       SELECT COUNT(*)::text AS checks,
              COUNT(*) FILTER (WHERE success)::text AS successes,
              AVG(latency_ms) FILTER (WHERE success)::double precision AS latency_ms
       FROM page_checks`,
      [page.id, page.organization_id],
    ),
    query<IncidentRow>(
      `SELECT i.id, i.title, i.status, i.started_at, i.resolved_at,
              COALESCE((SELECT array_agg(DISTINCT c.name ORDER BY c.name)
                        FROM uptime_incident_components ic
                        JOIN uptime_status_components c ON c.id = ic.component_id
                        JOIN uptime_status_groups g ON g.id = c.group_id
                        WHERE ic.incident_id = i.id AND c.page_id = $1
                          AND c.organization_id = $2 AND c.visible = true
                          AND g.page_id = $1 AND g.organization_id = $2
                          AND g.visible = true), ARRAY[]::text[]) AS components,
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
           JOIN uptime_status_groups g ON g.id = c.group_id
           WHERE ic.incident_id = i.id AND ic.organization_id = $2
             AND c.page_id = $1 AND c.organization_id = $2 AND c.visible = true
             AND g.page_id = $1 AND g.organization_id = $2 AND g.visible = true
         )
         AND (i.source_type = 'uptime_monitor' OR
           (i.source_type = 'uptime_manual' AND EXISTS (
             SELECT 1 FROM uptime_incident_updates u
             WHERE u.incident_id = i.id AND u.organization_id = $2
               AND u.published_at IS NOT NULL)))
       ORDER BY i.started_at DESC LIMIT 25`,
      [page.id, page.organization_id],
    ),
  ]);

  const publishedUpdates = incidentRows.length > 0
    ? await query<IncidentUpdateRow>(
      `SELECT id, incident_id, note, status, published_at
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
    bucket.push({ id: update.id, note: update.note, status: update.status, publishedAt: update.published_at });
    updatesByIncident.set(update.incident_id, bucket);
  }

  const evidenceByComponent = new Map<string, MonitorEvidenceRow[]>();
  for (const item of evidence) {
    const bucket = evidenceByComponent.get(item.component_id) || [];
    bucket.push(item);
    evidenceByComponent.set(item.component_id, bucket);
  }
  const componentsByGroup = new Map<string, PublicComponent[]>();
  for (const component of components) {
    const monitors = evidenceByComponent.get(component.id) || [];
    const state = monitors.length > 0
      ? aggregateMonitorEvidence(monitors)
      : component.manual_updated_at
        ? parseState(component.manual_state)
        : "unknown";
    const bucket = componentsByGroup.get(component.group_id) || [];
    bucket.push({
      id: component.id,
      name: component.name,
      description: component.description,
      state,
      manual: monitors.length === 0,
      updatedAt: monitors.length === 0 ? component.manual_updated_at : newestCheck(monitors),
    });
    componentsByGroup.set(component.group_id, bucket);
  }
  const publicGroups = groups.map((group) => {
    const items = componentsByGroup.get(group.id) || [];
    return {
      id: group.id,
      name: group.name,
      state: aggregateStates(items.map((item) => item.state)),
      components: items,
    };
  });
  const allComponents = publicGroups.flatMap((group) => group.components);
  const checkCount = Number(summary[0]?.checks || 0);
  const successes = Number(summary[0]?.successes || 0);
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
    incidents: incidentRows.map((incident) => ({
      id: incident.id,
      title: incident.title,
      status: incident.status === "resolved" ? "resolved" : "open",
      startedAt: incident.started_at,
      resolvedAt: incident.resolved_at,
      components: incident.components || [],
      latestNote: incident.latest_note,
      latestNoteAt: incident.latest_note_at,
      updates: updatesByIncident.get(incident.id) || [],
    })),
    observedUptime: checkCount > 0 ? (successes / checkCount) * 100 : null,
    averageLatencyMs: summary[0]?.latency_ms ?? null,
    checkCount,
    canonicalUrl: statusPageUrl(page.slug).toString(),
  };
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
