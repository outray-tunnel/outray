import emailDesign from "./email-template";

/** Serializable event data only: no recipients, credentials, or payment tokens. */
export type ProductEmailEvent =
  | {
      kind: "usage-warning";
      metric: "bandwidth" | "telemetry";
      threshold: 80 | 100;
      usedBytes: number;
      limitBytes: number;
      resetsAt: string;
    }
  | {
      kind: "payment-failed";
      plan: string;
      amountMinor: number;
      currency: string;
      provider: "paystack" | "polar";
      periodEnd: string | null;
    }
  | {
      kind: "subscription-change";
      change: "activated" | "plan-changed" | "cancellation-scheduled" | "cancellation-reversed" | "ended";
      plan: string;
      previousPlan?: string;
      effectiveAt: string | null;
    };

export interface ProductEmailContext {
  organizationName: string;
  billingUrl: string;
  assetBaseUrl: string;
}

function invalid(field: string): never {
  throw new Error(`Invalid product email event: ${field}`);
}

function boundedString(value: unknown, field: string, maximum = 80): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    return invalid(field);
  }
  return value.trim();
}

function byteAmount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid(field);
  return value;
}

function timestamp(value: unknown, field: string): string {
  // Require an explicit zone; Date.parse alone accepts locale-dependent and overflowing dates.
  if (typeof value !== "string" || value.length > 35) return invalid(field);
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!parts) return invalid(field);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || (zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4, 6)) > 59))) {
    return invalid(field);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return invalid(field);
  return date.toISOString();
}

function nullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : timestamp(value, field);
}

/** Validate persisted JSON before dispatch. Unknown fields are deliberately discarded. */
export function parseProductEmailEvent(value: unknown): ProductEmailEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("payload");
  const event = value as Record<string, unknown>;
  if (event.kind === "usage-warning") {
    if (event.metric !== "bandwidth" && event.metric !== "telemetry") return invalid("metric");
    if (event.threshold !== 80 && event.threshold !== 100) return invalid("threshold");
    return {
      kind: event.kind,
      metric: event.metric,
      threshold: event.threshold,
      usedBytes: byteAmount(event.usedBytes, "usedBytes"),
      limitBytes: byteAmount(event.limitBytes, "limitBytes"),
      resetsAt: timestamp(event.resetsAt, "resetsAt"),
    };
  }
  if (event.kind === "payment-failed") {
    if (event.provider !== "paystack" && event.provider !== "polar") return invalid("provider");
    if (typeof event.currency !== "string" || !/^[A-Z]{3}$/.test(event.currency)) return invalid("currency");
    return {
      kind: event.kind,
      plan: boundedString(event.plan, "plan"),
      amountMinor: byteAmount(event.amountMinor, "amountMinor"),
      currency: event.currency,
      provider: event.provider,
      periodEnd: nullableTimestamp(event.periodEnd, "periodEnd"),
    };
  }
  if (event.kind === "subscription-change") {
    if (event.change !== "activated" && event.change !== "plan-changed" && event.change !== "cancellation-scheduled"
      && event.change !== "cancellation-reversed" && event.change !== "ended") return invalid("change");
    return {
      kind: event.kind,
      change: event.change,
      plan: boundedString(event.plan, "plan"),
      ...(event.previousPlan === undefined ? {} : { previousPlan: boundedString(event.previousPlan, "previousPlan") }),
      effectiveAt: nullableTimestamp(event.effectiveAt, "effectiveAt"),
    };
  }
  return invalid("kind");
}

function utcDate(value: string): string {
  return `${new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString("en-US")} B`;
  const units = ["KiB", "MiB", "GiB", "TiB", "PiB"];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length);
  return `${(value / 1024 ** exponent).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${units[exponent - 1]}`;
}

function planName(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function money(amountMinor: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code" });
  const decimals = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** decimals);
}

