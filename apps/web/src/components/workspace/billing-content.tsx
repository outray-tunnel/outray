import type { ReactNode } from "react";
import { ArrowUpRight, CreditCard, LockKeyhole } from "lucide-react";
import { Button as ArcButton } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SUBSCRIPTION_PLANS, type BillingInterval, type SubscriptionPlan } from "@/lib/subscription-plans";
import { billingUsageSummary, formatBillingDate, formatBillingPrice, knownBillingPlan, type BillingCurrency, type BillingSubscription, type BillingUsage, type PaidBillingPlan } from "./billing-state";
import styles from "./billing-content.module.css";

const PUBLIC_PLANS = ["free", "ray", "beam", "pulse"] as const;
const PLAN_TIERS: Record<string, number> = { free: 0, ray: 1, beam: 2, pulse: 3, unlimited: 4 };
const PLAN_DESCRIPTIONS = { free: "Testing & experimenting", ray: "Solo developers & small teams", beam: "Teams shipping to production", pulse: "High-scale workloads" } as const;
const INTERVAL_OPTIONS = [{ value: "month", label: "Monthly" }, { value: "year", label: "Yearly", accessory: <span className={styles.savings}>2 months free</span> }];
const CURRENCY_OPTIONS = [{ value: "USD", label: "USD" }, { value: "NGN", label: "NGN" }];

