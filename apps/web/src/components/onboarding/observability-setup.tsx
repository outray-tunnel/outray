import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HugeiconsIcon } from "@hugeicons/react";
import Key01Icon from "@hugeicons-pro/core-stroke-rounded/Key01Icon";
import { CreateTokenModal } from "@/components/create-token-modal";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/ui/select";
import { SetupFlow, SetupStep, SetupCodeBlock as CodeBlock } from "./setup-ui";

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

export function ObservabilitySetup({
  orgSlug,
  onRecheck,
  buttonSize = "md",
  tokenModalOpen: controlledTokenModalOpen,
  onTokenModalOpenChange,
}: {
  orgSlug: string;
  onRecheck: () => void;
  buttonSize?: "sm" | "md";
  tokenModalOpen?: boolean;
  onTokenModalOpenChange?: (open: boolean) => void;
}) {
  const [internalTokenModalOpen, setInternalTokenModalOpen] = useState(false);
  const tokenModalOpen = controlledTokenModalOpen ?? internalTokenModalOpen;
  const tokenTrigger = useRef<HTMLButtonElement>(null);
  const wasTokenModalOpen = useRef(false);
  useEffect(() => {
    if (wasTokenModalOpen.current && !tokenModalOpen) tokenTrigger.current?.focus();
    wasTokenModalOpen.current = tokenModalOpen;
  }, [tokenModalOpen]);
  const setTokenModalOpen = (open: boolean) => {
    setInternalTokenModalOpen(open);
    onTokenModalOpenChange?.(open);
  };
  const [framework, setFramework] = useState<ObservabilityFramework>("node");
  const selectedFramework = observabilityFrameworks[framework];

  return (
    <>
      <SetupFlow steps={[{ id: "01", title: "Ingest token" }, { id: "02", title: "Install SDK" }, { id: "03", title: "Configure" }]} onRecheck={onRecheck} buttonSize={buttonSize}>
        <SetupStep number="01" title="Create an ingest token">
          <p className="mb-4 text-[12px] leading-5 text-zinc-400">Create a server-side credential scoped to sending telemetry. Keep it out of browser code and source control.</p>
          <Button ref={tokenTrigger} variant="secondary" size={buttonSize} onClick={() => setTokenModalOpen(true)} aria-haspopup="dialog">
            <HugeiconsIcon icon={Key01Icon} size={14} strokeWidth={1.8} />
            Create ingest token
          </Button>
          <p className="mt-3 text-[11px] leading-5 text-zinc-400">You can create and revoke tokens later in workspace settings.</p>
        </SetupStep>
        <SetupStep number="02" title="Install the SDK">
          <p className="mb-4 text-[12px] leading-5 text-zinc-400">Choose the adapter for your application. It adds route-aware traces and metrics on top of the core SDK.</p>
          <p className="mb-1.5 text-[12px] text-zinc-300">Framework</p>
          <div className="mb-4 grid items-center gap-3 sm:grid-cols-[240px_minmax(0,1fr)]">
            <Select
              ariaLabel="Framework"
              value={framework}
              onChange={(value) => {
                if (value in observabilityFrameworks) setFramework(value as ObservabilityFramework);
              }}
              icon={<img src={selectedFramework.logo} alt="" draggable={false} className="size-4 object-contain" />}
              options={Object.entries(observabilityFrameworks).map(([value, option]) => ({
                value, label: option.label, description: option.description,
                icon: <img src={option.logo} alt="" draggable={false} className="size-4 object-contain" />,
              }))}
              triggerClassName="h-9 rounded-lg focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none"
              menuClassName="[&_.text-zinc-700]:text-zinc-400"
            />
            <p className="text-[11px] leading-5 text-zinc-400">{selectedFramework.description}</p>
          </div>
          <CodeBlock>{`npm install ${selectedFramework.packageName}`}</CodeBlock>
        </SetupStep>
        <SetupStep number="03" title={`Configure ${selectedFramework.label}`}>
          <p className="mb-4 text-[12px] leading-5 text-zinc-400">Add this to <span className="font-mono text-zinc-300">{selectedFramework.fileName}</span>, replace the token placeholder, then start your application.</p>
          <CodeBlock multiline fileName={selectedFramework.fileName}>{selectedFramework.code}</CodeBlock>
          <p className="mt-3 text-[11px] leading-5 text-zinc-400">Start instrumentation before importing your application. Verification will pick up its first telemetry automatically.</p>
        </SetupStep>
      </SetupFlow>

      <DialogPrimitive.Root open={tokenModalOpen} onOpenChange={setTokenModalOpen}>
        {tokenModalOpen && <DialogPrimitive.Content
          aria-label="Create ingest token"
          aria-describedby={undefined}
          className="outline-none"
          onEscapeKeyDown={(event) => {
            if (typeof Element !== "undefined" && event.target instanceof Element && event.target.closest('[aria-haspopup="listbox"][aria-expanded="true"]')) {
              event.preventDefault();
            }
          }}
        >
          <DialogPrimitive.Title className="sr-only">Create ingest token</DialogPrimitive.Title>
          <CreateTokenModal
            isOpen={tokenModalOpen}
            onClose={() => setTokenModalOpen(false)}
            orgSlug={orgSlug}
            defaultName="Observability ingest"
            defaultScopes={["observability:write"]}
            actionSize="sm"
          />
        </DialogPrimitive.Content>}
      </DialogPrimitive.Root>
    </>
  );
}
