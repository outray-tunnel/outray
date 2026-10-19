import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import ArrowLeft01Icon from "@outray/icons/stroke/ArrowLeft01Icon";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import Folder01Icon from "@outray/icons/stroke/Folder01Icon";
import Loading03Icon from "@outray/icons/stroke/Loading03Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import Add01Icon from "@outray/icons/stroke/Add01Icon";
import Delete02Icon from "@outray/icons/stroke/Delete02Icon";
import { Link } from "@tanstack/react-router";
import {
  type FormEvent,
  type ClipboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/ui/select";
import { WorkspaceInput, WorkspaceTextarea } from "@/components/ui/workspace-input";
import { OnboardingShell } from "./onboarding-shell";
import { SetupFlow, SetupStep, SetupCodeBlock as CodeBlock } from "./setup-ui";
import { UptimeMonitorForm } from "./uptime-monitor-form";
import { ObservabilitySetup } from "./observability-setup";
import { setupCliCommand } from "./setup-endpoints";
import { createEmptySecretDraft, parseSecretPaste, populateSecretDraft, secretDraftValues } from "./secrets-draft";
import { serializeEnvText } from "@/lib/secrets/validation";
import { parseSetupProduct, type SetupProduct } from "./setup-products";
import type { UptimeMonitor } from "@/components/uptime/uptime-client";
import { appClient } from "@/lib/app-client";
import {
  secretsClient,
  type SecretProject,
} from "@/lib/secrets-client";

const productConfig: Record<
  SetupProduct,
  {
    name: string;
    title: string;
    description: string;
    waitingLabel: string;
    completeLabel: string;
    icon: IconSvgElement;
    consoleTo:
      | "/$orgSlug/tunnel"
      | "/$orgSlug/observability"
      | "/$orgSlug/secrets"
      | "/$orgSlug/uptime";
  }
> = {
  tunnels: {
    name: "Tunnels",
    title: "Connect your first tunnel",
    description:
      "Install the OutRay CLI, sign in, and expose a service running on your machine.",
    waitingLabel: "Waiting for your first tunnel",
    completeLabel: "First tunnel received",
    icon: Cone01Icon,
    consoleTo: "/$orgSlug/tunnel",
  },
  observability: {
    name: "Observability",
    title: "Instrument your first service",
    description:
      "Create an ingest token, add the SDK to a server, and send its first telemetry to OutRay.",
    waitingLabel: "Waiting for your first ingest",
    completeLabel: "First service received",
    icon: Pulse02Icon,
    consoleTo: "/$orgSlug/observability",
  },
  secrets: {
    name: "Secrets",
    title: "Store your first secret",
    description:
      "Create a vault, then add an encrypted value here or securely through the OutRay CLI.",
    waitingLabel: "Waiting for your first secret",
    completeLabel: "First secret stored",
    icon: LockPasswordIcon,
    consoleTo: "/$orgSlug/secrets",
  },
  uptime: {
    name: "Uptime",
    title: "Watch your first endpoint",
    description: "Create an HTTP monitor for a public endpoint. Checks run every minute and confirm failures before alerting your team.",
    waitingLabel: "Waiting for your first check",
    completeLabel: "First check received",
    icon: HeartPulseIcon,
    consoleTo: "/$orgSlug/uptime",
  },
};

export function ProductSetup({ orgSlug, product: requestedProduct }: { orgSlug: string; product: SetupProduct }) {
  const product = parseSetupProduct(requestedProduct);
  const config = productConfig[product];
  const [verificationRefresh, setVerificationRefresh] = useState(0);
  const [createdMonitor, setCreatedMonitor] = useState<UptimeMonitor | null>(null);
  const verification = useProductVerification(orgSlug, product, verificationRefresh, createdMonitor?.id);
  const recheck = () => setVerificationRefresh((value) => value + 1);
  const monitorCreated = (monitor: UptimeMonitor) => {
    setCreatedMonitor(monitor);
    recheck();
  };

  return (
    <OnboardingShell orgSlug={orgSlug}>
      <div className="space-y-6">
        <Link
          to="/$orgSlug/get-started"
          params={{ orgSlug }}
          className="inline-flex min-h-8 items-center gap-1.5 rounded text-[12px] text-zinc-400 transition-colors hover:text-zinc-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={13} strokeWidth={1.8} aria-hidden="true" />
          All products
        </Link>

        <header className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-zinc-400">
            <HugeiconsIcon icon={config.icon} size={18} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[20px] font-normal tracking-[-0.035em] text-white">{config.title}</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-5 text-zinc-400">{config.description}</p>
          </div>
        </header>

        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            {product === "tunnels" ? (
              <TunnelSetup orgSlug={orgSlug} onRecheck={recheck} />
            ) : product === "observability" ? (
              <ObservabilitySetup orgSlug={orgSlug} onRecheck={recheck} />
            ) : product === "secrets" ? (
              <SecretsSetup orgSlug={orgSlug} onSecretCreated={recheck} />
            ) : (
              <UptimeSetup orgSlug={orgSlug} onRecheck={recheck} createdMonitor={createdMonitor} onMonitorCreated={monitorCreated} />
            )}
          </div>
          <VerificationPanel config={config} orgSlug={orgSlug} state={verification.state} detail={verification.detail} error={verification.error} />
        </div>
      </div>
    </OnboardingShell>
  );
}

function TunnelSetup({ orgSlug, onRecheck }: { orgSlug: string; onRecheck: () => void }) {
  return (
    <SetupFlow steps={[{ id: "01", title: "Install CLI" }, { id: "02", title: "Sign in" }, { id: "03", title: "Connect" }]} onRecheck={onRecheck}>
      <SetupStep number="01" title="Install the CLI">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">
          Install OutRay globally so the tunnel command is available from any
          project.
        </p>
        <CodeBlock>npm install -g outray</CodeBlock>
      </SetupStep>
      <SetupStep number="02" title="Sign in">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">
          Authenticate the CLI with the account that owns this workspace.
        </p>
        <CodeBlock>{setupCliCommand("outray login")}</CodeBlock>
      </SetupStep>
      <SetupStep number="03" title="Start a tunnel">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">
          Replace 3000 with the port your local service uses. This page will
          detect the connection automatically.
        </p>
        <CodeBlock>{setupCliCommand(`outray 3000 --org ${orgSlug}`)}</CodeBlock>
      </SetupStep>
    </SetupFlow>
  );
}

function UptimeSetup({ orgSlug, onRecheck, createdMonitor, onMonitorCreated }: {
  orgSlug: string;
  onRecheck: () => void;
  createdMonitor: UptimeMonitor | null;
  onMonitorCreated: (monitor: UptimeMonitor) => void;
}) {
  return (
    <SetupFlow steps={[{ id: "01", title: "Add monitor" }, { id: "02", title: "First check" }, { id: "03", title: "Status page" }]} onRecheck={onRecheck}>
      <SetupStep number="01" title="Add a public endpoint">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">
          Add a public HTTP(S) endpoint. Checks run every minute; private addresses are not supported.
        </p>
        <UptimeMonitorForm orgSlug={orgSlug} onCreated={onMonitorCreated} />
      </SetupStep>
      <SetupStep number="02" title="Wait for the first check">
        <p className="text-[12px] leading-5 text-zinc-400">{createdMonitor ? <>Waiting for the first check of <span className="text-zinc-200">{createdMonitor.name}</span>. </> : "Create a monitor in the first step. "}OutRay checks the endpoint from one region every minute. Its state remains Unknown until a check completes.</p>
        <p className="mt-3 text-[11px] leading-5 text-zinc-400">Keep setup open. Connection verification updates automatically when its first check arrives.</p>
      </SetupStep>
      <SetupStep number="03" title="Share a status page">
        <p className="text-[12px] leading-5 text-zinc-400">Choose components, link monitors, and publish a page for your customers. Components can stand alone or belong to a group.</p>
        <Link to="/$orgSlug/uptime/status-page" params={{ orgSlug }} className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.12] bg-white/[0.055] px-3.5 text-[12px] text-zinc-200 transition-colors hover:bg-white/[0.09] motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Open status-page builder <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} /></Link>
      </SetupStep>
    </SetupFlow>
  );
}