export function BillingUsageMetric({ label, value, limit, plan }: { label: string; value?: number; limit?: number; plan: string }) {
  const { actual, unlimited, percentage } = billingUsageSummary(value, limit, plan);
  return <div className={styles.metric}>
    <div className={styles.metricTop}><span>{label}</span><span className={styles.metricValue}>{actual === undefined ? "—" : actual.toLocaleString("en-US")}<span className={styles.metricLimit}>{unlimited ? " / Unlimited" : limit === undefined ? "" : ` / ${limit}`}</span></span></div>
    {percentage === undefined ? <p className={styles.metricHint}>{unlimited ? "No plan limit" : limit === 0 ? "Not included in this plan" : "Usage unavailable"}</p> : <div className={styles.meter} role="meter" aria-label={`${label} usage`} aria-valuenow={Math.min(actual!, limit!)} aria-valuemin={0} aria-valuemax={limit} aria-valuetext={`${actual} of ${limit}`}><span style={{ width: `${percentage}%` }} data-full={percentage >= 100 || undefined} /></div>}
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
  return <section className={styles.panel} aria-labelledby="current-plan-heading">
    <div className={styles.overview}>
      <div className={styles.planIdentity}><span className={styles.planIcon}><CreditCard size={18} aria-hidden="true" /></span><div><p className={styles.metadata}>Current plan</p><div className={styles.planName}><h2 id="current-plan-heading">{config?.name || plan}</h2><span className={styles.status} data-active={!paid || subscription?.status === "active" || undefined}>{status}</span></div></div></div>
      <div className={styles.currentPrice}><strong>{knownPlan ? formatBillingPrice(knownPlan, interval, currency) : "—"}</strong><span>{interval === "year" ? "/ year" : "/ month"}</span></div>
      {paid ? <ArcButton type="button" variant="secondary" size="md" disabled={busy} onClick={onManage}>Manage subscription<ArrowUpRight size={14} aria-hidden="true" /></ArcButton> : <span className={styles.noPayment}>No payment method required</span>}
    </div>
    {paid ? <dl className={styles.billingDetails}><div><dt>{subscription?.cancelAtPeriodEnd ? "Access until" : "Next renewal"}</dt><dd>{formatBillingDate(subscription?.currentPeriodEnd)}</dd></div><div><dt>Billing cycle</dt><dd>{interval === "year" ? "Yearly" : "Monthly"}</dd></div><div><dt>Payment provider</dt><dd>{subscription?.paymentProvider === "paystack" ? "Paystack · NGN" : "Polar · USD"}</dd></div></dl> : null}
    <div className={styles.usageHeader}><h3>Current usage</h3><span>Active resources in this organization</span></div>
    <div className={styles.usageGrid}>
      <BillingUsageMetric label="Active tunnels" value={usage?.tunnels} limit={config?.features.maxTunnels} plan={plan} />
      <BillingUsageMetric label="Custom domains" value={usage?.domains} limit={config?.features.maxDomains} plan={plan} />
      <BillingUsageMetric label="Subdomains" value={usage?.subdomains} limit={config?.features.maxSubdomains} plan={plan} />
      <BillingUsageMetric label="Members" value={usage?.members} limit={config?.features.maxMembers} plan={plan} />
    </div>
  </section>;
}
type PlanFeatures = (typeof SUBSCRIPTION_PLANS)[SubscriptionPlan]["features"];
const bandwidth = (bytes: number) => { const gb = bytes / 1024 ** 3; return gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`; };
const limitText = (value: number) => value === -1 ? "Unlimited" : value.toLocaleString("en-US");
const COMPARISON_GROUPS: { name: string; rows: { label: string; value: (features: PlanFeatures) => ReactNode }[] }[] = [
  { name: "Capacity", rows: [{ label: "Active tunnels", value: f => limitText(f.maxTunnels) }, { label: "Custom domains", value: f => f.customDomains ? limitText(f.maxDomains) : "Not included" }, { label: "Subdomains", value: f => limitText(f.maxSubdomains) }, { label: "Team members", value: f => limitText(f.maxMembers) }, { label: "Monthly bandwidth", value: f => bandwidth(f.bandwidthPerMonth) }] },
  { name: "Included", rows: [{ label: "Request retention", value: f => `${f.retentionDays} days` }, { label: "Priority support", value: f => f.prioritySupport ? "Included" : "Not included" }] },
];
export function BillingPlanComparison({ currentPlan, currentInterval, currency, interval, checkoutPlan, checkoutDisabled, onCheckout }: { currentPlan: string; currentInterval: BillingInterval; currency: BillingCurrency; interval: BillingInterval; checkoutPlan?: PaidBillingPlan | null; checkoutDisabled?: boolean; onCheckout: (plan: PaidBillingPlan) => void }) {
  return <div className={styles.panel}>
    <div className={styles.planGrid}>{PUBLIC_PLANS.map(plan => {
      const config = SUBSCRIPTION_PLANS[plan];
      const current = currentPlan === plan && currentInterval === interval;
      const downgrade = PLAN_TIERS[plan] < PLAN_TIERS[currentPlan];
      const recommended = plan === "beam" && !downgrade;
      return <article key={plan} className={styles.planOption} data-current={current || undefined} data-recommended={recommended || undefined}>
        <div className={styles.optionTitle}><h3>{config.name}</h3>{recommended ? <span className={styles.recommended}>Recommended</span> : null}</div>
        <p className={styles.optionDescription}>{PLAN_DESCRIPTIONS[plan]}</p>
        <p className={styles.optionPrice}><strong>{formatBillingPrice(plan, interval, currency)}</strong><span>/{interval === "year" ? "year" : "month"}</span></p>
        <ArcButton type="button" variant={current || plan === "free" ? "secondary" : recommended ? "primary" : "secondary"} size="md" className={styles.planAction} loading={checkoutPlan === plan} disabled={current || plan === "free" || checkoutDisabled || Boolean(checkoutPlan && checkoutPlan !== plan)} onClick={() => { if (plan !== "free") onCheckout(plan); }}>{current ? "Current plan" : plan === "free" ? "Free plan" : checkoutPlan === plan ? "Opening checkout…" : `${downgrade ? "Downgrade to" : "Choose"} ${config.name}`}</ArcButton>
      </article>;
    })}</div>
    <div className={styles.tableRegion} role="region" aria-label="Compare plan features" tabIndex={0}>
      <table className={styles.comparison}><caption className="sr-only">Plan capacity and included features</caption><thead><tr><th scope="col">Plan features</th>{PUBLIC_PLANS.map(plan => <th scope="col" key={plan}>{SUBSCRIPTION_PLANS[plan].name}</th>)}</tr></thead>{COMPARISON_GROUPS.map(group => <tbody key={group.name}><tr className={styles.groupRow}><th colSpan={5} scope="colgroup">{group.name}</th></tr>{group.rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{PUBLIC_PLANS.map(plan => <td key={plan}>{row.value(SUBSCRIPTION_PLANS[plan].features)}</td>)}</tr>)}</tbody>)}</table>
    </div>
  </div>;
}
export function BillingContent({ subscription, usage, currency, interval, showPaystack, checkoutPlan, checkoutDisabled, onCurrencyChange, onIntervalChange, onCheckout, onManage }: { subscription: BillingSubscription | null; usage?: BillingUsage; currency: BillingCurrency; interval: BillingInterval; showPaystack: boolean; checkoutPlan?: PaidBillingPlan | null; checkoutDisabled?: boolean; onCurrencyChange: (currency: BillingCurrency) => void; onIntervalChange: (interval: BillingInterval) => void; onCheckout: (plan: PaidBillingPlan) => void; onManage: () => void }) {
  const currentPlan = subscription?.plan || "free";
  const currentInterval = subscription?.billingInterval === "year" ? "year" : "month";
  const locked = currentPlan !== "free" && subscription?.status === "active";
  return <div className={styles.content}>
    <BillingOverview subscription={subscription} usage={usage} onManage={onManage} busy={Boolean(checkoutPlan)} />
    <section aria-labelledby="available-plans-heading">
      <div className={styles.sectionHeader}><div><h2 id="available-plans-heading">Plans</h2><p>Choose capacity that matches your workload.</p></div><fieldset className={styles.controls} disabled={locked || Boolean(checkoutPlan)} aria-label="Billing options" aria-describedby={locked ? "billing-options-locked" : undefined}>
        <SegmentedControl className={styles.intervalControl} label="Billing interval" options={INTERVAL_OPTIONS} value={interval} onValueChange={value => { if (!locked && !checkoutPlan) onIntervalChange(value as BillingInterval); }} />
        {showPaystack ? <SegmentedControl className={styles.currencyControl} label="Billing currency" options={CURRENCY_OPTIONS} value={currency} onValueChange={value => { if (!locked && !checkoutPlan) onCurrencyChange(value as BillingCurrency); }} /> : null}
      </fieldset></div>
      {locked ? <p id="billing-options-locked" className={styles.lockedNote}><LockKeyhole size={12} aria-hidden="true" />Your active subscription uses {currency} and {interval === "year" ? "yearly" : "monthly"} billing. Cancel it to change these options.</p> : null}
      <BillingPlanComparison currentPlan={currentPlan} currentInterval={currentInterval} currency={currency} interval={interval} checkoutPlan={checkoutPlan} checkoutDisabled={checkoutDisabled} onCheckout={onCheckout} />
    </section>
  </div>;
}
export function BillingSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="Loading billing" aria-busy="true"><div className={styles.skeletonOverview}><span /><span /><span /></div><div className={styles.skeletonPlans}>{PUBLIC_PLANS.map(plan => <div key={plan}><span /><span /><span /></div>)}</div><p className="sr-only">Loading your subscription and usage…</p></div>;
}
