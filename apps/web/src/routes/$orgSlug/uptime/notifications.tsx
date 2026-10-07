import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Mail, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import buttonStyles from "@/components/arc/button/button.module.css";
import "@/components/outray-arc-theme.css";
import { formatTime, uptimeApiPath, uptimeRequest } from "@/components/uptime/uptime-client";
import { UptimeDialog } from "@/components/uptime/uptime-dialog";
import { UptimeSkeleton } from "@/components/uptime/uptime-skeleton";
import { UptimeError, UptimePageHeading } from "@/components/uptime/uptime-ui";

type Provider = "slack" | "discord";
type IntegrationResult = "connected" | "cancelled" | "failed";
type Integration = {
  provider: Provider;
  connectedAt: string;
  target: {
    workspaceName?: string;
    channelName?: string;
    channelId?: string;
    connectedAt?: string;
  } | null;
};
type IntegrationsResponse = {
  integrations: Integration[];
  availability: Record<Provider, boolean>;
  canManage: boolean;
};
type Notice = { kind: "success" | "neutral" | "error"; message: string };

const providers: Provider[] = ["slack", "discord"];
const providerNames: Record<Provider, string> = { slack: "Slack", discord: "Discord" };
const oauthNotices: Record<IntegrationResult, Notice> = {
  connected: { kind: "success", message: "Notification channel connected." },
  cancelled: { kind: "neutral", message: "Connection cancelled. Your existing notification channel is unchanged." },
  failed: { kind: "error", message: "Could not connect the notification channel. Your existing connection is unchanged. Please try again." },
};

export const Route = createFileRoute("/$orgSlug/uptime/notifications")({
  head: () => ({ meta: [{ title: "Notifications - OutRay Uptime" }] }),
  validateSearch: (search: Record<string, unknown>): { integration?: IntegrationResult } => ({
    integration: search.integration === "connected" || search.integration === "cancelled" || search.integration === "failed"
      ? search.integration : undefined,
  }),
  component: UptimeNotifications,
});

function UptimeNotifications() {
  const { orgSlug } = Route.useParams();
  const { integration } = Route.useSearch();
  return <NotificationsContent key={orgSlug} orgSlug={orgSlug} integration={integration} />;
}

