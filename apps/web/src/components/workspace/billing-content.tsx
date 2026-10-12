import type { ReactNode } from "react";
import { ArrowUpRight, CreditCard, LockKeyhole } from "lucide-react";
import { Button as ArcButton } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SUBSCRIPTION_PLANS, type BillingInterval, type SubscriptionPlan } from "@/lib/subscription-plans";
import { billingUsageSummary, formatBillingBytes, formatBillingDate, formatBillingPrice, knownBillingPlan, type BillingCurrency, type BillingSubscription, type BillingUsage, type PaidBillingPlan } from "./billing-state";

const billingContentClassName = "flex flex-col gap-[26px] text-[13px] text-zinc-300";
const billingPanelClassName = "overflow-hidden rounded-[14px] border border-white/[.08] bg-[#0b0b0b]";
const billingOverviewClassName = "flex flex-wrap items-center gap-5 p-5 max-[520px]:gap-[15px] max-[520px]:p-[17px]";
const planIdentityClassName = "flex min-w-[180px] flex-1 items-center gap-3 max-[520px]:basis-full";
const planNameClassName = "flex flex-wrap items-center gap-2.5 [&_h2]:m-0 [&_h2]:text-[17px] [&_h2]:font-medium [&_h2]:tracking-[-.02em] [&_h2]:text-zinc-100";
const currentPriceClassName = "flex items-baseline gap-1.25 [&_strong]:text-[23px] [&_strong]:font-medium [&_strong]:tracking-[-.035em] [&_strong]:text-zinc-100 [&>span]:text-[11px] [&>span]:text-zinc-500 max-[520px]:flex-1";
const billingDetailsClassName = "m-0 flex flex-wrap gap-[30px] px-5 pb-[17px] [&_div]:flex [&_div]:gap-2 [&_div]:text-[11px] [&_dt]:text-zinc-500 [&_dd]:m-0 [&_dd]:text-zinc-400 max-[520px]:flex-col max-[520px]:gap-2.25 max-[520px]:px-[17px]";
const usageHeaderClassName = "flex flex-wrap items-baseline gap-2.5 border-t border-white/[.08] px-5 pt-3.5 [&_h3]:m-0 [&_h3]:text-xs [&_h3]:font-medium [&_h3]:text-zinc-300 [&_span]:text-[11px] [&_span]:text-zinc-500";
const metricClassName = "min-w-0 px-5 pt-3.5 pb-[18px] max-[520px]:px-3.5";
const metricTopClassName = "flex items-center justify-between gap-2.5 text-[11px] text-zinc-400 max-[520px]:flex-col max-[520px]:items-start max-[520px]:gap-1.25";
const meterClassName = "mt-[11px] h-[3px] overflow-hidden rounded-[3px] bg-white/[.07] [&>span]:block [&>span]:h-full [&>span]:rounded-[inherit] [&>span]:bg-[#9f8ac5] [&>span]:transition-[width] [&>span]:duration-300 [&>span[data-full]]:bg-amber-400 motion-reduce:[&>span]:transition-none";
const allowanceNoteClassName = "m-0 px-5 pb-4 text-[11px] leading-[1.6] text-zinc-400";
const quotaWarningClassName = "mx-5 mt-0 mb-4 rounded-[10px] border border-amber-400/18 bg-amber-400/[.05] p-3 text-xs leading-[1.6] text-amber-300";
const billingSectionHeaderClassName = "mb-[15px] flex flex-wrap items-center justify-between gap-4 [&_h2]:m-0 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:text-zinc-200 [&_p]:mt-1.25 [&_p]:mb-0 [&_p]:text-xs [&_p]:text-zinc-500";
const billingControlsClassName = "m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0 disabled:opacity-[.58] disabled:[&_button]:cursor-not-allowed";
const billingSegmentedControlClassName = "[--control-height-sm:28px] [--text-sm:11px] [--radius-control:10px] [--surface-muted:#0b0b0b] [--surface:#202020] [--border:rgb(255_255_255/.08)] [&_button]:min-h-7 [&_button]:text-[11px]";
const planGridClassName = "grid grid-cols-4 max-[900px]:grid-cols-2";
const planOptionClassName = "min-w-0 border-r border-white/[.08] px-5 py-[18px] last:border-r-0 data-current:bg-white/[.02] data-recommended:bg-[#9d81ce]/[.07] data-recommended:shadow-[inset_0_0_0_1px_rgb(157_129_206/.32)] max-[900px]:nth-2:border-r-0 max-[900px]:nth-[-n+2]:border-b max-[900px]:nth-[-n+2]:border-white/[.08] max-[520px]:px-3.5";
const optionTitleClassName = "flex flex-wrap items-center justify-between gap-1.25 [&_h3]:m-0 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-zinc-200";
const optionDescriptionClassName = "mt-1.5 mb-[13px] text-[11px] text-zinc-500 max-[520px]:min-h-7 max-[520px]:leading-[1.4]";
const optionPriceClassName = "mt-0 mb-3.5 flex items-baseline gap-1.25 [&_strong]:text-2xl [&_strong]:font-medium [&_strong]:tracking-[-.03em] [&_strong]:text-zinc-100 [&_strong]:tabular-nums [&_span]:text-[11px] [&_span]:text-zinc-500 max-[520px]:[&_strong]:text-[21px]";
const comparisonClassName = "w-full min-w-[640px] table-fixed border-collapse text-left text-[11px] [&_th]:px-5 [&_th]:py-2.25 [&_th]:font-normal [&_td]:px-5 [&_td]:py-2.25 [&_td]:text-zinc-300 [&_td]:tabular-nums [&_th:first-child]:w-[24%] [&_thead_th]:pt-[15px] [&_thead_th]:pb-[13px] [&_thead_th]:text-zinc-400 [&_tbody_th]:text-zinc-400 [&_tbody:last-child_tr:last-child>*]:pb-[18px]";
const billingSkeletonClassName = "flex animate-pulse flex-col gap-6 motion-reduce:animate-none";
const skeletonOverviewClassName = "flex h-[156px] items-start gap-[30px] rounded-[14px] border border-white/[.08] p-5 [&>span]:h-[30px] [&>span]:w-[130px] [&>span]:rounded-md [&>span]:bg-white/[.05]";
const skeletonPlansClassName = "grid grid-cols-4 gap-[30px] rounded-[14px] border border-white/[.08] p-5 [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&>div]:gap-3.5 [&_span]:h-4 [&_span]:w-4/5 [&_span]:rounded-[5px] [&_span]:bg-white/[.05] [&_span:last-child]:mt-[7px] [&_span:last-child]:h-10 [&_span:last-child]:w-full max-[520px]:grid-cols-2";

