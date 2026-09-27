import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import ArrowLeft01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowLeft01Icon";
import ArrowRight01Icon from "@hugeicons-pro/core-stroke-rounded/ArrowRight01Icon";
import CommandLineIcon from "@hugeicons-pro/core-stroke-rounded/CommandLineIcon";
import Cone01Icon from "@hugeicons-pro/core-stroke-rounded/Cone01Icon";
import Copy01Icon from "@hugeicons-pro/core-stroke-rounded/Copy01Icon";
import Folder01Icon from "@hugeicons-pro/core-stroke-rounded/Folder01Icon";
import Key01Icon from "@hugeicons-pro/core-stroke-rounded/Key01Icon";
import Loading03Icon from "@hugeicons-pro/core-stroke-rounded/Loading03Icon";
import LockPasswordIcon from "@hugeicons-pro/core-stroke-rounded/LockPasswordIcon";
import Pulse02Icon from "@hugeicons-pro/core-stroke-rounded/Pulse02Icon";
import Tick02Icon from "@hugeicons-pro/core-stroke-rounded/Tick02Icon";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { CreateTokenModal } from "@/components/create-token-modal";
import { Select } from "@/components/ui";
import { appClient } from "@/lib/app-client";
import {
  secretsClient,
  type SecretProject,
} from "@/lib/secrets-client";

type SetupProduct = "tunnels" | "observability" | "secrets";

interface SetupSearch {
  product: SetupProduct;
}

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
      | "/$orgSlug"
      | "/$orgSlug/observability"
      | "/$orgSlug/secrets";
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
    consoleTo: "/$orgSlug",
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
};

function parseProduct(value: unknown): SetupProduct {
  return value === "observability" || value === "secrets"
    ? value
    : "tunnels";
}

export const Route = createFileRoute("/$orgSlug/setup")({
  validateSearch: (search: Record<string, unknown>): SetupSearch => ({
    product: parseProduct(search.product),
  }),
  head: () => ({
    meta: [{ title: "Set up OutRay" }],
  }),
  component: ProductSetup,
});

function ProductSetup() {
  const { orgSlug } = Route.useParams();
  const { product } = Route.useSearch();
  const config = productConfig[product];
  const [verificationRefresh, setVerificationRefresh] = useState(0);
  const verification = useProductVerification(
    orgSlug,
    product,
    verificationRefresh,
  );

  return (
    <main className="min-h-screen bg-[#080808] text-white selection:bg-white/15">
      <SetupHeader orgSlug={orgSlug} />

      <div className="mx-auto w-full max-w-[1180px] px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <Link
          to="/$orgSlug/get-started"
          params={{ orgSlug }}
          className="inline-flex items-center gap-2 text-[12px] text-zinc-600 transition-colors hover:text-zinc-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.8} />
          Choose another product
        </Link>

        <div className="mt-8 max-w-2xl">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-zinc-400">
            <HugeiconsIcon icon={config.icon} size={23} strokeWidth={1.7} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            {config.name} setup
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] text-zinc-100 sm:text-[42px]">
            {config.title}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-zinc-500">
            {config.description}
          </p>
        </div>

        <div className="mt-10 grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section className="overflow-hidden rounded-[24px] border border-white/[0.09] bg-[#0b0b0b]">
            {product === "tunnels" ? (
              <TunnelSetup orgSlug={orgSlug} />
            ) : product === "observability" ? (
              <ObservabilitySetup orgSlug={orgSlug} />
            ) : (
              <SecretsSetup
                orgSlug={orgSlug}
                onSecretCreated={() =>
                  setVerificationRefresh((value) => value + 1)
                }
              />
            )}
          </section>

          <VerificationPanel
            config={config}
            orgSlug={orgSlug}
            state={verification.state}
            detail={verification.detail}
            error={verification.error}
          />
        </div>
      </div>
    </main>
  );
}

function SetupHeader({ orgSlug }: { orgSlug: string }) {
  return (
    <header className="border-b border-white/[0.08]">
      <div className="mx-auto flex h-[76px] w-full max-w-[1180px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="" className="size-9 object-contain" />
          <span className="text-[18px] font-semibold tracking-[-0.025em]">
            OutRay
          </span>
        </div>
        <span className="max-w-48 truncate rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 font-mono text-[11px] text-zinc-500 sm:max-w-64">
          {orgSlug}
        </span>
      </div>
    </header>
  );
}