function SecretsSetup({
  orgSlug,
  onSecretCreated,
}: {
  orgSlug: string;
  onSecretCreated: () => void;
}) {
  const [projects, setProjects] = useState<SecretProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedProjectSlug, setSelectedProjectSlug] = useState("");
  const [selectedEnvironmentSlug, setSelectedEnvironmentSlug] = useState("");
  const [vaultName, setVaultName] = useState("");
  const [secretRows, setSecretRows] = useState(createEmptySecretDraft);
  const [creatingVault, setCreatingVault] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    setLoadError(null);
    try {
      const nextProjects = await secretsClient.projects(orgSlug);
      setProjects(nextProjects);
      setSelectedProjectSlug((current) => current || nextProjects[0]?.slug || "");
      setError(null);
    } catch (requestError) {
      setLoadError(
        requestError instanceof Error
          ? requestError.message
          : "Vaults could not be loaded.",
      );
    } finally {
      setLoadingProjects(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectedProject = projects.find(
    (project) => project.slug === selectedProjectSlug,
  );
  const environments = selectedProject?.environments || [];
  const selectedEnvironment = environments.find(
    (environment) => environment.slug === selectedEnvironmentSlug,
  ) ?? environments.find((environment) => environment.slug === "development") ?? environments[0];
  const populatedRows = secretRows.filter((row) => row.key || row.value);
  const keyCounts = new Map<string, number>();
  for (const row of populatedRows) keyCounts.set(row.key, (keyCounts.get(row.key) ?? 0) + 1);
  const validDraft = populatedRows.length > 0 && populatedRows.every(
    (row) => /^[A-Z_][A-Z0-9_]{0,255}$/.test(row.key) && keyCounts.get(row.key) === 1,
  );

  const updateSecretRow = (id: number, field: "key" | "value", value: string) => {
    setSecretRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setSavedMessage(null);
    setError(null);
  };

  const pasteSecrets = (event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>, id: number, field: "key" | "value") => {
    if (savingSecret) return;
    try {
      const entries = parseSecretPaste(event.clipboardData.getData("text/plain"), field);
      if (!entries) return;
      event.preventDefault();
      setSecretRows(populateSecretDraft(secretRows, id, entries));
      setSavedMessage(null);
      setError(null);
    } catch (pasteError) {
      event.preventDefault();
      setError(pasteError instanceof Error ? pasteError.message : "Could not read these .env values.");
    }
  };

  const createVault = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creatingVault || !vaultName.trim()) return;
    setCreatingVault(true);
    setError(null);
    try {
      const created = await secretsClient.createProject(orgSlug, {
        name: vaultName.trim(),
      });
      setProjects((current) => [...current, created]);
      setSelectedProjectSlug(created.slug);
      const development =
        created.environments.find(
          (environment) => environment.slug === "development",
        ) || created.environments[0];
      setSelectedEnvironmentSlug(development?.slug || "");
      setVaultName("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The vault could not be created.",
      );
    } finally {
      setCreatingVault(false);
    }
  };

  const createSecret = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      savingSecret ||
      !selectedProject ||
      !selectedEnvironment ||
      !validDraft
    )
      return;
    setSavingSecret(true);
    setError(null);
    try {
      const values = secretDraftValues(secretRows);
      const entries = Object.entries(values);
      let created = 1;
      let revision = selectedEnvironment.revision + 1;
      if (entries.length === 1) {
        const [key, value] = entries[0];
        await secretsClient.createSecret(
          orgSlug,
          selectedProject.slug,
          selectedEnvironment.slug,
          {
            key,
            value,
            environmentSlugs: [selectedEnvironment.slug],
            expectedRevisions: {
              [selectedEnvironment.slug]: selectedEnvironment.revision,
            },
            expectedRevision: selectedEnvironment.revision,
          },
        );
      } else {
        const envText = serializeEnvText(values);
        const preview = await secretsClient.importDotenv(orgSlug, selectedProject.slug, selectedEnvironment.slug, { envText, dryRun: true });
        if (preview.updated || preview.unchanged) {
          throw new Error("Some keys already exist in this environment. Use the Secrets console to update them.");
        }
        const result = await secretsClient.importDotenv(orgSlug, selectedProject.slug, selectedEnvironment.slug, {
          envText,
          dryRun: false,
          expectedRevision: preview.revision ?? selectedEnvironment.revision,
        });
        created = result.created;
        revision = result.revision ?? selectedEnvironment.revision + (created ? 1 : 0);
      }
      setSecretRows(createEmptySecretDraft());
      setSavedMessage(`${entries.length > 1 ? `Saved ${created} secrets` : "Saved"} to ${selectedProject.name} / ${selectedEnvironment.name}.`);
      setProjects((current) =>
        current.map((project) =>
          project.slug === selectedProject.slug
            ? {
                ...project,
                secretCount: project.secretCount + created,
                environments: project.environments.map((environment) =>
                  environment.slug === selectedEnvironment.slug
                    ? {
                        ...environment,
                        revision,
                        secretCount: environment.secretCount + created,
                      }
                    : environment,
                ),
              }
            : project,
        ),
      );
      onSecretCreated();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The secrets could not be stored.",
      );
    } finally {
      setSavingSecret(false);
    }
  };

  if (loadingProjects) {
    return (
      <div className="min-h-[280px] space-y-5 rounded-xl border border-white/[0.08] bg-[#111112] p-5" aria-busy="true" aria-label="Loading vault setup">
        <div className="h-8 w-full animate-pulse rounded-lg bg-white/[0.035] motion-reduce:animate-none" />
        <div className="h-4 w-44 animate-pulse rounded bg-white/[0.06] motion-reduce:animate-none" />
        <div className="h-9 animate-pulse rounded-lg bg-white/[0.035] motion-reduce:animate-none" />
        <div className="h-20 animate-pulse rounded-lg bg-white/[0.025] motion-reduce:animate-none" />
      </div>
    );
  }

  if (loadError) {
    return (
      <section role="alert" className="rounded-xl border border-white/[0.08] bg-[#111112] p-5">
        <h2 className="text-[14px] font-medium text-zinc-200">Could not load vaults</h2>
        <p className="mt-2 text-[12px] leading-5 text-zinc-400">{loadError}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => void loadProjects()}>Try again</Button>
      </section>
    );
  }

  if (!projects.length) {
    return (
      <SetupFlow steps={[{ id: "01", title: "Create vault" }]}>
        <SetupStep number="01" title="Create a vault">
          <p className="mb-4 text-[12px] leading-5 text-zinc-400">A vault keeps one application's secrets together. Development, staging, and production environments are created automatically.</p>
          {error && <InlineError message={error} />}
          <form onSubmit={createVault} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-[12px] text-zinc-300">Vault name</span>
              <WorkspaceInput
                value={vaultName}
                onChange={(event) => setVaultName(event.target.value)}
                placeholder="My application"
                required
                readOnly={creatingVault}
                autoComplete="off"
              />
            </label>
            <Button type="submit" disabled={!vaultName.trim()} loading={creatingVault}>Create vault</Button>
          </form>
        </SetupStep>
      </SetupFlow>
    );
  }

  return (
    <SetupFlow steps={[{ id: "01", title: "Destination" }, { id: "02", title: "Add secrets" }, { id: "03", title: "CLI access" }]} onRecheck={onSecretCreated}>
      <SetupStep number="01" title="Choose where to store it">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">Select a vault and environment. Start with Development if you're trying Secrets for the first time.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[12px] text-zinc-300">Vault</p>
            <Select
              ariaLabel="Vault"
              disabled={savingSecret}
              value={selectedProjectSlug}
              onChange={(value) => { setSelectedProjectSlug(value); setSavedMessage(null); }}
              options={projects.map((project) => ({ value: project.slug, label: project.name, description: `${project.secretCount} secrets` }))}
              icon={<HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.7} />}
              triggerClassName="h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
              menuClassName="[&_.text-zinc-700]:text-zinc-400"
            />
          </div>
          <div>
            <p className="mb-1.5 text-[12px] text-zinc-300">Environment</p>
            <Select
              ariaLabel="Environment"
              value={selectedEnvironment?.slug ?? ""}
              onChange={(value) => { setSelectedEnvironmentSlug(value); setSavedMessage(null); }}
              options={environments.map((environment) => ({ value: environment.slug, label: environment.name, description: `${environment.secretCount} secrets` }))}
              disabled={savingSecret || !environments.length}
              triggerClassName="h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
              menuClassName="[&_.text-zinc-700]:text-zinc-400"
            />
          </div>
        </div>
        <p className="mt-3 text-[11px] text-zinc-400">You can add more vaults and environments from the Secrets console.</p>
      </SetupStep>

      <SetupStep number="02" title="Add your secrets">
        <p className="mb-2 text-[12px] leading-5 text-zinc-400">Store values in <span className="text-zinc-300">{selectedProject?.name} / {selectedEnvironment?.name}</span>. They are encrypted at rest and never returned by metadata requests.</p>
        <p id="setup-secrets-paste-hint" className="mb-4 text-[11px] leading-5 text-zinc-500">Paste .env lines into either column to fill multiple rows, or add keys and values one at a time.</p>
        {error && <InlineError message={error} />}
        {savedMessage && <p role="status" className="mb-4 flex items-center gap-2 text-[12px] text-emerald-300"><HugeiconsIcon icon={Tick02Icon} size={14} aria-hidden="true" />{savedMessage}</p>}
        <form onSubmit={createSecret} className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_32px] gap-2 text-[12px] text-zinc-300" aria-hidden="true">
            <span>Key</span><span>Value</span><span />
          </div>
          <div className="space-y-2.5">
            {secretRows.map((row, index) => {
              const invalidKey = !!(row.key || row.value) && !/^[A-Z_][A-Z0-9_]{0,255}$/.test(row.key);
              const duplicateKey = (keyCounts.get(row.key) ?? 0) > 1;
              return (
                <div key={row.id} role="group" aria-label={`Secret ${index + 1}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_32px] items-start gap-2">
                  <WorkspaceInput
                    aria-label={`Secret key ${index + 1}`}
                    value={row.key}
                    onChange={(event) => updateSecretRow(row.id, "key", event.target.value.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, ""))}
                    onPaste={(event) => pasteSecrets(event, row.id, "key")}
                    placeholder="API_KEY"
                    maxLength={256}
                    spellCheck={false}
                    readOnly={savingSecret}
                    autoComplete="off"
                    aria-invalid={invalidKey || duplicateKey}
                    aria-describedby={invalidKey || duplicateKey ? `setup-key-error-${row.id}` : "setup-secrets-paste-hint"}
                    className="font-mono text-[13px]!"
                  />
                  <WorkspaceTextarea
                    aria-label={`Secret value ${index + 1}`}
                    value={row.value}
                    onChange={(event) => updateSecretRow(row.id, "value", event.target.value)}
                    onPaste={(event) => pasteSecrets(event, row.id, "value")}
                    placeholder="Secret value"
                    rows={Math.min(6, row.value.split("\n").length)}
                    wrap="off"
                    autoComplete="off"
                    readOnly={savingSecret}
                    spellCheck={false}
                    aria-describedby="setup-secrets-paste-hint"
                    className="ph-no-capture min-h-11! py-2.5 font-mono text-[13px]! leading-5!"
                  />
                  <Button type="button" variant="ghost" size="sm" aria-label={`Remove secret ${index + 1}`} disabled={savingSecret} className="mt-1.5 size-8 p-0!"
                    onClick={() => {
                      setSecretRows((current) => current.length === 1 ? createEmptySecretDraft() : current.filter((item) => item.id !== row.id));
                      setSavedMessage(null);
                      setError(null);
                    }}>
                    <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.7} aria-hidden="true" />
                  </Button>
                  {(invalidKey || duplicateKey) && <p id={`setup-key-error-${row.id}`} className="col-span-3 text-[11px] text-rose-300">{duplicateKey ? "Each key must be unique." : "Start the key with a letter or underscore."}</p>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button type="button" variant="ghost" size="sm" disabled={savingSecret} onClick={() => {
              setSecretRows((current) => [...current, { id: Math.max(...current.map((row) => row.id)) + 1, key: "", value: "" }]);
              setSavedMessage(null);
            }}><HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.7} aria-hidden="true" />Add another</Button>
            <Button type="submit" disabled={!validDraft || !selectedEnvironment} loading={savingSecret}>{populatedRows.length > 1 ? `Store ${populatedRows.length} encrypted secrets` : "Store encrypted secret"}</Button>
          </div>
        </form>
      </SetupStep>

      <SetupStep number="03" title="Use Secrets from your terminal">
        <p className="mb-4 text-[12px] leading-5 text-zinc-400">Choose this destination in the CLI, then add values without putting them in shell history.</p>
        <div className="space-y-2.5">
          <CodeBlock>{setupCliCommand("outray login")}</CodeBlock>
          <CodeBlock>{setupCliCommand(`outray secrets use --org ${orgSlug} --vault ${selectedProject?.slug || "my-app"} --env ${selectedEnvironment?.slug || "development"}`)}</CodeBlock>
          <CodeBlock>{setupCliCommand("outray secrets set API_KEY")}</CodeBlock>
        </div>
        <p className="mt-3 text-[11px] text-zinc-400">The final command prompts for the secret value privately.</p>
      </SetupStep>
    </SetupFlow>
  );
}

type VerificationState = "checking" | "waiting" | "complete";

function useProductVerification(
  orgSlug: string,
  product: SetupProduct,
  refresh: number,
  targetMonitorId?: string,
) {
  const verificationKey = `${orgSlug}:${product}:${refresh}:${targetMonitorId ?? ""}`;
  const [state, setState] = useState<VerificationState>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultKey, setResultKey] = useState(verificationKey);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setState("checking");
    setDetail(null);
    setError(null);
    setResultKey(verificationKey);

    const check = async () => {
      try {
        let complete = false;
        let nextDetail: string | null = null;

        if (product === "tunnels") {
          const response = await appClient.tunnels.list(orgSlug);
          if ("error" in response) throw new Error(response.error);
          const tunnel = response.tunnels[0];
          complete = !!tunnel;
          nextDetail = tunnel?.name || tunnel?.url || null;
        } else if (product === "observability") {
          const response = await fetch(
            `/api/${encodeURIComponent(orgSlug)}/observability/logs?range=1h&limit=1`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (!response.ok) throw new Error("Could not check telemetry");
          const payload = (await response.json()) as {
            services?: string[];
          };
          const service = payload.services?.[0];
          complete = !!service;
          nextDetail = service || null;
        } else if (product === "secrets") {
          const overview = await secretsClient.overview(orgSlug);
          complete = overview.secretCount > 0;
          nextDetail = complete
            ? `${overview.secretCount} ${overview.secretCount === 1 ? "secret" : "secrets"}`
            : null;
        } else {
          const response = await fetch(`/api/${encodeURIComponent(orgSlug)}/uptime/monitors`, { credentials: "same-origin", cache: "no-store" });
          if (!response.ok) throw new Error("Could not check Uptime monitors");
          const payload = (await response.json()) as { monitors?: Array<{ id: string; name: string; lastCheckedAt?: string | null }> };
          const firstChecked = payload.monitors?.find((monitor) =>
            (!targetMonitorId || monitor.id === targetMonitorId) && monitor.lastCheckedAt,
          );
          complete = !!firstChecked;
          nextDetail = firstChecked?.name || null;
        }

        if (cancelled) return;
        setError(null);
        setDetail(nextDetail);
        setState(complete ? "complete" : "waiting");
        if (!complete) timer = window.setTimeout(() => void check(), 4_000);
      } catch {
        if (cancelled) return;
        setError("Verification is temporarily unavailable. Retrying…");
        setState("waiting");
        timer = window.setTimeout(() => void check(), 4_000);
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orgSlug, product, refresh, targetMonitorId, verificationKey]);

  return resultKey === verificationKey ? { state, detail, error } : { state: "checking" as const, detail: null, error: null };
}

function VerificationPanel({
  config,
  orgSlug,
  state,
  detail,
  error,
}: {
  config: (typeof productConfig)[SetupProduct];
  orgSlug: string;
  state: VerificationState;
  detail: string | null;
  error: string | null;
}) {
  const complete = state === "complete";
  const checking = state === "checking";

  return (
    <aside aria-label="Connection verification" className="min-w-0 rounded-xl border border-white/[0.08] bg-[#111112] p-4 lg:sticky lg:top-6">
      <h2 className="text-[14px] font-medium text-zinc-200">Connection</h2>
      <div role="status" aria-live="polite" className="mt-4">
        <div className="flex items-start gap-2.5">
          <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center ${complete ? "text-emerald-400" : "text-zinc-500"}`} aria-hidden="true">
            {complete || checking ? (
              <HugeiconsIcon icon={complete ? Tick02Icon : Loading03Icon} size={16} strokeWidth={1.8} className={checking ? "animate-spin motion-reduce:animate-none" : ""} />
            ) : (
              <span className="size-1.5 rounded-full bg-zinc-500" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-[12px] leading-5 text-zinc-200">{complete ? config.completeLabel : checking ? "Checking your workspace" : config.waitingLabel}</p>
            <p className="mt-1 break-words text-[11px] leading-5 text-zinc-400">{complete ? detail || "Connection verified." : "Keep this page open. We’ll detect the connection automatically."}</p>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 text-[11px] leading-5 text-amber-300/80">{error}</p>}
      <div className="mt-4 border-t border-white/[0.07] pt-4">
        <p className="text-[11px] leading-5 text-zinc-400">{complete ? "You're ready to explore your workspace." : "You can open the console now and finish setup later."}</p>
        <Link
          to={config.consoleTo}
          params={{ orgSlug }}
          className={`mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border px-3.5 text-[12px] transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${complete ? "border-white bg-white text-black hover:bg-zinc-200" : "border-white/[0.12] bg-white/[0.055] text-zinc-200 hover:bg-white/[0.09]"}`}
        >
          {complete ? "Continue to console" : "Open console"}
          <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </div>
    </aside>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 rounded-lg border border-rose-400/15 bg-rose-400/[0.035] px-3 py-2.5 text-[12px] leading-5 text-rose-300/80">
      {message}
    </div>
  );
}