const PUBLIC_PLANS = ["free", "ray", "beam", "pulse"] as const;
const PLAN_TIERS: Record<string, number> = { free: 0, ray: 1, beam: 2, pulse: 3, unlimited: 4 };
const PLAN_DESCRIPTIONS = { free: "Testing & experimenting", ray: "Solo developers & small teams", beam: "Teams shipping to production", pulse: "High-scale workloads" } as const;
const INTERVAL_OPTIONS = [{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly", accessory: <span className="text-[9px] text-[#a3bda9]">2 months free</span> }];
const CURRENCY_OPTIONS = [{ value: "USD", label: "USD" }, { value: "NGN", label: "NGN" }];

export function BillingUsageMetric({ label, value, limit, plan, formatValue = (n: number) => n.toLocaleString("en-US") }: { label: string; value?: number; limit?: number; plan: string; formatValue?: (n: number) => string }) {
  const { actual, unlimited, percentage } = billingUsageSummary(value, limit, plan);
  return <div className={metricClassName}>
    <div className={metricTopClassName}><span>{label}</span><span className="whitespace-nowrap text-zinc-200 tabular-nums">{actual === undefined ? "—" : formatValue(actual)}<span className="text-zinc-500">{unlimited ? " / Unlimited" : limit === undefined ? "" : ` / ${formatValue(limit)}`}</span></span></div>
    {percentage === undefined ? <p className="mt-[7px] mb-0 text-[10px] leading-none text-zinc-500">{unlimited ? "No plan limit" : limit === 0 ? "Not included in this plan" : "Usage unavailable"}</p> : <div className={meterClassName} role="meter" aria-label={`${label} usage`} aria-valuenow={Math.min(actual!, limit!)} aria-valuemin={0} aria-valuemax={limit} aria-valuetext={`${formatValue(actual!)} of ${formatValue(limit!)}`}><span style={{ width: `${percentage}%` }} data-full={percentage >= 100 || undefined} /></div>}
  </div>;
}
export function BillingOverview({ subscription, usage, onManage, busy = false }: { subscription: BillingSubscription | null; usage?: BillingUsage; onManage: () => void; busy?: boolean }) {
  const plan = subscription?.plan || "free";
  const knownPlan = knownBillingPlan(plan);
  const config = knownPlan ? SUBSCRIPTION_PLANS[knownPlan] : undefined;
  const interval = subscription?.billingInterval === "year" ? "year" : "month";
  const currency = subscription?.paymentProvider === "paystack" ? "NGN" : "USD";
  const paid = plan !== "free";
  const status = !paid ? "Free plan" : subscription?.cancelAtPeriodEnd ? "Cancels at period end" : subscription?.status === "active" ? "Active" : (subscription?.status || "Not active").replaceAll("_", " ");
  return <section className={billingPanelClassName} aria-labelledby="current-plan-heading">
    <div className={billingOverviewClassName}>
      <div className={planIdentityClassName}><span className="grid size-9 place-items-center rounded-[11px] border border-white/[.08] text-zinc-400"><CreditCard size={18} aria-hidden="true" /></span><div><p className="mt-0 mr-0 mb-1.25 ml-0 text-[11px] text-zinc-500">Current plan</p><div className={planNameClassName}><h2 id="current-plan-heading">{config?.name || plan}</h2><span className="inline-flex items-center gap-1.25 text-[11px] text-zinc-400 capitalize before:size-1.25 before:rounded-full before:bg-zinc-500 before:content-[''] data-active:before:bg-emerald-300" data-active={!paid || subscription?.status === "active" || undefined}>{status}</span></div></div></div>
      <div className={currentPriceClassName}><strong>{knownPlan ? formatBillingPrice(knownPlan, interval, currency) : "—"}</strong><span>{interval === "year" ? "/ year" : "/ month"}</span></div>
      {paid ? <ArcButton type="button" variant="secondary" size="md" disabled={busy} onClick={onManage}>Manage subscription<ArrowUpRight size={14} aria-hidden="true" /></ArcButton> : <span className="text-[11px] text-zinc-500">No payment method required</span>}
    </div>
    {paid ? <dl className={billingDetailsClassName}><div><dt>{subscription?.cancelAtPeriodEnd ? "Access until" : "Next renewal"}</dt><dd>{formatBillingDate(subscription?.currentPeriodEnd)}</dd></div><div><dt>Billing cycle</dt><dd>{interval === "year" ? "Yearly" : "Monthly"}</dd></div><div><dt>Payment provider</dt><dd>{subscription?.paymentProvider === "paystack" ? "Paystack · NGN" : "Polar · USD"}</dd></div></dl> : null}
    <div className={usageHeaderClassName}><h3>Current usage</h3><span>Resources and monthly usage in this organization</span></div>
    <div className="grid grid-cols-4 max-[900px]:grid-cols-2">
      <BillingUsageMetric label="Active tunnels" value={usage?.tunnels} limit={config?.features.maxTunnels} plan={plan} />
      <BillingUsageMetric label="Custom domains" value={usage?.domains} limit={config?.features.maxDomains} plan={plan} />
      <BillingUsageMetric label="Subdomains" value={usage?.subdomains} limit={config?.features.maxSubdomains} plan={plan} />
      <BillingUsageMetric label="Member seats" value={usage?.members === undefined ? undefined : usage.members + (usage.reservedMemberSeats ?? 0)} limit={config?.features.maxMembers} plan={plan} />
      <BillingUsageMetric label="Uptime monitors" value={usage?.uptimeMonitors} limit={config?.features.maxUptimeMonitors} plan={plan} />
      <BillingUsageMetric label="Status pages" value={usage?.statusPages} limit={config?.features.maxStatusPages} plan={plan} />
      <BillingUsageMetric label="Alert rules" value={usage?.observabilityAlerts} limit={config?.features.maxObservabilityAlerts} plan={plan} />
      <BillingUsageMetric label="Secret vaults" value={usage?.secretVaults} limit={config?.features.maxSecretVaults} plan={plan} />
      <BillingUsageMetric label="Active secret entries" value={usage?.secretEntries} limit={config?.features.maxSecretEntries} plan={plan} />
      <BillingUsageMetric label="Tunnel bandwidth" value={usage?.bandwidthBytes} limit={config?.features.bandwidthPerMonth} plan={plan} formatValue={formatBillingBytes} />
      <BillingUsageMetric label="Telemetry this month" value={usage?.telemetryBytes} limit={config?.features.telemetryBytesPerMonth} plan={plan} formatValue={formatBillingBytes} />
    </div>
    {(usage?.reservedMemberSeats ?? 0) > 0 ? <p className={allowanceNoteClassName}>{usage!.reservedMemberSeats} member {usage!.reservedMemberSeats === 1 ? "seat is" : "seats are"} reserved by invitations. Cancelling or expiring an invitation releases its seat.</p> : null}
    <p className={allowanceNoteClassName}>Monthly allowances reset on the first day of each month (UTC), including yearly subscriptions.</p>
    {config && (usage?.telemetryBytes ?? 0) >= config.features.telemetryBytesPerMonth * .8 && config.features.telemetryBytesPerMonth > 0 ? <p className={quotaWarningClassName} role="status">{(usage?.telemetryBytes ?? 0) >= config.features.telemetryBytesPerMonth ? "Telemetry allowance reached. New ingestion is paused until the monthly reset or a plan upgrade. Existing data remains available within its retention period." : "You have used at least 80% of this month’s telemetry allowance. Upgrade before it runs out to keep ingestion uninterrupted."}</p> : null}
    {config && (usage?.bandwidthBytes ?? 0) >= config.features.bandwidthPerMonth * .8 ? <p className={quotaWarningClassName} role="status">{(usage?.bandwidthBytes ?? 0) >= config.features.bandwidthPerMonth ? "Tunnel bandwidth allowance reached. Traffic is restricted until the monthly reset or a plan upgrade." : "You have used at least 80% of this month’s tunnel bandwidth allowance."}</p> : null}
  </section>;
}
type PlanFeatures = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlan]["features"];
const bandwidth = (bytes: number) => { const gb = bytes / 1024 ** 3; return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`; };
const limitText = (value: number) => value === -1 ? "Unlimited" : value.toLocaleString("en-US");
const COMPARISON_GROUPS: { name: string; rows: { label: string; value: (features: PlanFeatures) => ReactNode }[] }[] = [
  { name: "Capacity", rows: [{ label: "Active tunnels", value: f => limitText(f.maxTunnels) }, { label: "Custom domains", value: f => f.customDomains ? limitText(f.maxDomains) : "Not included" }, { label: "Subdomains", value: f => limitText(f.maxSubdomains) }, { label: "Team members", value: f => limitText(f.maxMembers) }, { label: "Monthly bandwidth", value: f => bandwidth(f.bandwidthPerMonth) }] },
  { name: "Included", rows: [{ label: "Request retention", value: f => `${f.retentionDays} days` }, { label: "Priority support", value: f => f.prioritySupport ? "Included" : "Not included" }] },
  { name: "Observability", rows: [{ label: "Monthly telemetry", value: f => bandwidth(f.telemetryBytesPerMonth) }, { label: "Alert rules", value: f => limitText(f.maxObservabilityAlerts) }] },
  { name: "Secrets", rows: [{ label: "Vaults", value: f => limitText(f.maxSecretVaults) }, { label: "Environments per vault", value: f => limitText(f.maxSecretEnvironments) }, { label: "Active secret entries", value: f => limitText(f.maxSecretEntries) }] },
  { name: "Uptime", rows: [{ label: "Monitors", value: f => limitText(f.maxUptimeMonitors) }, { label: "Check frequency", value: () => "60 seconds" }, { label: "Status pages", value: f => limitText(f.maxStatusPages) }, { label: "Status custom domain", value: f => f.statusCustomDomains ? "Included" : "Not included" }] },
];
export function BillingPlanComparison({ currentPlan, currentInterval, currency, interval, checkoutPlan, checkoutDisabled, onCheckout }: { currentPlan: string; currentInterval: BillingInterval; currency: BillingCurrency; interval: BillingInterval; checkoutPlan?: PaidBillingPlan | null; checkoutDisabled?: boolean; onCheckout: (plan: PaidBillingPlan) => void }) {
  return <div className={billingPanelClassName}>
    <div className={planGridClassName}>{PUBLIC_PLANS.map(plan => {
      const config = SUBSCRIPTION_PLANS[plan];
      const current = currentPlan === plan && currentInterval === interval;
      const downgrade = PLAN_TIERS[plan] < PLAN_TIERS[currentPlan];
      const recommended = plan === "beam" && !downgrade;
      return <article key={plan} className={planOptionClassName} data-current={current || undefined} data-recommended={recommended || undefined}>
        <div className={optionTitleClassName}><h3>{config.name}</h3>{recommended ? <span className="rounded-[5px] border border-[#9d81ce]/24 bg-[#9d81ce]/15 px-1.5 py-[3px] text-[10px] leading-[1.4] font-medium text-[#d8c7f5]">Recommended</span> : null}</div>
        <p className={optionDescriptionClassName}>{PLAN_DESCRIPTIONS[plan]}</p>
        <p className={optionPriceClassName}><strong>{formatBillingPrice(plan, interval, currency)}</strong><span>/{interval === "year" ? "year" : "month"}</span></p>
        <ArcButton type="button" variant={current || plan === "free" ? "secondary" : recommended ? "primary" : "secondary"} size="md" className="w-full" loading={checkoutPlan === plan} disabled={current || plan === "free" || checkoutDisabled || Boolean(checkoutPlan && checkoutPlan !== plan)} onClick={() => { if (plan !== "free") onCheckout(plan); }}>{current ? "Current plan" : plan === "free" ? "Free plan" : checkoutPlan === plan ? "Opening checkout…" : `${downgrade ? "Downgrade to" : "Choose"} ${config.name}`}</ArcButton>
      </article>;
    })}</div>
    <div className="overflow-x-auto border-t border-white/[.08]" role="region" aria-label="Compare plan features" tabIndex={0}>
      <table className={comparisonClassName}><caption className="sr-only">Plan capacity and included features</caption><thead><tr><th scope="col">Plan features</th>{PUBLIC_PLANS.map(plan => <th scope="col" key={plan}>{SUBSCRIPTION_PLANS[plan].name}</th>)}</tr></thead>{COMPARISON_GROUPS.map(group => <tbody key={group.name}><tr className="[&_th]:pt-3.5! [&_th]:pb-2! [&_th]:text-[10px]! [&_th]:text-zinc-500!"><th colSpan={5} scope="colgroup">{group.name}</th></tr>{group.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{PUBLIC_PLANS.map(plan => <td key={plan}>{row.value(SUBSCRIPTION_PLANS[plan].features)}</td>)}</tr>)}</tbody>)}</table>
    </div>
  </div>;
}
export function BillingContent({ subscription, usage, currency, interval, showPaystack, checkoutPlan, checkoutDisabled, onCurrencyChange, onIntervalChange, onCheckout, onManage }: { subscription: BillingSubscription | null; usage?: BillingUsage; currency: BillingCurrency; interval: BillingInterval; showPaystack: boolean; checkoutPlan?: PaidBillingPlan | null; checkoutDisabled?: boolean; onCurrencyChange: (currency: BillingCurrency) => void; onIntervalChange: (interval: BillingInterval) => void; onCheckout: (plan: PaidBillingPlan) => void; onManage: () => void }) {
  const currentPlan = subscription?.plan || "free";
  const currentInterval = subscription?.billingInterval === "year" ? "year" : "month";
  const locked = currentPlan !== "free" && subscription?.status === "active";
  return <div className={billingContentClassName}>
    <BillingOverview subscription={subscription} usage={usage} onManage={onManage} busy={Boolean(checkoutPlan)} />
    <section aria-labelledby="available-plans-heading">
      <div className={billingSectionHeaderClassName}><div><h2 id="available-plans-heading">Plans</h2><p>Choose capacity that matches your workload.</p></div><fieldset className={billingControlsClassName} disabled={locked || Boolean(checkoutPlan)} aria-label="Billing options" aria-describedby={locked ? "billing-options-locked" : undefined}>
        <SegmentedControl className={billingSegmentedControlClassName} label="Billing interval" options={INTERVAL_OPTIONS} value={interval} onValueChange={value => { if (!locked && !checkoutPlan) onIntervalChange(value as BillingInterval); }} />
        {showPaystack ? <SegmentedControl className={billingSegmentedControlClassName} label="Billing currency" options={CURRENCY_OPTIONS} value={currency} onValueChange={value => { if (!locked && !checkoutPlan) onCurrencyChange(value as BillingCurrency); }} /> : null}
      </fieldset></div>
      {locked ? <p id="billing-options-locked" className="mt-[-3px] mb-3.5 flex items-start gap-[7px] text-[11px] leading-[1.6] text-zinc-500 [&_svg]:mt-0.5 [&_svg]:shrink-0"><LockKeyhole size={12} aria-hidden="true" />Your active subscription uses {currency} and {interval === "year" ? "yearly" : "monthly"} billing. Cancel it to change these options.</p> : null}
      <BillingPlanComparison currentPlan={currentPlan} currentInterval={currentInterval} currency={currency} interval={interval} checkoutPlan={checkoutPlan} checkoutDisabled={checkoutDisabled} onCheckout={onCheckout} />
    </section>
  </div>;
}
export function BillingSkeleton() {
  return <div className={billingSkeletonClassName} role="status" aria-label="Loading billing" aria-busy="true"><div className={skeletonOverviewClassName}><span /><span /><span /></div><div className={skeletonPlansClassName}>{PUBLIC_PLANS.map(plan => <div key={plan}><span /><span /><span /></div>)}</div><p className="sr-only">Loading your subscription and usage…</p></div>;
}
