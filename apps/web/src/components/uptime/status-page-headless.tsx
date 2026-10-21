import { Link } from "@tanstack/react-router";
import { Code2, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/arc/button/button";
import { CopyButton } from "@/components/arc/copy-button/copy-button";
import { WorkspaceTextarea } from "@/components/ui/workspace-input";
import { statusPageOrigin, statusPagePreviewUrl } from "@/lib/uptime/status-url";
import headlessPolicy from "../../../../../shared/status-headless";
import { useStatusPageEditor } from "./status-page-editor-context";
import { statusPagePath, uptimeRequest, type UptimePage } from "./uptime-client";
import { primaryButton, UptimeError, UptimePanel } from "./uptime-ui";

export function StatusPageHeadless() {
  const { orgSlug, page, canManage, analyticsAvailable, reload } = useStatusPageEditor();
  const origin = statusPageOrigin(import.meta.env.VITE_OUTRAY_STATUS_URL, import.meta.env.DEV);
  const urls = headlessPolicy.headlessStatusUrls(origin, page.id);
  const saved = (page.analyticsOrigins ?? []).join("\n");
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const pending = useRef(false);
  useEffect(() => { setDraft((current) => current === saved ? null : current); }, [saved]);
  const value = draft ?? saved;
  const dirty = value !== saved;
  const snippet = `<script defer\n  src="${urls.script}"\n  data-page-id="${page.id}"></script>`;
  const example = `const response = await fetch(${JSON.stringify(urls.page)});\nif (!response.ok) throw new Error("Status unavailable");\nconst status = await response.json();\n\n// operational | degraded | outage | unknown\nconsole.log(status.state, status.groups);`;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !analyticsAvailable || pending.current) return;
    const origins = headlessPolicy.normalizeAnalyticsOrigins(value.split("\n").map((line) => line.trim()).filter(Boolean), import.meta.env.DEV);
    if (origins === null) { setError("Enter up to 10 exact HTTPS origins, one per line, without paths, wildcards, queries, or credentials."); return; }
    pending.current = true; setSaving(true); setError(null); setSuccess(false);
    try {
      const result = await uptimeRequest<{ page: UptimePage }>(orgSlug, statusPagePath("/page", page.id), { method: "PATCH", body: JSON.stringify({ analyticsOrigins: origins }) });
      setDraft((result.page.analyticsOrigins ?? []).join("\n"));
      setSuccess(true); reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save allowed websites."); }
    finally { pending.current = false; setSaving(false); }
  }
  return <div className="space-y-5">
    <div><h2 className="flex items-center gap-2 text-[14px] font-medium text-zinc-200"><Code2 size={16} aria-hidden="true" />Your frontend. OutRay’s status data.</h2><p className="mt-2 max-w-2xl text-[13px] leading-6 text-zinc-500">Build your own status page with public JSON. Keep hosting it wherever you like—no CNAME changes, API keys, or OutRay-managed certificates needed.</p></div>
    {!page.published && <p className="rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-4 py-3 text-[12px] leading-5 text-amber-200/80">Publish this status page before using its public API. Draft pages return 404.</p>}
    <UptimePanel className="space-y-4 p-4 sm:p-5">
      <div><h3 className="text-[13px] font-medium text-zinc-200">Public API</h3><p className="mt-1 text-[12px] leading-5 text-zinc-500">Included on every plan. Components, 90-day history, and the latest 25 published incidents. Poll once a minute; responses are cached for 15 seconds.</p></div>
      <CodeBlock title="Status page · GET" code={urls.page} />
      <CodeBlock title="Incident detail · GET" code={urls.incident} />
      <CodeBlock title="Fetch status" code={example} />
      <p className="text-[12px] leading-5 text-zinc-500">The hosted page stays available. For email updates, link visitors to <a href={statusPagePreviewUrl(origin, page)} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline underline-offset-4 hover:text-white">its subscription form</a>.</p>
    </UptimePanel>
    {analyticsAvailable ? <UptimePanel className="space-y-4 p-4 sm:p-5">
      <div><h3 className="text-[13px] font-medium text-zinc-200">Track your custom page</h3><p className="mt-1 text-[12px] leading-5 text-zinc-500">Register your website, then add the optional script. Visits appear alongside your hosted page in Analytics.</p></div>
      <form onSubmit={(event) => void save(event)} className="space-y-3">
        <div><label htmlFor="headless-origins" className="mb-2 block text-[12px] text-zinc-300">Allowed websites</label>
          <WorkspaceTextarea id="headless-origins" rows={3} value={value} onChange={(event) => { setDraft(event.target.value); setError(null); setSuccess(false); }} placeholder={"https://status.example.com\nhttps://example.com"} readOnly={!canManage || saving} maxLength={20500} aria-describedby="headless-origins-hint" aria-invalid={Boolean(error)} className="font-mono text-[12px]" />
          <p id="headless-origins-hint" className="mt-2 text-[11px] leading-5 text-zinc-500">Up to 10 exact HTTPS origins, one per line. No paths or wildcards. Removing a website stops accepting its visits. HTTP localhost is supported in development.</p>
        </div>
        {error && <UptimeError message={error} />}
        <div className="flex flex-wrap items-center gap-3">{canManage && <Button type="submit" size="sm" loading={saving} disabled={saving || !dirty}>Save websites</Button>}{success && <p role="status" className="text-[12px] text-emerald-300">Allowed websites saved.</p>}</div>
      </form>
      <CodeBlock title="Add to your custom page" code={snippet} />
      <p className="text-[11px] leading-5 text-zinc-500">Tracks page loads and pathname changes in single-page apps. No cookies or browser credentials; query strings and fragments are excluded. DNT and Global Privacy Control are respected.</p>
    </UptimePanel> : <UptimePanel className="p-5 sm:p-6">
      <h3 className="flex items-center gap-2 text-[14px] text-zinc-200"><LockKeyhole size={16} aria-hidden="true" />Optional visitor analytics</h3>
      <p className="mt-2 max-w-xl text-[13px] leading-6 text-zinc-500">The data API is free. Add cookie-free visitor analytics to your custom status page with any paid plan.</p>
      <Link to="/$orgSlug/billing" params={{ orgSlug }} className={`${primaryButton} mt-4`}>Explore plans</Link>
    </UptimePanel>}
    <p className="text-[12px] text-zinc-500"><Link to="/docs/$" params={{ _splat: "uptime/headless" }} className="text-zinc-300 underline underline-offset-4 hover:text-white">Headless setup guide</Link> · API fields, CSP settings, and privacy details.</p>
  </div>;
}

function CodeBlock({ title, code }: { title: string; code: string }) {
  return <div className="min-w-0 overflow-hidden rounded-lg border border-white/[0.07] bg-black/15"><div className="flex items-center justify-between gap-3 px-3 py-2"><span className="text-[11px] text-zinc-500">{title}</span><CopyButton value={code} label={`Copy ${title}`} /></div><pre className="m-0 overflow-x-auto px-3 pb-4 font-mono text-[12px] leading-6 text-zinc-300"><code>{code}</code></pre></div>;
}