export function renderProductEmail(input: ProductEmailEvent, context: ProductEmailContext): { subject: string; html: string } {
  const event = parseProductEmailEvent(input);
  const organization = boundedString(context.organizationName, "organizationName", 200);
  const footerHtml = emailDesign.footnote(`This is an account notification for ${organization}.`);
  const common = {
    assetBaseUrl: context.assetBaseUrl,
    footerHtml,
    action: { label: "Review billing", url: context.billingUrl },
  };

  if (event.kind === "usage-warning") {
    const bandwidth = event.metric === "bandwidth";
    const metric = bandwidth ? "bandwidth" : "telemetry";
    const label = bandwidth ? "Bandwidth" : "Telemetry";
    const exhausted = event.threshold === 100;
    const subject = `${label} ${exhausted ? "limit reached" : "usage at 80%"} — ${organization}`;
    const explanation = bandwidth
      ? "Tunnel requests may stop when your monthly bandwidth allowance is exhausted. Upgrade your plan or wait for the allowance to reset."
      : "New telemetry batches may be rejected when they exceed your remaining monthly allowance. Upgrade your plan or wait for the allowance to reset.";
    return {
      subject,
      html: emailDesign.renderEmail({
        ...common,
        title: exhausted ? `${label} limit\nreached.` : `${label} is\nrunning low.`,
        preheader: `${organization} has used at least ${event.threshold}% of its monthly ${metric} allowance.`,
        label: exhausted ? "Usage limit" : "Usage warning",
        tone: exhausted ? "danger" : "accent",
        bodyHtml: emailDesign.paragraph(`${organization} has used at least ${event.threshold}% of its monthly ${metric} allowance.`)
          + emailDesign.details([
            ["Used", formatBytes(event.usedBytes)],
            ["Monthly allowance", formatBytes(event.limitBytes)],
            ["Resets", utcDate(event.resetsAt)],
          ])
          + emailDesign.paragraph(explanation),
      }),
    };
  }

  if (event.kind === "payment-failed") {
    const rows: Array<[string, string]> = [
      ["Organization", organization],
      ["Plan", planName(event.plan)],
      ["Payment amount", money(event.amountMinor, event.currency)],
      ["Payment provider", event.provider === "paystack" ? "Paystack" : "Polar"],
    ];
    if (event.periodEnd) rows.push(["Billing period end", utcDate(event.periodEnd)]);
    return {
      subject: `Subscription payment failed — ${organization}`,
      html: emailDesign.renderEmail({
        ...common,
        title: "Your payment\ndidn’t go through.",
        preheader: `Review the subscription payment for ${organization}.`,
        label: "Payment failed",
        tone: "danger",
        bodyHtml: emailDesign.paragraph(`We couldn’t collect the subscription payment for ${organization}. Review your billing details and payment status.`)
          + emailDesign.details(rows)
          + emailDesign.paragraph("Your billing page shows the current subscription status and available payment options."),
      }),
    };
  }

  const plan = planName(event.plan);
  const date = event.effectiveAt ? utcDate(event.effectiveAt) : null;
  const presentation = {
    activated: {
      subject: "Subscription activated",
      title: "Your subscription\nis active.",
      label: "Subscription active",
      tone: "success" as const,
      message: `${organization} is now on the ${plan} plan. Review billing for your subscription details.`,
    },
    "plan-changed": {
      subject: "Subscription plan changed",
      title: "Your plan\nhas changed.",
      label: "Plan changed",
      tone: "accent" as const,
      message: `${organization} is now on the ${plan} plan. Review billing for your updated subscription details.`,
    },
    "cancellation-scheduled": {
      subject: "Subscription cancellation scheduled",
      title: "Cancellation\nscheduled.",
      label: "Cancellation scheduled",
      tone: "neutral" as const,
      message: date
        ? `The ${plan} subscription for ${organization} is scheduled to end on ${date}. Your current plan remains available until then.`
        : `Cancellation of the ${plan} subscription for ${organization} has been scheduled. Review billing for the effective date and current subscription status.`,
    },
    "cancellation-reversed": {
      subject: "Subscription cancellation reversed",
      title: "Your subscription\nwill continue.",
      label: "Cancellation reversed",
      tone: "success" as const,
      message: `The scheduled cancellation of the ${plan} subscription for ${organization} has been removed. Review billing for your renewal details.`,
    },
    ended: {
      subject: "Subscription ended",
      title: "Your subscription\nhas ended.",
      label: "Subscription ended",
      tone: "neutral" as const,
      message: `The ${plan} subscription for ${organization} has ended. Review billing to see your current plan and available options.`,
    },
  }[event.change];
  const rows: Array<[string, string]> = [["Organization", organization], ["Plan", plan]];
  if (event.change === "plan-changed" && event.previousPlan) rows.push(["Previous plan", planName(event.previousPlan)]);
  if (date) rows.push(["Effective date", date]);
  return {
    subject: `${presentation.subject} — ${organization}`,
    html: emailDesign.renderEmail({
      ...common,
      title: presentation.title,
      preheader: presentation.message,
      label: presentation.label,
      tone: presentation.tone,
      bodyHtml: emailDesign.paragraph(presentation.message) + emailDesign.details(rows),
    }),
  };
}

export default { parseProductEmailEvent, renderProductEmail };