function NotificationsContent({ orgSlug, integration }: { orgSlug: string; integration?: IntegrationResult }) {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const queryKey = ["uptime", orgSlug, "integrations"];
  const resource = useQuery({
    queryKey,
    queryFn: ({ signal }) => uptimeRequest<IntegrationsResponse>(orgSlug, "/integrations", { signal }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
    retry: 1,
  });
  const [notice, setNotice] = useState<Notice | null>(() => integration ? oauthNotices[integration] : null);
  const [dialog, setDialog] = useState<{ provider: Provider; mode: "settings" | "remove" } | null>(null);
  const [removing, setRemoving] = useState<Provider | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const removedProvider = useRef<Provider | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const confirmingRemoval = dialog?.mode === "remove";
  const canManage = resource.data?.canManage === true;
  const selectedConnection = resource.data?.integrations.find((item) => item.provider === dialog?.provider);
  const selectedName = dialog ? providerNames[dialog.provider] : "";

  // Preserve the one-time feedback on screen, but never replay it on reload or back navigation.
  useEffect(() => {
    if (integration) void navigate({ search: {}, replace: true, resetScroll: false });
  }, [integration, navigate]);

  useEffect(() => {
    if (!dialog && !removing && removedProvider.current) {
      // Removal replaces the settings trigger, so return focus to its provider heading.
      document.getElementById(`uptime-channel-${removedProvider.current}`)?.focus();
      removedProvider.current = null;
    }
  }, [dialog, removing]);

  useEffect(() => {
    if (confirmingRemoval) cancelButton.current?.focus();
  }, [confirmingRemoval]);

  const closeDialog = () => {
    if (removing) return;
    setDialog(null);
    setRemoveError(null);
  };

  const removeConnection = async (provider: Provider) => {
    if (!canManage || removing) return;
    setRemoving(provider);
    setRemoveError(null);
    try {
      await queryClient.cancelQueries({ queryKey });
      await uptimeRequest(orgSlug, `/integrations/${provider}`, { method: "DELETE" });
      queryClient.setQueryData<IntegrationsResponse>(queryKey, (current) => current ? {
        ...current,
        integrations: current.integrations.filter((item) => item.provider !== provider),
      } : current);
      removedProvider.current = provider;
      setDialog(null);
      setNotice({ kind: "success", message: `${providerNames[provider]} removed from Uptime notifications.` });
      void queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : "Could not remove the notification channel.");
    } finally {
      setRemoving(null);
    }
  };

  return <div className="outray-arc mx-auto w-full max-w-[1440px]">
    <UptimePageHeading title="Notifications" description="Manage the channels your team uses for Uptime alerts." />
    {notice && <div role={notice.kind === "error" ? "alert" : "status"} className={`mb-4 flex items-center justify-between gap-4 rounded-lg border px-4 py-2 text-[12px] leading-5 ${notice.kind === "error" ? "border-rose-400/15 bg-rose-400/[0.025] text-rose-300" : notice.kind === "success" ? "border-emerald-400/15 bg-emerald-400/[0.025] text-emerald-300" : "border-white/[0.08] bg-white/[0.025] text-zinc-300"}`}>
      <p>{notice.message}</p>
      <Button type="button" variant="ghost" size="sm" aria-label="Dismiss notification feedback" onClick={() => setNotice(null)} className="!size-8 !min-w-0 !px-0 shrink-0"><X size={14} aria-hidden="true" /></Button>
    </div>}

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <section aria-labelledby="team-channels-heading" className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-[#111112]">
      <header className="border-b border-white/[0.07] px-5 py-4"><h2 id="team-channels-heading" className="text-[13px] font-medium text-zinc-200">Team channels</h2>
      <p className="mt-1 text-[12px] leading-5 text-zinc-500">One destination per provider. Uptime connections are separate from Observability.</p>
      {resource.data && !canManage && <p className="mt-2 text-[11px] leading-5 text-zinc-500">You can view channels. Only workspace owners and admins can connect, change, or remove them.</p>}</header>

      {resource.error && <div className="space-y-3 px-5 py-4">
        <UptimeError message={`${resource.data ? "Could not refresh channels. Showing the last loaded connections. " : ""}${resource.error.message}`} />
        <Button type="button" variant="secondary" size="sm" loading={resource.isFetching} onClick={() => void resource.refetch()}>Retry</Button>
      </div>}

      {!resource.data && resource.isPending && <UptimeSkeleton label="Loading notification channels" className="divide-y divide-white/[0.07]">
        {providers.map((provider) => <div key={provider} className="flex min-h-24 items-center gap-3 px-5 py-4">
          <div className="size-9 shrink-0 rounded-lg bg-white/[0.05]" />
          <div className="min-w-0 flex-1"><div className="h-3 w-20 rounded bg-white/[0.07]" /><div className="mt-3 h-3 w-52 max-w-full rounded bg-white/[0.04]" /></div>
          <div className="h-9 w-24 rounded-lg bg-white/[0.05]" />
        </div>)}
      </UptimeSkeleton>}

      {resource.data && <div className="divide-y divide-white/[0.07]">
        {providers.map((provider) => {
          const connection = resource.data.integrations.find((item) => item.provider === provider);
          const available = resource.data.availability[provider];
          const name = providerNames[provider];
          return <div key={provider} className="flex min-h-24 flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025]"><img src={`/logos/${provider}.svg`} alt="" className="size-5 object-contain" /></span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 id={`uptime-channel-${provider}`} tabIndex={-1} className="text-[13px] font-medium text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-500">{name}</h3>{connection && <span className="inline-flex w-fit items-center gap-1 rounded-md bg-emerald-400/[0.06] px-1.5 py-0.5 text-[10px] leading-4 text-emerald-300/85"><Check size={10} aria-hidden="true" />Connected</span>}</div>
                <p className="mt-1 break-words text-[12px] leading-5 text-zinc-500">{connection ? channelSummary(connection) : available ? "Not connected" : "Not configured"}</p>
                {!available && <p className="mt-1 text-[11px] leading-5 text-zinc-500">{connection ? "Channel changes are unavailable until the integration is configured." : "Connection is unavailable until the integration is configured."}</p>}
              </div>
            </div>
            {canManage && (connection ? <Button type="button" variant="secondary" size="md" aria-haspopup="dialog" aria-label={`${name} channel settings`} onClick={() => { setRemoveError(null); setDialog({ provider, mode: "settings" }); }}>Settings</Button>
              : available ? <a className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`} href={uptimeApiPath(orgSlug, `/integrations/${provider}/start`)}>Connect {name}</a>
                : <Button type="button" variant="secondary" size="md" disabled>Connect {name}</Button>)}
          </div>;
        })}
      </div>}
    </section>

    <section aria-labelledby="email-notifications-heading" className="min-w-0 rounded-xl border border-white/[0.08] bg-[#111112] px-5 py-4">
      <h2 id="email-notifications-heading" className="flex items-center gap-2 text-[13px] font-medium text-zinc-200"><Mail size={14} className="text-zinc-500" aria-hidden="true" />Email notifications</h2>
      <p className="mt-2 text-[12px] leading-5 text-zinc-500">Team recipients are configured per monitor. Choose who receives downtime and recovery alerts in monitor settings.</p>
      <Link to="/$orgSlug/uptime/monitors" params={{ orgSlug }} className="mt-3 inline-flex min-h-8 items-center gap-1 text-[12px] text-zinc-300 hover:text-white focus-visible:outline-2 focus-visible:outline-zinc-500">Manage monitors<ArrowUpRight size={13} aria-hidden="true" /></Link>
      <div className="mt-3 border-t border-white/[0.07] pt-3"><h3 className="text-[12px] font-medium text-zinc-300">Public subscribers</h3><p className="mt-1.5 text-[11px] leading-5 text-zinc-500">Status-page subscribers are separate from team channels. Publishing an incident update queues email to confirmed subscribers; saving a draft does not notify them.</p></div>
    </section>
    </div>

    <UptimeDialog open={dialog !== null} onClose={closeDialog} title={dialog?.mode === "remove" ? `Remove ${selectedName}?` : `${selectedName} channel settings`}
      description={dialog?.mode === "remove" ? "This stops Uptime alerts to this destination. Monitor email recipients, status-page subscribers, and Observability connections are unchanged." : "Change the destination through the provider, or remove this connection from Uptime."}
      busy={removing !== null}
      footer={<>
        <Button ref={cancelButton} type="button" variant="secondary" size="sm" disabled={removing !== null} onClick={dialog?.mode === "remove" ? () => { setRemoveError(null); setDialog(dialog ? { ...dialog, mode: "settings" } : null); } : closeDialog}>{dialog?.mode === "remove" ? "Cancel" : "Close"}</Button>
        {dialog && selectedConnection && canManage && (dialog.mode === "remove"
          ? <Button type="button" variant="danger" size="sm" loading={removing !== null} onClick={() => void removeConnection(dialog.provider)}>Remove {selectedName}</Button>
          : resource.data?.availability[dialog.provider] ? <a className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm}`} href={uptimeApiPath(orgSlug, `/integrations/${dialog.provider}/start`)}>Change channel</a> : <Button type="button" size="sm" disabled>Change channel</Button>)}
      </>}>
      {selectedConnection ? <div className="space-y-5">
        <div className="flex items-center gap-3"><img src={`/logos/${selectedConnection.provider}.svg`} alt="" className="size-7 object-contain" /><div><p className="break-words text-sm text-zinc-200">{channelSummary(selectedConnection)}</p><p className="mt-1 text-xs text-zinc-500">Connected {formatTime(selectedConnection.target?.connectedAt || selectedConnection.connectedAt)}</p></div></div>
        {dialog?.mode === "settings" && canManage && <div className="border-t border-white/[0.07] pt-4">
          <p className="mb-3 text-[13px] leading-6 text-zinc-500">Changing channels opens {selectedName} to authorize a new destination. Your current channel stays connected unless the change succeeds.</p>
          {!resource.data?.availability[dialog.provider] && <p className="mb-3 text-xs text-amber-200">Channel changes are unavailable because this integration is not configured.</p>}
          <Button type="button" variant="danger" size="sm" aria-haspopup="dialog" onClick={() => setDialog({ ...dialog, mode: "remove" })}>Remove connection</Button>
        </div>}
      </div> : <p className="text-[13px] text-zinc-500">This channel is no longer connected.</p>}
      {!canManage && <p className="mt-4 text-[13px] text-zinc-500">Only workspace owners and admins can manage this connection.</p>}
      {removeError && <div className="mt-4"><UptimeError message={removeError} /></div>}
    </UptimeDialog>
  </div>;
}

function channelSummary(connection: Integration) {
  const workspace = connection.target?.workspaceName || (connection.provider === "slack" ? "Slack workspace" : "Discord server");
  const channelName = connection.target?.channelName;
  const channel = channelName ? `#${channelName.replace(/^#/, "")}` : connection.target?.channelId ? `Channel ${connection.target.channelId}` : "Selected channel";
  return `${workspace} · ${channel}`;
}