function TunnelSetup({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="divide-y divide-white/[0.075]">
      <SetupStep number="01" title="Install the CLI">
        <p className="mb-4 text-[13px] leading-6 text-zinc-600">
          Install OutRay globally so the tunnel command is available from any
          project.
        </p>
        <CodeBlock>npm install -g outray</CodeBlock>
      </SetupStep>
      <SetupStep number="02" title="Sign in">
        <p className="mb-4 text-[13px] leading-6 text-zinc-600">
          Authenticate the CLI with the account that owns this workspace.
        </p>
        <CodeBlock>outray login</CodeBlock>
      </SetupStep>
      <SetupStep number="03" title="Start a tunnel">
        <p className="mb-4 text-[13px] leading-6 text-zinc-600">
          Replace 3000 with the port your local service uses. This page will
          detect the connection automatically.
        </p>
        <CodeBlock>{`outray 3000 --org ${orgSlug}`}</CodeBlock>
      </SetupStep>
    </div>
  );
}

type ObservabilityFramework =
  | "node"
  | "express"
  | "nestjs"
  | "nextjs"
  | "hono"
  | "tanstack-start";

interface FrameworkSetup {
  label: string;
  description: string;
  packageName: string;
  fileName: string;
  code: string;
  logo: string;
}

const observabilityFrameworks: Record<
  ObservabilityFramework,
  FrameworkSetup
> = {
  node: {
    label: "Node.js",
    description: "Generic Node servers and workers",
    packageName: "@outray/observability",
    fileName: "bootstrap.ts",
    logo: "https://svgl.app/library/nodejs.svg",
    code: `import { startOutrayObservability } from "@outray/observability";

startOutrayObservability({
  apiKey: "outray_your_ingest_token",
  serviceName: "my-service",
  environment: "development",
  captureConsole: true,
});

await import("./server.js");`,
  },
  express: {
    label: "Express",
    description: "Express applications and APIs",
    packageName: "@outray/express",
    fileName: "server.ts",
    logo: "https://svgl.app/library/expressjs_dark.svg",
    code: `import express from "express";
import { registerOutrayObservability } from "@outray/express";

const app = express();

registerOutrayObservability(app, {
  apiKey: "outray_your_ingest_token",
  serviceName: "my-express-api",
  environment: "development",
  captureConsole: true,
});

app.use(express.json());
app.listen(3000);`,
  },
  nestjs: {
    label: "NestJS",
    description: "NestJS with the Express adapter",
    packageName: "@outray/nest",
    fileName: "main.ts",
    logo: "https://svgl.app/library/nestjs.svg",
    code: `import { NestFactory } from "@nestjs/core";
import { registerOutrayObservability } from "@outray/nest";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  registerOutrayObservability(app, {
    apiKey: "outray_your_ingest_token",
    serviceName: "my-nest-api",
    environment: "development",
    captureConsole: true,
  });

  await app.listen(3000);
}

void bootstrap();`,
  },
  nextjs: {
    label: "Next.js",
    description: "Next.js App Router on the Node runtime",
    packageName: "@outray/next",
    fileName: "instrumentation.ts",
    logo: "https://svgl.app/library/nextjs_icon_dark.svg",
    code: `import { registerOutrayObservability } from "@outray/next/observability";

export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  registerOutrayObservability({
    apiKey: "outray_your_ingest_token",
    serviceName: "my-next-app",
    environment: "development",
    captureConsole: true,
  });
}`,
  },
  hono: {
    label: "Hono",
    description: "Hono applications on supported server runtimes",
    packageName: "@outray/hono",
    fileName: "server.ts",
    logo: "https://svgl.app/library/hono.svg",
    code: `import { Hono } from "hono";
import outray from "@outray/hono";

const app = new Hono();
const telemetry = outray({
  apiKey: "outray_your_ingest_token",
  serviceName: "my-hono-api",
  environment: "development",
  captureConsole: true,
});

app.use("*", telemetry.middleware);

export default app;`,
  },
  "tanstack-start": {
    label: "TanStack Start",
    description: "TanStack Start with its Node server entry",
    packageName: "@outray/tanstack-start",
    fileName: "src/server.ts",
    logo: "https://svgl.app/library/tanstack_dark.svg",
    code: `import { createOutrayTanStackServerEntry } from "@outray/tanstack-start/server";

export default createOutrayTanStackServerEntry({
  apiKey: "outray_your_ingest_token",
  serviceName: "my-tanstack-app",
  environment: "development",
  captureConsole: true,
});`,
  },
};

