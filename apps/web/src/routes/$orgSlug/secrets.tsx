import { createFileRoute } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Clock01Icon,
  Key01Icon,
  SecurityLockIcon,
  ShieldKeyIcon,
  UserGroupIcon,
} from "@hugeicons-pro/core-stroke-rounded";

export const Route = createFileRoute("/$orgSlug/secrets")({
  head: () => ({
    meta: [{ title: "Secrets - OutRay" }],
  }),
  component: SecretsView,
});

const summary = [
  { label: "Stored secrets", value: "0", detail: "Encrypted at rest" },
  { label: "Environments", value: "0", detail: "No environments yet" },
  { label: "Team access", value: "0", detail: "No policies assigned" },
  { label: "Last rotation", value: "Never", detail: "Automatic rotation planned" },
];

const capabilities = [
  {
    name: "Encrypted vaults",
    description: "Keep application credentials isolated by project and environment.",
    icon: ShieldKeyIcon,
  },
  {
    name: "Scoped access",
    description: "Give services and teammates only the secrets they need.",
    icon: UserGroupIcon,
  },
  {
    name: "Runtime delivery",
    description: "Inject configuration without committing values to source control.",
    icon: Key01Icon,
  },
];

function SecretsView() {
  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="flex flex-col gap-5 border-b border-white/[0.07] pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 flex items-center gap-2 text-accent">
            <HugeiconsIcon
              icon={SecurityLockIcon}
              size={17}
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em]">
              Preview
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.035em] text-white">
            Secrets
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
            Securely store, organize, and deliver sensitive configuration to
            applications across every environment.
          </p>
        </div>
        <p className="flex items-center gap-2 text-xs text-zinc-600">
          <HugeiconsIcon
            icon={Clock01Icon}
            size={14}
            strokeWidth={1.7}
            aria-hidden="true"
          />
          Secret creation is coming soon
        </p>
      </header>

      <section
        className="grid border-y border-white/[0.07] sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]"
        aria-label="Secrets summary"
      >
        {summary.map((item) => (
          <div key={item.label} className="px-1 py-5 lg:px-6 first:pl-1">
            <p className="text-[11px] text-zinc-600">{item.label}</p>
            <p className="mt-2 text-2xl font-medium tracking-[-0.04em] text-zinc-200">
              {item.value}
            </p>
            <p className="mt-1 text-[11px] text-zinc-700">{item.detail}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-5">
          <h2 className="text-sm font-medium text-zinc-200">
            Built for application secrets
          </h2>
          <p className="mt-1 text-xs text-zinc-600">
            The foundation planned for the Secrets preview.
          </p>
        </div>
        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {capabilities.map((capability) => (
            <div
              key={capability.name}
              className="flex items-start gap-4 py-5"
            >
              <span className="mt-0.5 text-zinc-500">
                <HugeiconsIcon
                  icon={capability.icon}
                  size={17}
                  strokeWidth={1.7}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-zinc-300">
                  {capability.name}
                </h3>
                <p className="mt-1 text-xs leading-5 text-zinc-600">
                  {capability.description}
                </p>
              </div>
              <span className="rounded-full bg-white/[0.04] px-2 py-1 text-[9px] uppercase tracking-[0.09em] text-zinc-700">
                Soon
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
