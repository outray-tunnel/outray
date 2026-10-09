import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import ArrowRight01Icon from "@outray/icons/stroke/ArrowRight01Icon";
import Cone01Icon from "@outray/icons/stroke/Cone01Icon";
import LockPasswordIcon from "@outray/icons/stroke/LockPasswordIcon";
import Pulse02Icon from "@outray/icons/stroke/Pulse02Icon";
import HeartPulseIcon from "@outray/icons/stroke/HeartPulseIcon";
import Tick02Icon from "@outray/icons/stroke/Tick02Icon";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/$orgSlug/get-started")({
  head: () => ({
    meta: [{ title: "Choose a product - OutRay" }],
  }),
  component: GetStarted,
});

interface ProductChoice {
  id: "tunnels" | "observability" | "secrets" | "uptime";
  name: string;
  description: string;
  detail: string;
  action: string;
  icon: IconSvgElement;
}

const products: ProductChoice[] = [
  {
    id: "tunnels",
    name: "Tunnels",
    description: "Put a local service on the internet with a secure public URL.",
    detail: "Install the CLI and start your first tunnel in a few commands.",
    action: "Set up Tunnels",
    icon: Cone01Icon,
  },
  {
    id: "observability",
    name: "Observability",
    description: "Understand your applications through requests, traces, logs, and metrics.",
    detail: "Instrument a service and see what it is doing in production.",
    action: "Set up Observability",
    icon: Pulse02Icon,
  },
  {
    id: "secrets",
    name: "Secrets",
    description: "Keep environment variables encrypted and deliver them at runtime.",
    detail: "Create a vault, add environments, and inject secrets with the CLI.",
    action: "Set up Secrets",
    icon: LockPasswordIcon,
  },
  {
    id: "uptime",
    name: "Uptime",
    description: "Check public endpoints and keep your team informed when they go down.",
    detail: "Create a monitor, then build a public status page from its checks.",
    action: "Set up Uptime",
    icon: HeartPulseIcon,
  },
];

function GetStarted() {
  const { orgSlug } = Route.useParams();

  return (
    <main className="min-h-screen bg-[#080808] text-white selection:bg-white/15">
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

      <div className="mx-auto flex w-full max-w-[1180px] flex-col justify-center px-5 py-12 sm:px-8 sm:py-16 lg:min-h-[calc(100vh-76px)] lg:py-20">
        <div className="max-w-2xl">
          <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400">
            <HugeiconsIcon icon={Tick02Icon} size={22} strokeWidth={1.9} />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Workspace ready
          </p>
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.08] tracking-[-0.045em] text-zinc-100 sm:text-[42px]">
            What do you want to do first?
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-7 text-zinc-500">
            Pick a product to start setting up. Every product is available in
            this workspace, so this choice does not lock you in.
          </p>
        </div>

        <section
          className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
          aria-label="Choose an OutRay product"
        >
          {products.map((product) => (
            <Link
              key={product.name}
              to="/$orgSlug/setup"
              params={{ orgSlug }}
              search={{ product: product.id }}
              className="group flex min-h-[310px] flex-col rounded-[24px] border border-white/[0.09] bg-white/[0.018] p-6 transition-[background-color,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-white/[0.035] sm:p-7"
            >
              <span className="flex size-11 items-center justify-center rounded-2xl border border-white/[0.09] bg-white/[0.035] text-zinc-500 transition-colors group-hover:border-white/[0.14] group-hover:text-zinc-200">
                <HugeiconsIcon
                  icon={product.icon}
                  size={21}
                  strokeWidth={1.65}
                  aria-hidden="true"
                />
              </span>

              <div className="mt-8">
                <h2 className="text-[19px] font-semibold tracking-[-0.025em] text-zinc-100">
                  {product.name}
                </h2>
                <p className="mt-3 text-[14px] leading-6 text-zinc-400">
                  {product.description}
                </p>
                <p className="mt-3 text-[12px] leading-5 text-zinc-600">
                  {product.detail}
                </p>
              </div>

              <span className="mt-auto flex items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[13px] font-medium text-zinc-300">
                {product.action}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  size={16}
                  strokeWidth={1.8}
                  className="text-zinc-600 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-zinc-300"
                  aria-hidden="true"
                />
              </span>
            </Link>
          ))}
        </section>

        <p className="mt-7 text-[12px] leading-5 text-zinc-700">
          Not sure?{" "}
          <Link
            to="/$orgSlug/tunnel"
            params={{ orgSlug }}
            className="text-zinc-500 transition-colors hover:text-zinc-200"
          >
            Skip and continue to console
          </Link>
        </p>
      </div>
    </main>
  );
}