function ObservabilitySetup({ orgSlug }: { orgSlug: string }) {
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [framework, setFramework] =
    useState<ObservabilityFramework>("node");
  const selectedFramework = observabilityFrameworks[framework];

  return (
    <>
      <div className="divide-y divide-white/[0.075]">
        <SetupStep number="01" title="Create an ingest token">
          <p className="mb-4 text-[13px] leading-6 text-zinc-600">
            Create a server-side credential with only the permission required
            to send telemetry.
          </p>
          <button
            type="button"
            onClick={() => setTokenModalOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 text-[12px] font-medium text-zinc-300 transition-colors hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white"
          >
            <HugeiconsIcon icon={Key01Icon} size={15} strokeWidth={1.8} />
            Create observability token
          </button>
        </SetupStep>
        <SetupStep number="02" title="Choose your framework">
          <p className="mb-4 text-[13px] leading-6 text-zinc-600">
            Use the framework adapter when one is available. It adds route-aware
            request traces and metrics on top of the core SDK.
          </p>
          <div
            role="tablist"
            aria-label="Framework"
            className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/[0.08] bg-black/20 p-1.5 sm:grid-cols-6"
          >
            {Object.entries(observabilityFrameworks).map(
              ([value, option]) => {
                const selected = framework === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() =>
                      setFramework(value as ObservabilityFramework)
                    }
                    className={`flex min-h-[82px] min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors ${
                      selected
                        ? "border-white/[0.14] bg-white/[0.08] text-zinc-100"
                        : "border-transparent text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-300"
                    }`}
                  >
                    <img
                      src={option.logo}
                      alt=""
                      draggable={false}
                      className="size-7 object-contain"
                    />
                    <span className="w-full truncate text-[10px] font-medium">
                      {option.label}
                    </span>
                  </button>
                );
              },
            )}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-zinc-700">
            {selectedFramework.description}
          </p>
          <div className="mt-3">
            <CodeBlock>{`npm install ${selectedFramework.packageName}`}</CodeBlock>
          </div>
        </SetupStep>
        <SetupStep
          number="03"
          title={`Configure ${selectedFramework.label}`}
        >
          <p className="mb-4 text-[13px] leading-6 text-zinc-600">
            Add this to{" "}
            <span className="font-mono text-zinc-400">
              {selectedFramework.fileName}
            </span>
            . Keep the token in server-only code or load it from a secret
            provider.
          </p>
          <CodeBlock multiline>{selectedFramework.code}</CodeBlock>
        </SetupStep>
      </div>

      <CreateTokenModal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        orgSlug={orgSlug}
        defaultName="Observability ingest"
        defaultScopes={["observability:write"]}
      />
    </>
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
  const [secretKey, setSecretKey] = useState("");
  const [secretValue, setSecretValue] = useState("");
  const [creatingVault, setCreatingVault] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const nextProjects = await secretsClient.projects(orgSlug);
      setProjects(nextProjects);
      setSelectedProjectSlug((current) => current || nextProjects[0]?.slug || "");
      setError(null);
    } catch (requestError) {
      setError(
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
  );

  useEffect(() => {
    if (!selectedProject) {
      setSelectedEnvironmentSlug("");
      return;
    }
    if (
      selectedProject.environments.some(
        (environment) => environment.slug === selectedEnvironmentSlug,
      )
    ) {
      return;
    }
    const preferred =
      selectedProject.environments.find(
        (environment) => environment.slug === "development",
      ) || selectedProject.environments[0];
    setSelectedEnvironmentSlug(preferred?.slug || "");
  }, [selectedEnvironmentSlug, selectedProject]);

  const createVault = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!vaultName.trim()) return;
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
      !selectedProject ||
      !selectedEnvironment ||
      !/^[A-Z_][A-Z0-9_]*$/.test(secretKey)
    )
      return;
    setSavingSecret(true);
    setError(null);
    try {
      await secretsClient.createSecret(
        orgSlug,
        selectedProject.slug,
        selectedEnvironment.slug,
        {
          key: secretKey.trim(),
          value: secretValue,
          environmentSlugs: [selectedEnvironment.slug],
          expectedRevisions: {
            [selectedEnvironment.slug]: selectedEnvironment.revision,
          },
          expectedRevision: selectedEnvironment.revision,
        },
      );
      setSecretValue("");
      setSecretKey("");
      setProjects((current) =>
        current.map((project) =>
          project.slug === selectedProject.slug
            ? {
                ...project,
                secretCount: project.secretCount + 1,
                environments: project.environments.map((environment) =>
                  environment.slug === selectedEnvironment.slug
                    ? {
                        ...environment,
                        revision: environment.revision + 1,
                        secretCount: environment.secretCount + 1,
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
          : "The secret could not be stored.",
      );
    } finally {
      setSavingSecret(false);
    }
  };

  if (loadingProjects) {
    return (
      <div className="space-y-5 p-6 sm:p-8" aria-busy="true">
        <div className="h-4 w-44 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-12 animate-pulse rounded-2xl bg-white/[0.035]" />
        <div className="h-32 animate-pulse rounded-2xl bg-white/[0.025]" />
      </div>
    );
  }

  if (!projects.length) {
    return (
      <SetupStep number="01" title="Create a vault">
        <p className="mb-5 text-[13px] leading-6 text-zinc-600">
          A vault represents one application or service. Development, staging,
          and production environments will be created automatically.
        </p>
        {error && <InlineError message={error} />}
        <form onSubmit={createVault} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={vaultName}
            onChange={(event) => setVaultName(event.target.value)}
            placeholder="My application"
            autoFocus
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-black/25 px-4 text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-white/[0.2]"
          />
          <button
            type="submit"
            disabled={!vaultName.trim() || creatingVault}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[12px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {creatingVault && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={15}
                strokeWidth={1.8}
                className="animate-spin"
              />
            )}
            Create vault
          </button>
        </form>
      </SetupStep>
    );
  }

  return (
    <div className="divide-y divide-white/[0.075]">
      <SetupStep number="01" title="Choose where to store it">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            ariaLabel="Vault"
            value={selectedProjectSlug}
            onChange={setSelectedProjectSlug}
            options={projects.map((project) => ({
              value: project.slug,
              label: project.name,
              description: `${project.secretCount} secrets`,
            }))}
            icon={
              <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.7} />
            }
            triggerClassName="h-11 rounded-xl"
          />
          <Select
            ariaLabel="Environment"
            value={selectedEnvironmentSlug}
            onChange={setSelectedEnvironmentSlug}
            options={environments.map((environment) => ({
              value: environment.slug,
              label: environment.name,
              description: `${environment.secretCount} secrets`,
            }))}
            disabled={!environments.length}
            triggerClassName="h-11 rounded-xl"
          />
        </div>
      </SetupStep>

      <SetupStep number="02" title="Add a secret in the console">
        <p className="mb-5 text-[13px] leading-6 text-zinc-600">
          The plaintext value is sent only when you submit and is never returned
          by metadata requests.
        </p>
        {error && <InlineError message={error} />}
        <form onSubmit={createSecret} className="space-y-3">
          <input
            value={secretKey}
            onChange={(event) =>
              setSecretKey(
                event.target.value
                  .toUpperCase()
                  .replace(/\s+/g, "_")
                  .replace(/[^A-Z0-9_]/g, ""),
              )
            }
            placeholder="DATABASE_URL"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-white/[0.1] bg-black/25 px-4 font-mono text-[13px] text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-white/[0.2]"
          />
          {secretKey && !/^[A-Z_][A-Z0-9_]*$/.test(secretKey) && (
            <p className="text-[11px] leading-5 text-red-400/80">
              The first character must be a letter or underscore.
            </p>
          )}
          <textarea
            value={secretValue}
            onChange={(event) => setSecretValue(event.target.value)}
            placeholder="Secret value"
            rows={4}
            autoComplete="off"
            spellCheck={false}
            className="ph-no-capture w-full resize-y rounded-xl border border-white/[0.1] bg-black/25 px-4 py-3 font-mono text-[13px] leading-6 text-zinc-200 outline-none transition-colors placeholder:text-zinc-700 focus:border-white/[0.2]"
          />
          <button
            type="submit"
            disabled={
              !/^[A-Z_][A-Z0-9_]*$/.test(secretKey) ||
              !selectedEnvironment ||
              savingSecret
            }
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[12px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {savingSecret && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={15}
                strokeWidth={1.8}
                className="animate-spin"
              />
            )}
            Store encrypted secret
          </button>
        </form>
      </SetupStep>

      <SetupStep number="03" title="Or add it with the CLI">
        <p className="mb-4 text-[13px] leading-6 text-zinc-600">
          The final command prompts for the value without placing it in your
          shell history.
        </p>
        <div className="space-y-2.5">
          <CodeBlock>outray login</CodeBlock>
          <CodeBlock>{`outray secrets use --org ${orgSlug} --vault ${selectedProject?.slug || "my-app"} --env ${selectedEnvironment?.slug || "development"}`}</CodeBlock>
          <CodeBlock>outray secrets set API_KEY</CodeBlock>
        </div>
      </SetupStep>
    </div>
  );
}

function SetupStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="font-mono text-[10px] text-zinc-700">{number}</span>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em] text-zinc-200">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function CodeBlock({
  children,
  multiline = false,
}: {
  children: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <div className="group/code flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/30 px-4 py-3.5">
      <HugeiconsIcon
        icon={CommandLineIcon}
        size={15}
        strokeWidth={1.7}
        className="mt-0.5 shrink-0 text-zinc-700"
      />
      <code
        className={`min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-[12px] text-zinc-400 ${
          multiline ? "leading-6" : "leading-5"
        }`}
      >
        {children}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
          copied
            ? "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-400"
            : "border-transparent text-zinc-700 hover:border-white/[0.08] hover:bg-white/[0.04] hover:text-zinc-300"
        }`}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          size={14}
          strokeWidth={1.8}
        />
      </button>
    </div>
  );
}

type VerificationState = "checking" | "waiting" | "complete";

function useProductVerification(
  orgSlug: string,
  product: SetupProduct,
  refresh: number,
) {
  const [state, setState] = useState<VerificationState>("checking");
  const [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    setState("checking");
    setDetail(null);
    setError(null);

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
        } else {
          const overview = await secretsClient.overview(orgSlug);
          complete = overview.secretCount > 0;
          nextDetail = complete
            ? `${overview.secretCount} ${overview.secretCount === 1 ? "secret" : "secrets"}`
            : null;
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
  }, [orgSlug, product, refresh]);

  return { state, detail, error };
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

  return (
    <aside className="rounded-[22px] border border-white/[0.09] bg-[#0b0b0b] p-6 lg:sticky lg:top-8">
      <div
        className={`flex size-10 items-center justify-center rounded-full border ${
          complete
            ? "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-400"
            : "border-white/[0.09] bg-white/[0.035] text-zinc-600"
        }`}
      >
        <HugeiconsIcon
          icon={complete ? Tick02Icon : Loading03Icon}
          size={18}
          strokeWidth={1.8}
          className={complete ? "" : "animate-spin"}
        />
      </div>
      <p className="mt-5 text-[14px] font-medium text-zinc-200">
        {complete ? config.completeLabel : config.waitingLabel}
      </p>
      <p className="mt-2 text-[12px] leading-5 text-zinc-600">
        {complete
          ? detail || "OutRay verified the setup successfully."
          : "You can leave this page open. Verification runs automatically every few seconds."}
      </p>
      {error && <p className="mt-3 text-[11px] text-amber-500/70">{error}</p>}

      <Link
        to={config.consoleTo}
        params={{ orgSlug }}
        className={`mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-semibold transition-colors ${
          complete
            ? "bg-white text-black hover:bg-zinc-200"
            : "border border-white/[0.09] bg-white/[0.035] text-zinc-400 hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-zinc-200"
        }`}
      >
        {complete ? "Continue to console" : "Skip verification"}
        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.8} />
      </Link>
    </aside>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl border border-red-400/15 bg-red-400/[0.045] px-4 py-3 text-[12px] leading-5 text-red-300/80">
      {message}
    </div>
  );
}
